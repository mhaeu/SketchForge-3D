import { beforeAll, describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { OcctKernel, ShapeHandle } from "occt-wasm";
import { cadFaceTessellation, deleteFacesFromSolids, DELETE_FACES_UNCHANGED_MESSAGE } from "@/lib/cadDeleteFaces";
import { cadFaceHighlightPositions } from "@/lib/cadFacePick";

// Flaeche loeschen gegen den echten Kern aus node_modules.
let cad: OcctKernel;

beforeAll(async () => {
  const { OcctKernel } = await import("occt-wasm");
  const wasm = join(dirname(fileURLToPath(import.meta.resolve("occt-wasm"))), "occt-wasm.wasm");
  cad = await OcctKernel.init({ wasm });
}, 180000);

/** Die Nummern (wie in cadFaceTessellation) der Flaechen, die test erfuellen. */
function faceIds(solids: ShapeHandle[], test: (face: ShapeHandle) => boolean) {
  const ids: number[] = [];
  let offset = 0;
  for (const solid of solids) {
    const faces = cad.getSubShapes(solid, "face");
    faces.forEach((face, index) => {
      if (test(face)) ids.push(offset + index);
    });
    offset += faces.length;
  }
  return ids;
}

describe("Flaeche loeschen (echter Kern)", () => {
  it("takes a boss off a plate: the plate's top closes over it", () => {
    const plate = cad.makeBox(40, 30, 5);
    const boss = cad.translate(cad.makeCylinder(4, 10), 20, 15, 5);
    const body = cad.fuse(plate, boss);
    expect(cad.getVolume(body)).toBeCloseTo(40 * 30 * 5 + Math.PI * 16 * 10, 1);
    // Mantel und Deckel des Zapfens.
    const ids = faceIds([body], (face) => {
      const center = cad.getSurfaceCenterOfMass(face);
      return center.z > 5.001;
    });
    expect(ids.length).toBe(2);
    const [result] = deleteFacesFromSolids(cad, [body], ids);
    expect(cad.getVolume(result)).toBeCloseTo(40 * 30 * 5, 3);
    expect(cad.getSubShapes(result, "face").length).toBe(6);
  });

  it("fills a hole when its wall is deleted", () => {
    const plate = cad.makeBox(40, 30, 5);
    const drilled = cad.cut(plate, cad.translate(cad.makeCylinder(3, 20), 20, 15, -5));
    const ids = faceIds([drilled], (face) => cad.surfaceType(face) === "cylinder");
    expect(ids.length).toBeGreaterThan(0);
    const [result] = deleteFacesFromSolids(cad, [drilled], ids);
    expect(cad.getVolume(result)).toBeCloseTo(40 * 30 * 5, 3);
  });

  it("removes a fillet: the edge comes back sharp", () => {
    const box = cad.makeBox(20, 20, 20);
    const edge = cad.getSubShapes(box, "edge")[0];
    const filleted = cad.fillet(box, [edge], 3);
    expect(cad.getVolume(filleted)).toBeLessThan(8000);
    const ids = faceIds([filleted], (face) => cad.surfaceType(face) === "cylinder");
    expect(ids.length).toBe(1);
    const [result] = deleteFacesFromSolids(cad, [filleted], ids);
    expect(cad.getVolume(result)).toBeCloseTo(8000, 3);
  });

  it("refuses a main side of a box and leaves nothing changed", () => {
    const box = cad.makeBox(20, 20, 20);
    expect(() => deleteFacesFromSolids(cad, [box], [0])).toThrow(DELETE_FACES_UNCHANGED_MESSAGE);
    expect(cad.getVolume(box)).toBeCloseTo(8000, 3);
  });

  it("numbers the faces of two bodies one after the other, and the pick mesh knows each triangle's face", () => {
    const first = cad.makeBox(10, 10, 10);
    const second = cad.translate(cad.fuse(cad.makeBox(40, 30, 5), cad.translate(cad.makeCylinder(4, 10), 20, 15, 5)), 30, 0, 0);
    const pick = cadFaceTessellation(cad, [first, second], { linearDeflection: 0.1, angularDeflection: 0.5 });
    expect(pick.triangleFaces.length).toBe(pick.indices.length / 3);
    expect(Array.from(pick.triangleFaces).every((face) => face >= 0)).toBe(true);
    // Der erste Kasten hat die Flaechen 0 bis 5, zwei Dreiecke je Seite.
    for (let face = 0; face < 6; face += 1) expect(Array.from(pick.triangleFaces).filter((id) => id === face).length).toBe(2);
    // Die Dreiecke des Zapfens liegen alle ueber der Platte, und nur dort.
    const ids = faceIds([first, second], (face) => {
      const center = cad.getSurfaceCenterOfMass(face);
      return center.x > 30 && center.z > 5.001;
    });
    expect(ids.every((id) => id >= 6)).toBe(true);
    const corners = cadFaceHighlightPositions(pick.positions, pick.indices, pick.triangleFaces, ids);
    expect(corners.length).toBeGreaterThan(0);
    for (let i = 0; i < corners.length; i += 3) {
      expect(corners[i]).toBeGreaterThan(30);
      expect(corners[i + 2]).toBeGreaterThanOrEqual(5 - 1e-4);
    }
    const results = deleteFacesFromSolids(cad, [first, second], ids);
    expect(cad.getVolume(results[0])).toBeCloseTo(1000, 3);
    expect(cad.getVolume(results[1])).toBeCloseTo(6000, 3);
  });
});
