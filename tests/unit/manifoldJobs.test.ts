import { beforeAll, describe, expect, it, vi } from "vitest";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import manifoldModule from "manifold-3d";
import type { ManifoldToplevel } from "manifold-3d";
import { manifoldPositions, runManifoldJob, type ManifoldOperand } from "@/lib/manifoldJobs";
import type { ManifoldWorkerRequest, ManifoldWorkerResponse } from "@/lib/manifoldWorkerClient";

let runtime: ManifoldToplevel;

beforeAll(async () => {
  runtime = await manifoldModule();
  runtime.setup();
});

/** Eine Kugel als Netz-Operand, wie ein eingelesenes STL ankommt. */
function sphereOperand(segments: number): ManifoldOperand {
  const mesh = runtime.Manifold.sphere(20, segments).getMesh();
  return { kind: "mesh", vertProperties: Float32Array.from(mesh.vertProperties), triVerts: Uint32Array.from(mesh.triVerts) };
}

// Zylinder mit Radius 5 und 60 lang, als Grundkoerper mit Matrix (spaltenweise wie three).
const cylinderMatrix = [5, 0, 0, 0, 0, 0, -5, 0, 0, 60, 0, 0, 0, 0, 0, 1];
const cylinder: ManifoldOperand = { kind: "cylinder", topRadiusScale: 1, sides: 48, matrix: cylinderMatrix };

function volumeOf(positions: Float32Array) {
  let volume = 0;
  for (let i = 0; i < positions.length; i += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = positions.subarray(i, i + 9);
    volume += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  }
  return volume;
}

describe("manifold jobs", () => {
  it("cuts a cylinder out of a meshed sphere exactly as the direct kernel calls do", () => {
    const sphere = sphereOperand(64);
    const result = runManifoldJob(runtime, { op: "subtract", solids: [sphere], cutters: [cylinder] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Derselbe Weg, von Hand: Netz verschweissen, Koerper bauen, abziehen.
    const mesh = new runtime.Mesh({ numProp: 3, vertProperties: (sphere as { vertProperties: Float32Array }).vertProperties, triVerts: (sphere as { triVerts: Uint32Array }).triVerts, tolerance: 0.0001 });
    mesh.merge();
    const whole = runtime.Manifold.ofMesh(mesh);
    const direct = whole.subtract(runtime.Manifold.cylinder(1, 1, 1, 48, true).transform(cylinderMatrix as never));
    expect(Array.from(result.positions[0])).toEqual(Array.from(manifoldPositions(direct)));
    // Die Bohrung geht ganz durch: Kugel weniger etwa ein Zylinder von 5 mm Radius ueber 2 * 19.4 mm.
    const removed = whole.volume() - volumeOf(result.positions[0]);
    expect(removed).toBeGreaterThan(Math.PI * 25 * 36);
    expect(removed).toBeLessThan(Math.PI * 25 * 40);
  });

  it("splits a box into two halves that add up to the whole", () => {
    const box: ManifoldOperand = { kind: "box", min: [-10, 0, -5], max: [10, 8, 5] };
    const result = runManifoldJob(runtime, { op: "split", solid: box, normal: [1, 0, 0], position: 4 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(volumeOf(result.positions[0])).toBeCloseTo(6 * 8 * 10, 3);
    expect(volumeOf(result.positions[1])).toBeCloseTo(14 * 8 * 10, 3);
  });

  it("says when the plane leaves one side empty or the body is not closed", () => {
    const box: ManifoldOperand = { kind: "box", min: [0, 0, 0], max: [10, 10, 10] };
    expect(runManifoldJob(runtime, { op: "split", solid: box, normal: [1, 0, 0], position: 20 })).toEqual({ ok: false, reason: "emptyHalf" });
    // Ein einzelnes Dreieck umschliesst nichts; der Kern wirft dann, und die Seite zeigt seine Meldung wie bisher.
    const open: ManifoldOperand = { kind: "mesh", vertProperties: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), triVerts: new Uint32Array([0, 1, 2]) };
    expect(runManifoldJob(runtime, { op: "split", solid: open, normal: [1, 0, 0], position: 0.5 })).toMatchObject({ ok: false, reason: "error" });
    expect(runManifoldJob(runtime, { op: "subtract", solids: [open], cutters: [box] })).toMatchObject({ ok: false });
    // Ein flacher Quader ist kein Koerper.
    const flat: ManifoldOperand = { kind: "box", min: [0, 0, 0], max: [10, 0, 10] };
    expect(runManifoldJob(runtime, { op: "split", solid: flat, normal: [1, 0, 0], position: 5 })).toEqual({ ok: false, reason: "notClosed", status: "empty" });
  });

  it("runs in the geometry worker with the kernel it loads from the page's folder", async () => {
    const answers = new Map<number, (response: ManifoldWorkerResponse) => void>();
    const fakeSelf: { onmessage: ((event: { data: ManifoldWorkerRequest }) => Promise<void>) | null; postMessage: (message: ManifoldWorkerResponse) => void } = {
      onmessage: null,
      postMessage: (message) => answers.get(message.requestId)?.(message),
    };
    vi.stubGlobal("self", fakeSelf);
    try {
      await import("@/workers/manifold.worker");
      const assetBase = pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), "../../apps/web/public") + "/").href;
      const box: ManifoldOperand = { kind: "box", min: [-10, 0, -5], max: [10, 8, 5] };
      const job = { op: "split" as const, solid: box, normal: [1, 0, 0] as [number, number, number], position: 4 };
      const response = await new Promise<ManifoldWorkerResponse>((resolve) => {
        answers.set(1, resolve);
        void fakeSelf.onmessage!({ data: { requestId: 1, assetBase, job } });
      });
      expect(response.done).toBe(true);
      if (!response.done) return;
      expect(response.result).toEqual(runManifoldJob(runtime, job));
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
