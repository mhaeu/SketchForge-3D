import { describe, expect, it } from "vitest";
import { arcApex, arcThroughThreePoints } from "@/lib/sketchArcs";

describe("arc through three points", () => {
  it("lays a half circle through its top", () => {
    const arc = arcThroughThreePoints({ x: -10, z: 0 }, { x: 10, z: 0 }, { x: 0, z: 10 })!;
    expect(arc.radius).toBeCloseTo(10, 9);
    // Die Normale der Sehne von links nach rechts zeigt nach +z: Scheitel bei (0, 10).
    const apex = arcApex({ x: -10, z: 0 }, { x: 10, z: 0 }, arc.bulge)!;
    expect(apex.x).toBeCloseTo(0, 9);
    expect(apex.z).toBeCloseTo(10, 9);
  });

  it("runs through a point that is not the apex", () => {
    const from = { x: 0, z: 0 };
    const to = { x: 8, z: 0 };
    // Kreis um (4, -3) mit r 5 geht durch (0,0), (8,0) und (7, 1): 9 + 16 = 25.
    const arc = arcThroughThreePoints(from, to, { x: 7, z: 1 })!;
    expect(arc.radius).toBeCloseTo(5, 9);
    expect(arc.bulge).toBeCloseTo(2, 9);
  });

  it("takes the long way when the point lies past the centre", () => {
    // Derselbe Kreis, Punkt (4, -8) unten: Bogen ueber die untere, lange Seite.
    const arc = arcThroughThreePoints({ x: 0, z: 0 }, { x: 8, z: 0 }, { x: 4, z: -8 })!;
    expect(arc.bulge).toBeCloseTo(-8, 9);
  });

  it("gives no arc for three points on a line", () => {
    expect(arcThroughThreePoints({ x: 0, z: 0 }, { x: 8, z: 0 }, { x: 3, z: 0 })).toBeNull();
  });
});
