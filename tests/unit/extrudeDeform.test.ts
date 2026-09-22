import { describe, expect, it } from "vitest";
import {
  shapeExtrudeDeformAt,
  shapeExtrudeDeformPatch,
  shapeHasExtrudeDeform,
  shapeHasShapeDeform,
  shapeSupportsExtrudeDeform,
  canonicalizeShape,
  workplaneShapesEqual,
} from "@/lib/workplaneShapes";
import type { WorkplaneShape } from "@/types/sketchforge";

function shape(overrides: Partial<WorkplaneShape> = {}): WorkplaneShape {
  return canonicalizeShape({
    id: "s1",
    name: "Koerper",
    kind: "box",
    color: "#888888",
    x: 0,
    z: 0,
    elevation: 0,
    size: 20,
    width: 20,
    depth: 20,
    height: 40,
    rotation: 0,
    rotationX: 0,
    rotationZ: 0,
    ...overrides,
  } as WorkplaneShape);
}

/**
 * Drall und Versatz drehen und schieben die Deckflaeche gegen die
 * Grundflaeche. Sie wachsen dabei linear ueber die Hoehe, genau wie Breite
 * und Tiefe der Verjuengung - ein Punkt auf halber Hoehe bekommt die Haelfte.
 */
describe("Drall und versetzte Deckflaeche", () => {
  it("verteilt beides ueber die Hoehe", () => {
    const twisted = shape({ extrudeTwist: 90, extrudeTopOffsetX: 10, extrudeTopOffsetZ: -4 });
    const base = shapeExtrudeDeformAt(twisted, 0);
    expect(base.twistRadians).toBe(0);
    expect(base.offsetX).toBe(0);
    expect(base.offsetZ).toBeCloseTo(0, 9);
    const middle = shapeExtrudeDeformAt(twisted, 0.5);
    expect(middle.twistRadians).toBeCloseTo(Math.PI / 4, 9);
    expect(middle.offsetX).toBeCloseTo(5, 9);
    expect(middle.offsetZ).toBeCloseTo(-2, 9);
    const top = shapeExtrudeDeformAt(twisted, 1);
    expect(top.twistRadians).toBeCloseTo(Math.PI / 2, 9);
    expect(top.offsetX).toBeCloseTo(10, 9);
  });

  it("bleibt innerhalb der Enden, auch wenn der Wert daneben liegt", () => {
    const twisted = shape({ extrudeTwist: 90 });
    expect(shapeExtrudeDeformAt(twisted, -3).twistRadians).toBe(0);
    expect(shapeExtrudeDeformAt(twisted, 7).twistRadians).toBeCloseTo(Math.PI / 2, 9);
    expect(shapeExtrudeDeformAt(twisted, Number.NaN).twistRadians).toBe(0);
  });

  it("merkt, ob ueberhaupt etwas verformt ist", () => {
    expect(shapeHasExtrudeDeform(shape())).toBe(false);
    expect(shapeHasExtrudeDeform(shape({ extrudeTwist: 0 }))).toBe(false);
    expect(shapeHasExtrudeDeform(shape({ extrudeTwist: 15 }))).toBe(true);
    expect(shapeHasExtrudeDeform(shape({ extrudeTopOffsetZ: 2 }))).toBe(true);
    // Und beide Verformungen zusammen fragt man mit einem Aufruf ab.
    expect(shapeHasShapeDeform(shape({ extrudeTopOffsetX: 3 }))).toBe(true);
    expect(shapeHasShapeDeform(shape())).toBe(false);
  });

  it("laesst Koerper aus, die ihr eigenes Oben haben", () => {
    // Zahnprofil, Gewindewendel, Federwindung und Linealteilung wuerden sich
    // mit einem Drall schlagen statt ihn mitzumachen.
    ["gear", "thread", "spring", "ruler"].forEach((kind) => {
      expect(shapeSupportsExtrudeDeform(kind as WorkplaneShape["kind"])).toBe(false);
      expect(shapeHasExtrudeDeform(shape({ kind: kind as WorkplaneShape["kind"], extrudeTwist: 45 }))).toBe(false);
    });
    expect(shapeSupportsExtrudeDeform("box")).toBe(true);
    expect(shapeSupportsExtrudeDeform("cylinder")).toBe(true);
  });

  it("nimmt beim Setzen nur an, was die Regler hergeben", () => {
    const patch = shapeExtrudeDeformPatch(shape(), { twist: 5000, offsetX: -900, offsetZ: 12 });
    expect(patch).toEqual({ extrudeTwist: 720, extrudeTopOffsetX: -80, extrudeTopOffsetZ: 12 });
    // Was nicht genannt wird, bleibt unangetastet.
    expect(shapeExtrudeDeformPatch(shape(), { twist: 30 })).toEqual({ extrudeTwist: 30 });
    // Und ein Koerper, der das nicht kann, bekommt gar nichts.
    expect(shapeExtrudeDeformPatch(shape({ kind: "gear" }), { twist: 30 })).toEqual({});
  });

  it("merkt eine geaenderte Verdrehung beim Vergleichen", () => {
    // Ohne das bliebe das Netz von vor der Aenderung stehen.
    const a = shape({ extrudeTwist: 30 });
    expect(workplaneShapesEqual(a, shape({ extrudeTwist: 30 }))).toBe(true);
    expect(workplaneShapesEqual(a, shape({ extrudeTwist: 60 }))).toBe(false);
    expect(workplaneShapesEqual(a, shape({ extrudeTwist: 30, extrudeTopOffsetX: 1 }))).toBe(false);
  });
});
