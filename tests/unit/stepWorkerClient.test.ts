import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StepWorkerRequest, StepWorkerResponse } from "@/lib/stepMesh";

// Ein nachgebauter Worker: antwortet so, wie der Test es ihm vorgibt.
let reply: (request: StepWorkerRequest) => StepWorkerResponse | "crash";
let created = 0;
let terminated = 0;

class FakeWorker {
  onmessage: ((event: { data: StepWorkerResponse }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() {
    created += 1;
  }
  postMessage(request: StepWorkerRequest) {
    queueMicrotask(() => {
      const answer = reply(request);
      if (answer === "crash") this.onerror?.();
      else this.onmessage?.({ data: answer });
    });
  }
  terminate() {
    terminated += 1;
  }
}

describe("STEP worker client", () => {
  beforeEach(() => {
    vi.resetModules();
    created = 0;
    terminated = 0;
    vi.stubGlobal("window", {});
    vi.stubGlobal("Worker", FakeWorker);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("hands back the worker's mesh and keeps the worker for the next file", async () => {
    const { stepMeshOffThread } = await import("@/lib/stepWorkerClient");
    reply = (request) => ({ requestId: request.requestId, ok: true, mesh: { positions: new Float32Array([request.type === "import" ? request.buffer.byteLength : 0, 0, 0]), stepText: "ISO-10303-21;" } });
    const first = await stepMeshOffThread(new ArrayBuffer(4));
    const second = await stepMeshOffThread(new ArrayBuffer(8));
    expect(Array.from(first!.positions)).toEqual([4, 0, 0]);
    expect(Array.from(second!.positions)).toEqual([8, 0, 0]);
    expect(created).toBe(1);
  });

  it("keeps the page's bytes, which it needs if it has to read the file itself", async () => {
    const { stepMeshOffThread } = await import("@/lib/stepWorkerClient");
    let sent: ArrayBuffer | null = null;
    reply = (request) => {
      if (request.type === "import") sent = request.buffer;
      return { requestId: request.requestId, ok: true, mesh: { positions: new Float32Array(9) } };
    };
    const buffer = new Uint8Array([1, 2, 3]).buffer;
    await stepMeshOffThread(buffer);
    expect(sent).not.toBe(buffer);
    expect(buffer.byteLength).toBe(3);
  });

  it("passes a file that is no good straight on, without reading it again on the page", async () => {
    const { stepMeshOffThread } = await import("@/lib/stepWorkerClient");
    const { StepReadError } = await import("@/lib/stepMesh");
    reply = ({ requestId }) => ({ requestId, ok: false, failure: "read", message: "STEP file has no solid geometry to import" });
    await expect(stepMeshOffThread(new ArrayBuffer(4))).rejects.toBeInstanceOf(StepReadError);
  });

  it("lets the page read when the worker's kernel fails or the worker crashes, and starts a new one next time", async () => {
    const { stepMeshOffThread } = await import("@/lib/stepWorkerClient");
    reply = ({ requestId }) => ({ requestId, ok: false, failure: "kernel", message: "RuntimeError: memory access out of bounds" });
    expect(await stepMeshOffThread(new ArrayBuffer(4))).toBeNull();
    expect(terminated).toBe(1);
    reply = () => "crash";
    expect(await stepMeshOffThread(new ArrayBuffer(4))).toBeNull();
    expect(created).toBe(2);
  });

  it("hands back the written file, and says when there is nothing to write", async () => {
    const { stepExportOffThread } = await import("@/lib/stepWorkerClient");
    const { StepExportEmptyError } = await import("@/lib/stepExportCore");
    const blob = new Blob(["ISO-10303-21;"]);
    reply = ({ requestId }) => ({ requestId, ok: true, exported: { blob, exportedCount: 1, skipped: [] } });
    expect(await stepExportOffThread([])).toEqual({ blob, exportedCount: 1, skipped: [] });
    reply = ({ requestId }) => ({ requestId, ok: false, failure: "empty", message: "No exportable B-Rep solids in this project" });
    await expect(stepExportOffThread([])).rejects.toBeInstanceOf(StepExportEmptyError);
  });

  it("reads on the page where there are no workers", async () => {
    vi.stubGlobal("Worker", undefined);
    const { stepMeshOffThread } = await import("@/lib/stepWorkerClient");
    expect(await stepMeshOffThread(new ArrayBuffer(4))).toBeNull();
  });
});
