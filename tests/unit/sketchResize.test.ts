import { describe, expect, it } from "vitest";
import { resizeSketchPoints, type SelectionBounds } from "@/lib/sketchResize";
import type { SketchPoint } from "@/types/sketchforge";

// A 40 x 10 selection, so a locked ratio is obvious in the numbers.
const bounds: SelectionBounds = { minX: 0, maxX: 40, minZ: 0, maxZ: 10, width: 40, depth: 10, cx: 20, cz: 5 };
const points: SketchPoint[] = [
  { id: "a", x: 0, z: 0, mode: "corner" },
  { id: "b", x: 40, z: 0, mode: "corner" },
  { id: "c", x: 40, z: 10, mode: "corner" },
  { id: "d", x: 0, z: 10, mode: "corner" },
];
const box = (result: SketchPoint[]) => ({
  width: Math.max(...result.map((p) => p.x)) - Math.min(...result.map((p) => p.x)),
  depth: Math.max(...result.map((p) => p.z)) - Math.min(...result.map((p) => p.z)),
});

describe("sketch selection resize", () => {
  it("scales each axis on its own when the ratio is free", () => {
    const result = resizeSketchPoints(points, bounds, "se", { x: 80, z: 40 });
    expect(box(result)).toEqual({ width: 80, depth: 40 });
  });

  it("keeps the ratio from the axis that moved furthest on a corner handle", () => {
    // Width doubles, height quadruples -> height is the stronger pull.
    const result = resizeSketchPoints(points, bounds, "se", { x: 80, z: 40 }, true);
    const { width, depth } = box(result);
    expect(depth).toBeCloseTo(40, 6);
    expect(width).toBeCloseTo(160, 6);
    expect(width / depth).toBeCloseTo(bounds.width / bounds.depth, 6);
  });

  it("lets a side handle drive both axes", () => {
    // "e" only drives x, so the height has to follow it rather than stay put.
    const result = resizeSketchPoints(points, bounds, "e", { x: 20, z: 999 }, true);
    const { width, depth } = box(result);
    expect(width).toBeCloseTo(20, 6);
    expect(depth).toBeCloseTo(5, 6);
  });

  it("keeps the dragged edge under the pointer and the opposite one anchored", () => {
    // Dragging the west handle must not move the east edge, or the shape would
    // slide out from under the cursor while it is being resized.
    const result = resizeSketchPoints(points, bounds, "w", { x: -40, z: 0 }, true);
    expect(Math.min(...result.map((p) => p.x))).toBeCloseTo(-40, 6);
    expect(Math.max(...result.map((p) => p.x))).toBeCloseTo(40, 6);
  });

  it("carries bezier handles along with their points", () => {
    const curved: SketchPoint[] = [{ ...points[0], handleOut: { x: 10, z: 0 } }, points[1], points[2], points[3]];
    const result = resizeSketchPoints(curved, bounds, "se", { x: 80, z: 20 }, true);
    expect(result[0].handleOut?.x).toBeCloseTo(20, 6);
  });
});
