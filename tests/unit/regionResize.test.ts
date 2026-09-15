import { describe, expect, it } from "vitest";
import { clampRegionToShape, deformPositionsInRegion, fullShapeRegion, regionResizedShape, tightenRegionToShape, type ResizeRegion } from "@/lib/regionResize";
import type { WorkplaneShape } from "@/types/sketchforge";

// A closed box as a triangle soup, the way importedMesh stores geometry.
// Meshes in the app face outwards (counter-clockwise seen from outside),
// and the region logic relies on that to tell which side of a face is solid.
const quad = (a: number[], b: number[], c: number[], d: number[]) => [...a, ...c, ...b, ...a, ...d, ...c];
function boxSoup(minX: number, maxX: number, minY: number, maxY: number, minZ: number, maxZ: number, omit: Array<"top" | "bottom"> = []) {
  const c = (x: number, y: number, z: number) => [x, y, z];
  const p = [
    c(minX, minY, minZ), c(maxX, minY, minZ), c(maxX, maxY, minZ), c(minX, maxY, minZ),
    c(minX, minY, maxZ), c(maxX, minY, maxZ), c(maxX, maxY, maxZ), c(minX, maxY, maxZ),
  ];
  const quads = [[0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7], [1, 5, 6, 2]];
  if (!omit.includes("top")) quads.push([3, 2, 6, 7]);
  if (!omit.includes("bottom")) quads.push([4, 5, 1, 0]);
  return quads.flatMap(([a, b, cc, d]) => quad(p[a], p[b], p[cc], p[d]));
}

// A bottle as one watertight surface: a 20 x 10 x 20 body whose top is an
// annulus around the 6 x 10 x 6 neck, the neck open into the body and made
// of two stacked halves so a vertex row sits half way up it.
const annulus = [
  quad([-10, 10, -10], [10, 10, -10], [3, 10, -3], [-3, 10, -3]),
  quad([10, 10, -10], [10, 10, 10], [3, 10, 3], [3, 10, -3]),
  quad([10, 10, 10], [-10, 10, 10], [-3, 10, 3], [3, 10, 3]),
  quad([-10, 10, 10], [-10, 10, -10], [-3, 10, -3], [-3, 10, 3]),
].flat();
const body = [...boxSoup(-10, 10, 0, 10, -10, 10, ["top"]), ...annulus];
const neckLower = boxSoup(-3, 3, 10, 15, -3, 3, ["top", "bottom"]);
const neckUpper = boxSoup(-3, 3, 15, 20, -3, 3, ["bottom"]);
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
  && (near(Math.abs(p[0]), 10) || near(Math.abs(p[2]), 10) || near(p[1], 0) || (near(p[1], 10) && (Math.abs(p[0]) >= 3 - 1e-9 || Math.abs(p[2]) >= 3 - 1e-9)));
const inNeck = (p: P) => Math.abs(p[0]) <= 3 + 1e-9 && Math.abs(p[2]) <= 3 + 1e-9 && p[1] >= 10 - 1e-9;
const bodyIntact = (positions: number[]) => points(positions).filter((p) => p[1] <= 10 + 1e-9).every(onBodySurface);
// Vertices strictly outside a box, as a set of rounded keys. Deforming a
// region with itself only cuts, so comparing against that isolates movement;
// the box is the union of the old and new region, so the moved inside does
// not count as "outside" of the old one.
const outsideKeys = (positions: number[], box: ResizeRegion) => new Set(points(positions)
  .filter((p) => p[0] < box.minX - 1e-9 || p[0] > box.maxX + 1e-9 || p[1] < box.minY - 1e-9 || p[1] > box.maxY + 1e-9 || p[2] < box.minZ - 1e-9 || p[2] > box.maxZ + 1e-9)
  .map((p) => p.map((v) => v.toFixed(6)).join(",")));
const outsideUnchanged = (mesh: number[], from: ResizeRegion, to: ResizeRegion, result: number[]) => {
  const union: ResizeRegion = {
    minX: Math.min(from.minX, to.minX), maxX: Math.max(from.maxX, to.maxX),
    minY: Math.min(from.minY, to.minY), maxY: Math.max(from.maxY, to.maxY),
    minZ: Math.min(from.minZ, to.minZ), maxZ: Math.max(from.maxZ, to.maxZ),
  };
  const before = outsideKeys(deformPositionsInRegion(mesh, from, from, "stretch"), union);
  const after = outsideKeys(result, union);
  return before.size === after.size && [...before].every((k) => after.has(k));
};

// Every edge of a closed surface is walked by exactly two triangles. Holds
// on exact coordinates, since a seam is only found where both sides agree
// to the bit - which is what this checks after cutting and deforming.
const watertight = (positions: number[]) => {
  const counts = new Map<string, number>();
  const k = (i: number) => `${positions[i]},${positions[i + 1]},${positions[i + 2]}`;
  for (let i = 0; i + 8 < positions.length; i += 9) {
    for (let e = 0; e < 3; e += 1) {
      const a = k(i + e * 3);
      const b = k(i + ((e + 1) % 3) * 3);
      const edge = a < b ? `${a}|${b}` : `${b}|${a}`;
      counts.set(edge, (counts.get(edge) ?? 0) + 1);
    }
  }
  return [...counts.values()].every((count) => count === 2);
};

describe("region deformation", () => {
  it("stretch scales the rows inside the box and leaves the rest alone", () => {
    const result = deformPositionsInRegion(bottle, neck, { ...neck, maxY: 25 }, "stretch");
    // The neck's 15 row scales to 17.5, its top to 25; the body is untouched.
    expect(ys(result, inNeck)).toEqual([10, 17.5, 25]);
    expect(bodyIntact(result)).toBe(true);
  });

  it("push moves the inside rigidly and extrudes the band at the fixed face", () => {
    const result = deformPositionsInRegion(bottle, neck, { ...neck, maxY: 25 }, "push");
    // The neck moves up as one piece (its rows keep their spacing) and a band
    // of new wall from 10 to 15 joins it to the body, which is untouched.
    expect(ys(result, inNeck)).toEqual([10, 15, 20, 25]);
    expect(bodyIntact(result)).toBe(true);
    // The seam band spans the old and new ring; the neck's own bottom ring is at 15.
    expect(xs(result, (p) => near(p[1], 15))).toEqual([-3, 3]);
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
    ...corners.flatMap((corner, i) => [...corner, ...apex, ...corners[(i + 1) % 4]]),
    ...corners[0], ...corners[1], ...corners[2],
    ...corners[0], ...corners[2], ...corners[3],
  ];

  it("stays watertight through the cut alone", () => {
    // Neighbouring triangles walk their shared edge in opposite directions;
    // the cut point on it has to come out bit-identical from both, or the
    // seam is lost and the inside later moves off as a separate piece.
    const skewed = [0.1, 0.3, 0.7, 9.3, 9.9, 1.3, 4.2, 0.2, 8.1, 9.3, 9.9, 1.3, 0.1, 0.3, 0.7, 7.7, 9.1, 9.4];
    const region: ResizeRegion = { minX: -10, maxX: 10, minY: 5, maxY: 10, minZ: -10, maxZ: 10 };
    const cut = deformPositionsInRegion(skewed, region, region, "stretch");
    // Three edges cross the plane; the shared one yields one point, not two.
    const onPlane = new Set(points(cut).filter((p) => near(p[1], 5)).map((p) => p.join(",")));
    expect(onPlane.size).toBe(3);
    expect(watertight(deformPositionsInRegion(pyramid, region, region, "stretch"))).toBe(true);
  });

  it("cuts new vertices where the box meets the faces, so only the top moves", () => {
    const top: ResizeRegion = { minX: -10, maxX: 10, minY: 5, maxY: 10, minZ: -10, maxZ: 10 };
    const result = deformPositionsInRegion(pyramid, top, { ...top, maxY: 15 }, "stretch");
    expect(watertight(result)).toBe(true);
    // A ring of new vertices at y = 5 stays; the apex alone goes to 15.
    expect(ys(result)).toEqual([0, 5, 15]);
    // Below the ring the faces are exactly the old ones: the slope of a
    // side face is unchanged, so at y = 5 the pyramid is still 10 wide.
    expect(xs(result, (p) => near(p[1], 5))).toEqual([-5, 5]);
  });

  it("a narrow box lifts just the tip and closes the seam with a skirt", () => {
    const tip: ResizeRegion = { minX: -2, maxX: 2, minY: 5, maxY: 10, minZ: -2, maxZ: 2 };
    const result = deformPositionsInRegion(pyramid, tip, { ...tip, maxY: 15 }, "stretch");
    // The box walls cut the faces at y = 8 (x = 2 on the edge from the apex
    // to a corner). The outside keeps that row; the tip's copy scales to 11
    // and a skirt joins the two. Nothing outside the walls rises above 8.
    const inBox = (p: P) => Math.abs(p[0]) <= 2 + 1e-9 && Math.abs(p[2]) <= 2 + 1e-9 && p[1] >= 5 - 1e-9;
    expect(ys(result, inBox)).toEqual([8, 11, 15]);
    expect(outsideUnchanged(pyramid, tip, { ...tip, maxY: 15 }, result)).toBe(true);
    expect(watertight(result)).toBe(true);
  });

  it("push lifts the top as it is and inserts a straight band at the cut", () => {
    const top: ResizeRegion = { minX: -10, maxX: 10, minY: 5, maxY: 10, minZ: -10, maxZ: 10 };
    const result = deformPositionsInRegion(pyramid, top, { ...top, maxY: 15 }, "push");
    // The tip keeps its 5 mm height, now from 10 to 15; the band from 5 to 10
    // has the cut's cross-section (10 wide) at both ends - a prism, unlike
    // the stretch, which would taper it.
    expect(ys(result)).toEqual([0, 5, 10, 15]);
    expect(xs(result, (p) => near(p[1], 5))).toEqual([-5, 5]);
    expect(xs(result, (p) => near(p[1], 10))).toEqual([-5, 5]);
    expect(watertight(result)).toBe(true);
  });

  it("a side handle on the top half leaves the base alone", () => {
    // The base touches the tight box along the cut ring, which lies in the
    // box's +x plane as well - but the base's solid is below the box, not
    // in the path of the +x face, so it must not ride along.
    const top: ResizeRegion = { minX: -5, maxX: 5, minY: 5, maxY: 10, minZ: -5, maxZ: 5 };
    for (const mode of ["stretch", "push"] as const) {
      const result = deformPositionsInRegion(pyramid, top, { ...top, maxX: 8 }, mode);
      expect(outsideUnchanged(pyramid, top, { ...top, maxX: 8 }, result), mode).toBe(true);
      const below = xs(result, (p) => p[1] < 5 - 1e-9);
      expect([below[0], below.at(-1)], mode).toEqual([-10, 10]);
      expect(xs(result, (p) => near(p[1], 5)), mode).toContain(8);
      // The tip itself did move: stretched about the -x face, or pushed by 3.
      expect(xs(result, (p) => near(p[1], 10)), mode).toEqual([mode === "stretch" ? 1.5 : 3]);
      expect(watertight(result), mode).toBe(true);
    }
  });

  it("widening the top half from one side moves only that wall, with a step at the cut", () => {
    const block = boxSoup(-10, 10, 0, 10, -10, 10);
    const top: ResizeRegion = { minX: -10, maxX: 10, minY: 5, maxY: 10, minZ: -10, maxZ: 10 };
    for (const mode of ["stretch", "push"] as const) {
      const result = deformPositionsInRegion(block, top, { ...top, maxX: 15 }, mode);
      // Above the cut the +x wall is at 15 and the -x wall still at -10 (it
      // lies in the fixed face); below the cut nothing changed; at the cut
      // both the old and the new edge exist, joined by the step.
      expect(xs(result, (p) => p[1] > 5 + 1e-9), mode).toEqual([-10, 15]);
      expect(xs(result, (p) => p[1] < 5 - 1e-9), mode).toEqual([-10, 10]);
      const atCut = xs(result, (p) => near(p[1], 5));
      expect(atCut, mode).toContain(10);
      expect(atCut, mode).toContain(15);
      expect(outsideUnchanged(block, top, { ...top, maxX: 15 }, result), mode).toBe(true);
      expect(watertight(result), mode).toBe(true);
    }
  });

  it("carries the material in front of a moved face along", () => {
    // Three stacked blocks; the middle one is the region and its top face is
    // dragged up by 3. The top block rides along, the bottom block stays.
    const tower = [
      ...boxSoup(-3, 3, 0, 5, -3, 3, ["top"]),
      ...boxSoup(-3, 3, 5, 7.5, -3, 3, ["top", "bottom"]),
      ...boxSoup(-3, 3, 7.5, 10, -3, 3, ["top", "bottom"]),
      ...boxSoup(-3, 3, 10, 15, -3, 3, ["bottom"]),
    ];
    const middle: ResizeRegion = { minX: -3, maxX: 3, minY: 5, maxY: 10, minZ: -3, maxZ: 3 };
    const stretched = deformPositionsInRegion(tower, middle, { ...middle, maxY: 13 }, "stretch");
    expect(ys(stretched)).toEqual([0, 5, 9, 13, 18]);
    const pushed = deformPositionsInRegion(tower, middle, { ...middle, maxY: 13 }, "push");
    // No face of the middle piece lies in the cut plane, so the whole piece
    // moves up and the band goes in at 5.
    expect(ys(pushed)).toEqual([0, 5, 8, 10.5, 13, 18]);
    expect(watertight(stretched)).toBe(true);
    expect(watertight(pushed)).toBe(true);
  });

  it("shifting the box moves its contents and everything above, inserting below", () => {
    const tower = [
      ...boxSoup(-3, 3, 0, 5, -3, 3, ["top"]),
      ...boxSoup(-3, 3, 5, 10, -3, 3, ["top", "bottom"]),
      ...boxSoup(-3, 3, 10, 15, -3, 3, ["bottom"]),
    ];
    const middle: ResizeRegion = { minX: -3, maxX: 3, minY: 5, maxY: 10, minZ: -3, maxZ: 3 };
    const result = deformPositionsInRegion(tower, middle, { ...middle, minY: 7, maxY: 12 }, "push");
    // Bottom block stays (0..5), a band fills 5..7, the middle sits at 7..12,
    // the top block rides to 12..17.
    expect(ys(result)).toEqual([0, 5, 7, 12, 17]);
    expect(watertight(result)).toBe(true);
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
    expect(ys(patch.importedMesh!.positions, inNeck)).toEqual([10, 15, 20, 25]);
    expect(region).toEqual({ ...neck, maxY: 25 });
    // Anything that described the old surface is gone.
    expect(patch.cadBrep).toBeUndefined();
    expect(patch.edgeTreatments).toBeUndefined();
    expect(patch.threadParams).toBeUndefined();
  });

  it("re-centres the mesh and moves the shape when a side grows", () => {
    const block = {
      ...shape, height: 10, size: 20,
      importedMesh: { ...shape.importedMesh!, positions: boxSoup(-10, 10, 0, 10, -10, 10), baseHeight: 10 },
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

  it("shrinks the box onto the geometry inside the limits", () => {
    const apex = [0, 10, 0];
    const corners = [[-10, 0, -10], [10, 0, -10], [10, 0, 10], [-10, 0, 10]];
    const pyramid = [
      ...corners.flatMap((corner, i) => [...corner, ...apex, ...corners[(i + 1) % 4]]),
      ...corners[0], ...corners[1], ...corners[2],
      ...corners[0], ...corners[2], ...corners[3],
    ];
    const cone = {
      ...shape, height: 10, size: 20,
      importedMesh: { ...shape.importedMesh!, positions: pyramid, baseHeight: 10 },
    } as WorkplaneShape;
    // Limits: the top half at the shape's full width. Up there the pyramid
    // is only 10 wide, and the box has to end where the surface does, or a
    // side handle would anchor the deformation in empty space.
    const tight = tightenRegionToShape(cone, { minX: -10, maxX: 10, minY: 5, maxY: 10, minZ: -10, maxZ: 10 });
    expect(tight).toEqual({ minX: -5, maxX: 5, minY: 5, maxY: 10, minZ: -5, maxZ: 5 });
    // A limit the geometry reaches stays a limit; within |x|, |z| <= 2 the
    // faces only exist from y = 8 up, so the underside moves there.
    const narrow = tightenRegionToShape(cone, { minX: -2, maxX: 2, minY: 5, maxY: 10, minZ: -2, maxZ: 2 });
    expect(narrow).toEqual({ minX: -2, maxX: 2, minY: 8, maxY: 10, minZ: -2, maxZ: 2 });
    // Empty limits are left alone rather than collapsed.
    const empty = { minX: 2, maxX: 4, minY: 9, maxY: 10, minZ: 2, maxZ: 4 };
    expect(tightenRegionToShape(cone, empty)).toEqual(empty);
  });

  it("stays watertight across a sequence of drags", () => {
    // Shrinking the top half in width, then in length, slides the seam on
    // the first step's ledge along its own line - the outside edge is then
    // only partly walked by the inside, a T-junction. Lifting afterwards
    // must still find the seam, or the top comes away as a separate piece.
    let block = {
      ...shape, height: 10, size: 20,
      importedMesh: { ...shape.importedMesh!, positions: boxSoup(-10, 10, 0, 10, -10, 10), baseHeight: 10 },
    } as WorkplaneShape;
    let region: ResizeRegion = { minX: -10, maxX: 10, minY: 5, maxY: 10, minZ: -10, maxZ: 10 };
    const steps: Array<[Partial<ResizeRegion>, "stretch" | "push"]> = [
      [{ maxX: 8 }, "stretch"], [{ maxZ: 8 }, "stretch"], [{ minY: 8, maxY: 13 }, "push"], [{ minX: -6 }, "push"], [{ maxY: 16 }, "stretch"],
    ];
    for (const [change, mode] of steps) {
      const result = regionResizedShape(block, region, { ...region, ...change }, mode)!;
      block = { ...block, ...result.patch } as WorkplaneShape;
      region = tightenRegionToShape(block, result.region);
      expect(watertight(block.importedMesh!.positions), JSON.stringify(change)).toBe(true);
    }
    // The base still spans the full 20 x 20 (with extra vertices where the
    // planes cut through it), the top reaches 16.
    expect(block.height).toBe(16);
    const base = xs(block.importedMesh!.positions, (p) => p[1] < 5 - 1e-9);
    expect([base[0], base.at(-1)]).toEqual([-10, 10]);
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
