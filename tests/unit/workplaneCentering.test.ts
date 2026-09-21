import { describe, expect, it } from "vitest";
import { WORKPLANE_CENTER, workplaneCenteringOffset } from "@/lib/workplaneCentering";

describe("workplane centering", () => {
  it("moves a bounding box onto the middle of the build plate", () => {
    const offset = workplaneCenteringOffset({ minX: 10, maxX: 30, minZ: -5, maxZ: 5 });
    expect(offset).toEqual({ x: WORKPLANE_CENTER.x - 20, z: WORKPLANE_CENTER.z - 0 });
  });

  it("leaves a box that is already centred alone", () => {
    const offset = workplaneCenteringOffset({ minX: -8, maxX: 8, minZ: -3, maxZ: 3 });
    expect(offset).toEqual({ x: 0, z: 0 });
  });

  it("refuses a box it cannot measure", () => {
    expect(workplaneCenteringOffset({ minX: Number.NaN, maxX: 1, minZ: 0, maxZ: 1 })).toBeNull();
    expect(workplaneCenteringOffset({ minX: Number.POSITIVE_INFINITY, maxX: Number.NEGATIVE_INFINITY, minZ: 0, maxZ: 1 })).toBeNull();
    // An empty selection leaves the bounds inverted; that is not a body.
    expect(workplaneCenteringOffset({ minX: 5, maxX: 1, minZ: 0, maxZ: 1 })).toBeNull();
  });
});
