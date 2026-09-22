import { describe, expect, it } from "vitest";
import {
  MIN_SWEEP_START_RISE,
  sweepPathPoint,
  sweepSpineFromLowestEnd,
  sweepSpinePath,
  sweepStartDirection,
  sweepStartLeavesProfilePlane,
} from "@/lib/sketchSweep";
import type { SketchProfile } from "@/types/sketchforge";

function path(points: Array<[string, number, number]>, segments: Array<[string, string, string]>): SketchProfile {
  return {
    points: points.map(([id, x, z]) => ({ id, x, z })),
    segments: segments.map(([id, startId, endId]) => ({ id, startId, endId, kind: "line" })),
  } as unknown as SketchProfile;
}

/**
 * Im Folgen-Modus wird auf zwei Ebenen gezeichnet: die Form in der
 * Arbeitsebene, der Pfad senkrecht dazu. Beide Zeichnungen bestehen aus
 * denselben zwei Zahlen - erst die Zuordnung macht aus der einen eine Flaeche
 * und aus der anderen einen Weg im Raum.
 */
describe("der Pfad, dem die Form folgt", () => {
  it("stellt die Tiefe der Zeichnung als Hoehe in den Raum", () => {
    // Im Zeichenfenster zaehlt die Tiefe nach unten, im Raum die Hoehe nach
    // oben - ein Strich nach oben im Pfad zieht die Form also hinauf.
    expect(sweepPathPoint({ x: 5, z: -12 })).toEqual({ x: 5, y: 12, z: 0 });
    expect(sweepPathPoint({ x: 0, z: 0 })).toEqual({ x: 0, y: -0, z: 0 });
  });

  it("nimmt den laengsten offenen Zug und laesst die Form in Ruhe", () => {
    // Der geschlossene Umriss ist die Form, der offene Zug der Weg - beides
    // steht in derselben Zeichnung.
    const drawing = path(
      [["a", 0, 0], ["b", 0, -10], ["c", 6, -14], ["x", 40, 0], ["y", 44, 0],
        ["q1", 60, 0], ["q2", 70, 0], ["q3", 70, 10], ["q4", 60, 10]],
      [["ab", "a", "b"], ["bc", "b", "c"], ["xy", "x", "y"],
        ["q12", "q1", "q2"], ["q23", "q2", "q3"], ["q34", "q3", "q4"], ["q41", "q4", "q1"]],
    );
    const spine = sweepSpinePath(drawing)!;
    expect(spine.steps).toHaveLength(2);
    expect(spine.closed).toBe(false);
  });

  it("meldet nichts, wenn nur ein geschlossener Umriss dasteht", () => {
    const onlyShape = path(
      [["q1", 0, 0], ["q2", 10, 0], ["q3", 10, 10], ["q4", 0, 10]],
      [["q12", "q1", "q2"], ["q23", "q2", "q3"], ["q34", "q3", "q4"], ["q41", "q4", "q1"]],
    );
    expect(sweepSpinePath(onlyShape)).toBeNull();
  });

  it("meldet nichts, wo nichts gezeichnet ist", () => {
    expect(sweepSpinePath(path([["a", 0, 0]], []))).toBeNull();
  });

  it("faengt unten an und laeuft nach oben", () => {
    /*
     * Welches Ende ein Pfad als Anfang bekommt, haengt sonst daran, wo er
     * gezeichnet wurde - und die Form sitzt beim Bauen an seinem Anfang. Bei
     * einem gebogenen Pfad kaeme der Koerper sonst auf dem Kopf heraus.
     */
    for (const drawing of [
      path([["a", 0, 0], ["b", 0, -10]], [["ab", "a", "b"]]),
      path([["a", 0, -10], ["b", 0, 0]], [["ab", "a", "b"]]),
    ]) {
      const spine = sweepSpineFromLowestEnd(sweepSpinePath(drawing)!);
      expect(spine.steps[0].from.z).toBe(0);
      const direction = sweepStartDirection(spine)!;
      expect(direction.x).toBeCloseTo(0, 9);
      expect(direction.y).toBeCloseTo(1, 9);
    }
  });

  it("weist einen Pfad ab, der in der Formebene losgeht", () => {
    // Waagerecht heisst: der Pfad laeuft in der Ebene der Form. Die Form
    // wuerde in sich selbst geschoben, ein Koerper entstuende nicht.
    const flat = sweepSpinePath(path([["a", 0, 0], ["b", 20, 0]], [["ab", "a", "b"]]))!;
    expect(sweepStartLeavesProfilePlane(flat)).toBe(false);
    const steep = sweepSpinePath(path([["a", 0, 0], ["b", 20, -20]], [["ab", "a", "b"]]))!;
    expect(sweepStartLeavesProfilePlane(steep)).toBe(true);
    // Genau an der Grenze zaehlt es noch als Aufstieg.
    const grazing = sweepSpinePath(path([["a", 0, 0], ["b", 10, -10 * MIN_SWEEP_START_RISE / Math.sqrt(1 - MIN_SWEEP_START_RISE ** 2)]], [["ab", "a", "b"]]))!;
    expect(sweepStartLeavesProfilePlane(grazing)).toBe(true);
  });
});
