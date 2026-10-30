import { beforeAll, describe, expect, it, vi } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { WorkplaneShape } from "@/types/sketchforge";
import type { StepWorkerRequest, StepWorkerResponse } from "@/lib/stepMesh";

// Der STEP-Worker, wie er im Browser laeuft: er laedt den Kern selbst aus den
// Dateien in public/occt (dieselben, die die Seite ausliefert). Nur `self` ist
// nachgebaut. Verglichen wird mit dem Weg ueber die Seite.
const OCCT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../apps/web/public/occt");

vi.mock("@/lib/cadModifierRuntime", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/cadModifierRuntime")>()),
  CAD_MODIFIER_RUNTIME_BASE: `file://${OCCT_DIR}`,
}));

vi.mock("@/lib/brepKernel", async () => {
  const brep = await import("brepjs");
  const { OcctKernel } = await import("occt-wasm");
  const wasm = join(dirname(fileURLToPath(import.meta.resolve("occt-wasm"))), "occt-wasm.wasm");
  let ready: Promise<typeof brep> | null = null;
  return {
    loadBrepWithOcct: () =>
      (ready ??= (async () => {
        const kernel = await OcctKernel.init({ wasm });
        brep.registerKernel("occt-wasm", brep.OcctWasmAdapter.fromKernel(kernel));
        return brep;
      })()),
  };
});

const answers = new Map<number, (response: StepWorkerResponse) => void>();
let onmessage: (event: { data: StepWorkerRequest }) => Promise<void>;

function ask(request: StepWorkerRequest) {
  return new Promise<StepWorkerResponse>((resolve) => {
    answers.set(request.requestId, resolve);
    void onmessage({ data: request });
  });
}

function box(overrides: Partial<WorkplaneShape>): WorkplaneShape {
  return { id: Math.random().toString(36).slice(2), name: "Box", kind: "box", color: "#0098c7", x: 0, z: 0, size: 10, width: 10, depth: 10, height: 10, rotation: 0, ...overrides };
}

beforeAll(async () => {
  const fakeSelf: { onmessage: typeof onmessage | null; postMessage: (message: StepWorkerResponse) => void } = {
    onmessage: null,
    postMessage: (message) => answers.get(message.requestId)?.(message),
  };
  vi.stubGlobal("self", fakeSelf);
  await import("@/workers/step.worker");
  onmessage = fakeSelf.onmessage!;
}, 60000);

describe("STEP worker (real kernel, loaded the worker's way)", () => {
  it("writes a design and reads it back, the same as the page", async () => {
    const { exportShapesWithBrep } = await import("@/lib/stepExportCore");
    const { loadBrepWithOcct } = await import("@/lib/brepKernel");
    const { importedShapeFromStepMesh } = await import("@/lib/stepImport");
    const shapes = [box({ x: -20, width: 12, depth: 8, height: 5 }), box({ kind: "cylinder", name: "Cyl", x: 15, width: 8, depth: 8, height: 12 })];

    const written = await ask({ requestId: 1, type: "export", shapes });
    expect(written.ok && "exported" in written).toBe(true);
    if (!written.ok || !("exported" in written)) return;
    expect(written.exported.exportedCount).toBe(2);
    expect(written.exported.skipped).toEqual([]);
    const onPage = await exportShapesWithBrep(await loadBrepWithOcct(), shapes);
    const brep = await loadBrepWithOcct();
    const volumeOf = async (blob: Blob) => {
      const read = await brep.importSTEP(blob);
      if (!read.ok) throw new Error("reimport failed");
      const volume = brep.measureVolume(read.value);
      if (!volume.ok) throw new Error("volume failed");
      return volume.value;
    };
    const expected = 12 * 8 * 5 + Math.PI * 16 * 12;
    expect(await volumeOf(written.exported.blob)).toBeCloseTo(expected, 3);
    expect(await volumeOf(onPage.blob)).toBeCloseTo(expected, 3);

    const buffer = await written.exported.blob.arrayBuffer();
    const read = await ask({ requestId: 2, type: "import", buffer });
    expect(read.ok && "mesh" in read).toBe(true);
    if (!read.ok || !("mesh" in read)) return;
    const { stepMeshFromBuffer } = await import("@/lib/stepMesh");
    const pageMesh = await stepMeshFromBuffer(brep, buffer);
    expect(Array.from(read.mesh.positions)).toEqual(Array.from(pageMesh.positions));
    expect(read.mesh.stepText).toBeTruthy();
    const shape = importedShapeFromStepMesh("two.step", read.mesh);
    expect(shape.importedMesh?.brepStep).toBe(read.mesh.stepText);
  }, 120000);

  it("says a design with nothing to write is empty, so the page does not try again", async () => {
    const answer = await ask({ requestId: 3, type: "export", shapes: [box({ kind: "text" as WorkplaneShape["kind"] })] });
    expect(answer).toMatchObject({ ok: false, failure: "empty" });
  });

  it("says a file with no body is no good, so the page does not try again", async () => {
    const answer = await ask({ requestId: 4, type: "import", buffer: new TextEncoder().encode("not a step file").buffer });
    expect(answer).toMatchObject({ ok: false, failure: "read" });
  });
});
