import { describe, expect, it } from "vitest";
import { clampRegionToShape, deformPositionsInRegion, fullShapeRegion, regionResizedShape, type ResizeRegion } from "@/lib/regionResize";
import type { WorkplaneShape } from "@/types/sketchforge";

// A closed box as a triangle soup, the way importedMesh stores geometry.
function boxSoup(minX: number, maxX: number, minY: number, maxY: number, minZ: number, maxZ: number) {
  const c = (x: number, y: number, z: number) => [x, y, z];
  const p = [
    c(minX, minY, minZ), c(maxX, minY, minZ), c(maxX, maxY, minZ), c(minX, maxY, minZ),
    c(minX, minY, maxZ), c(maxX, minY, maxZ), c(maxX, maxY, maxZ), c(minX, maxY, maxZ),
  ];
  const quads = [[0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7], [1, 5, 6, 2], [3, 2, 6, 7], [4, 5, 1, 0]];
  return quads.flatMap(([a, b, cc, d]) => [...p[a], ...p[b], ...p[cc], ...p[a], ...p[cc], ...p[d]]);
}

// A bottle: a 20 x 10 x 20 body with a 6 x 10 x 6 neck on top, the neck made
// of two stacked halves so a vertex row sits half way up it.
const body = boxSoup(-10, 10, 0, 10, -10, 10);
const neckLower = boxSoup(-3, 3, 10, 15, -3, 3);
const neckUpper = boxSoup(-3, 3, 15, 20, -3, 3);
const bottle = [...body, ...neckLower, ...neckUpper];
const neck: ResizeRegion = { minX: -3, maxX: 3, minY: 10, maxY: 20, minZ: -3, maxZ: 3 };

type P = [number, number, number];
const points = (positions: number[]): P[] => Array.from({ length: positions.length / 3 }, (_, i) => [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]]);
const unique = (values: number[]) => [...new Set(values.map((v) => Number(v.toFixed(9))))].sort((a, b) => a - b);
const ys = (positions: number[], keep: (p: P) => boolean = () => true) => unique(points(positions).filter(keep).map((p) => p[1]));
const xs = (positions: number[], keep: (p: P) => boolean = () => true) => unique(points(positions).filter(keep).map((p) => p[0]));
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;
// Cutting adds vertices on the body's faces; the surface itself must not move.
const onBodySurface = (p: P) => Math.abs(p[0]) <= 10 && Math.abs(p[2]) <= 10 && p[1] >= 0 && p[1] <= 10
  && (near(Math.abs(p[0]), 10) || near(Math.abs(p[2]), 10) || near(p[1], 0) || near(p[1], 10));
const inNeck = (p: P) => Math.abs(p[0]) <= 3 + 1e-9 && Math.abs(p[2]) <= 3 + 1e-9 && p[1] >= 10 - 1e-9;
const bodyIntact = (positions: number[]) => points(positions).filter((p) => p[1] <= 10 + 1e-9).every(onBodySurface);

describe("region deformation", () => {
  it("stretch scales the rows inside the box and leaves the rest alone", () => {
    const result = deformPositionsInRegion(bottle, neck, { ...neck, maxY: 25 }, "stretch");
    // The neck's 15 row scales to 17.5, its top to 25; the body is untouched.
    expect(ys(result, inNeck)).toEqual([10, 17.5, 25]);
    expect(bodyIntact(result)).toBe(true);
  });

  it("push moves the inside rigidly and extrudes the band at the fixed face", () => {
    const result = deformPositionsInRegion(bottle, neck, { ...neck, maxY: 25 }, "push");
    // The row on the fixed face (10) stays; every row above shifts by 5, so
    // the neck keeps its shape and the wall between 10 and 20 fills the gap.
    expect(ys(result, inNeck)).toEqual([10, 20, 25]);
    expect(bodyIntact(result)).toBe(true);
  });

  it("pushing a foot downwards keeps the joint row and extrudes below it", () => {
    const tower = [...boxSoup(-3, 3, 0, 5, -3, 3), ...boxSoup(-3, 3, 5, 10, -3, 3)];
    const foot: ResizeRegion = { minX: -3, maxX: 3, minY: 0, maxY: 5, minZ: -3, maxZ: 3 };
    const result = deformPositionsInRegion(tower, foot, { ...foot, minY: -3 }, "push");
    // The row on the fixed face (5) is the joint and stays; the foot's
    // underside follows the dragged face.
    expect(ys(result)).toEqual([-3, 5, 10]);
  });

  it("widening the neck does not touch the body, even where their rows share a height", () => {
    const result = deformPositionsInRegion(bottle, neck, { ...neck, minX: -6, maxX: 6 }, "stretch");
    expect(xs(result, (p) => p[1] > 10 + 1e-9)).toEqual([-6, 6]);
    expect(bodyIntact(result)).toBe(true);
  });

  it("a centred push splits the inside so the material goes in at the middle", () => {
    const tower = [...boxSoup(-3, 3, 0, 5, -3, 3), ...boxSoup(-3, 3, 5, 10, -3, 3), ...boxSoup(-3, 3, 10, 15, -3, 3)];
    const region: ResizeRegion = { minX: -3, maxX: 3, minY: 0, maxY: 15, minZ: -3, maxZ: 3 };
    const result = deformPositionsInRegion(tower, region, { minX: -3, maxX: 3, minY: -4, maxY: 19, minZ: -3, maxZ: 3 }, "push");
    // Rows below the middle follow the bottom face, rows above follow the top.
    expect(ys(result)).toEqual([-4, 1, 14, 19]);
  });
});

describe("region deformation ends at the box", () => {
  // A pyramid: apex at (0, 10, 0) over a 20 x 20 base. Its side faces run
  // from the base straight to the apex with no vertex in between, so without
  // a cut a region around the tip would drag the whole face.
  const apex: P = [0, 10, 0];
  const corners: P[] = [[-10, 0, -10], [10, 0, -10], [10, 0, 10], [-10, 0, 10]];
  const pyramid = [
    ...corners.flatMap((corner, i) => [...corner, ...corners[(i + 1) % 4], ...apex]),
    ...corners[0], ...corners[2], ...corners[1],
    ...corners[0], ...corners[3], ...corners[2],
  ];

  it("cuts new vertices where the box meets the faces, so only the top moves", () => {
    const top: ResizeRegion = { minX: -10, maxX: 10, minY: 5, maxY: 10, minZ: -10, maxZ: 10 };
    const result = deformPositionsInRegion(pyramid, top, { ...top, maxY: 15 }, "stretch");
    // A ring of new vertices at y = 5 stays; the apex alone goes to 15.
    expect(ys(result)).toEqual([0, 5, 15]);
    // Below the ring the faces are exactly the old ones: the slope of a
    // side face is unchanged, so at y = 5 the pyramid is still 10 wide.
    expect(xs(result, (p) => near(p[1], 5))).toEqual([-5, 5]);
  });

  it("pins hull vertices shared with the outside, so a narrow box moves just the tip", () => {
    const tip: ResizeRegion = { minX: -2, maxX: 2, minY: 5, maxY: 10, minZ: -2, maxZ: 2 };
    const result = deformPositionsInRegion(pyramid, tip, { ...tip, maxY: 15 }, "stretch");
    // The side walls of the box cut the faces at y = 8 (x = 2 on the edge
    // from the apex to a corner); those vertices belong to the outside as
    // well and stay. Everything at |x| >= 2 is untouched.
    expect(Math.max(...ys(result, (p) => Math.abs(p[0]) >= 2 - 1e-9 || Math.abs(p[2]) >= 2 - 1e-9))).toBe(8);
    expect(ys(result).at(-1)).toBe(15);
  });

  it("push keeps the top rigid and extrudes the ring at the fixed face", () => {
    const top: ResizeRegion = { minX: -10, maxX: 10, minY: 5, maxY: 10, minZ: -10, maxZ: 10 };
    const result = deformPositionsInRegion(pyramid, top, { ...top, maxY: 15 }, "push");
    expect(ys(result)).toEqual([0, 5, 15]);
    expect(xs(result, (p) => near(p[1], 5))).toEqual([-5, 5]);
  });
});

describe("region resize on a shape", () => {
  const shape = {
    id: "b", name: "bottle", color: "#fff", kind: "mesh", x: 4, z: -2, elevation: 1, rotation: 0,
    size: 20, width: 20, depth: 20, height: 20,
    importedMesh: { positions: bottle, baseWidth: 20, baseDepth: 20, baseHeight: 20, triangleCount: bottle.length / 9, sourceFormat: "json" },
    cadBrep: "stale", edgeTreatments: [], threadParams: { pitch: 1 },
  } as unknown as WorkplaneShape;

  it("grows the shape around a pushed neck and keeps its footprint in place", () => {
    const result = regionResizedShape(shape, neck, { ...neck, maxY: 25 }, "push");
    expect(result).not.toBeNull();
    const { patch, region } = result!;
    expect(patch.height).toBe(25);
    expect(patch.width).toBe(20);
    expect(patch.x).toBe(4);
    expect(patch.z).toBe(-2);
    expect(patch.elevation).toBe(1);
    expect(patch.importedMesh?.baseHeight).toBe(25);
    expect(ys(patch.importedMesh!.positions, inNeck)).toEqual([10, 20, 25]);
    expect(region).toEqual({ ...neck, maxY: 25 });
    // Anything that described the old surface is gone.
    expect(patch.cadBrep).toBeUndefined();
    expect(patch.edgeTreatments).toBeUndefined();
    expect(patch.threadParams).toBeUndefined();
  });

  it("re-centres the mesh and moves the shape when a side grows", () => {
    const block = {
      ...shape, height: 10, size: 20,
      importedMesh: { ...shape.importedMesh!, positions: body, baseHeight: 10 },
    } as WorkplaneShape;
    const half: ResizeRegion = { minX: 0, maxX: 10, minY: 0, maxY: 10, minZ: -10, maxZ: 10 };
    const { patch, region } = regionResizedShape(block, half, { ...half, maxX: 20 }, "stretch")!;
    // Bounds went from [-10, 10] to [-10, 20]: 30 wide, centre 5 further along x.
    expect(patch.width).toBe(30);
    expect(patch.x).toBe(4 + 5);
    // The cut at the fixed face x = 0 left a row there, now at -5.
    expect(xs(patch.importedMesh!.positions)).toEqual([-15, -5, 15]);
    // The region follows the re-centring so the next drag starts from it.
    expect(region.minX).toBe(-5);
    expect(region.maxX).toBe(15);
  });

  it("clamps a region to the shape and keeps it a box", () => {
    const clamped = clampRegionToShape({ minX: 5, maxX: -5, minY: -3, maxY: 40, minZ: 0, maxZ: 0 }, shape);
    expect(clamped.minX).toBe(-5);
    expect(clamped.maxX).toBe(5);
    expect(clamped.minY).toBe(0);
    expect(clamped.maxY).toBe(20);
    expect(clamped.maxZ - clamped.minZ).toBeGreaterThan(0);
    expect(fullShapeRegion(shape)).toEqual({ minX: -10, maxX: 10, minY: 0, maxY: 20, minZ: -10, maxZ: 10 });
  });
});
