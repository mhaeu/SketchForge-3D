import { describe, expect, it } from "vitest";
import {
  hasMarkedSweepPath,
  markSweepPath,
  splitSweepDrawing,
  sweepPathPoint,
  sweepSpineFromLowestEnd,
  sweepSpinePath,
  sweepStartDirection,
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

  it("nimmt nichts, wenn nur ein geschlossener Umriss dasteht", () => {
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

  it("nimmt auch einen geschlossenen Zug als Weg, und zwar den weitesten", () => {
    // Ein Reifen: der enge Ring ist die Form, der weite die Bahn. Ohne einen
    // offenen Zug gibt es kein anderes Merkmal als die Weite.
    const ring = path(
      [["s1", -1, -1], ["s2", 1, -1], ["s3", 1, 1], ["s4", -1, 1],
        ["p1", -20, -20], ["p2", 20, -20], ["p3", 20, 20], ["p4", -20, 20]],
      [["s12", "s1", "s2"], ["s23", "s2", "s3"], ["s34", "s3", "s4"], ["s41", "s4", "s1"],
        ["p12", "p1", "p2"], ["p23", "p2", "p3"], ["p34", "p3", "p4"], ["p41", "p4", "p1"]],
    );
    const spine = sweepSpinePath(ring)!;
    expect(spine.closed).toBe(true);
    expect(spine.points.map((point) => point.id).sort()).toEqual(["p1", "p2", "p3", "p4"]);
  });

  it("laesst einen offenen Zug vor jedem geschlossenen den Vortritt", () => {
    // Was offen bleibt, umschliesst nichts und kann keine Flaeche sein - also
    // ist es der Weg, auch wenn daneben ein viel weiterer Ring steht.
    const both = path(
      [["a", 0, 0], ["b", 0, -4],
        ["p1", -20, -20], ["p2", 20, -20], ["p3", 20, 20], ["p4", -20, 20]],
      [["ab", "a", "b"],
        ["p12", "p1", "p2"], ["p23", "p2", "p3"], ["p34", "p3", "p4"], ["p41", "p4", "p1"]],
    );
    expect(sweepSpinePath(both)!.closed).toBe(false);
  });

  it("nimmt den Weg aus der Zeichnung heraus, bevor daraus Flaechen werden", () => {
    // Sonst zaehlte der geschlossene Weg selbst als Form, und der Reifen
    // bekaeme seine eigene Bahn als zweiten Koerper mit.
    const ring = path(
      [["s1", -1, -1], ["s2", 1, -1], ["s3", 1, 1], ["s4", -1, 1],
        ["p1", -20, -20], ["p2", 20, -20], ["p3", 20, 20], ["p4", -20, 20]],
      [["s12", "s1", "s2"], ["s23", "s2", "s3"], ["s34", "s3", "s4"], ["s41", "s4", "s1"],
        ["p12", "p1", "p2"], ["p23", "p2", "p3"], ["p34", "p3", "p4"], ["p41", "p4", "p1"]],
    );
    const split = splitSweepDrawing(ring)!;
    expect(split.shape.points.map((point) => point.id).sort()).toEqual(["s1", "s2", "s3", "s4"]);
    expect(split.shape.segments.map((segment) => segment.id).sort()).toEqual(["s12", "s23", "s34", "s41"]);
  });

  it("laesst einen geschlossenen Weg liegen, wie er gezeichnet wurde", () => {
    // Ein Ring hat keine Enden, die sich umdrehen liessen - wo die Form auf
    // ihm sitzt, ist einerlei, sie laeuft ohnehin einmal herum.
    const ring = path(
      [["s1", -1, -1], ["s2", 1, -1], ["s3", 1, 1], ["s4", -1, 1],
        ["p1", -20, -20], ["p2", 20, -20], ["p3", 20, 20], ["p4", -20, 20]],
      [["s12", "s1", "s2"], ["s23", "s2", "s3"], ["s34", "s3", "s4"], ["s41", "s4", "s1"],
        ["p12", "p1", "p2"], ["p23", "p2", "p3"], ["p34", "p3", "p4"], ["p41", "p4", "p1"]],
    );
    const drawn = sweepSpinePath(ring)!;
    expect(sweepSpineFromLowestEnd(drawn)).toBe(drawn);
  });
});
