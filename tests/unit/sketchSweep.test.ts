import { describe, expect, it } from "vitest";
import {
  hasMarkedSweepPath,
  markSweepPath,
  splitSweepDrawing,
  sweepPathPoint,
  sweepProfilePlacement,
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

/**
 * Die Form haengt quer am Weg - nicht flach in der Arbeitsebene. Sonst
 * bekaeme ein Weg, der zur Seite laeuft, eine Form mit, die in ihrer eigenen
 * Ebene geschoben wird, und der Koerper waere platt.
 */
describe("wie die Form am Weg haengt", () => {
  const spineFor = (points: Array<[string, number, number]>) => sweepSpineFromLowestEnd(sweepSpinePath(
    path(points, points.slice(1).map((point, index) => [`s${index}`, points[index][0], point[0]] as [string, string, string])),
  )!);

  /** Die Normale der Form, durch die Abbildung geschickt. */
  function placedNormal(placement: number[]) {
    return [placement[1], placement[5], placement[9]];
  }

  function placedPoint(placement: number[], point: number[]) {
    return [0, 1, 2].map((row) => placement[row * 4] * point[0] + placement[row * 4 + 1] * point[1] + placement[row * 4 + 2] * point[2] + placement[row * 4 + 3]);
  }

  it("setzt die Mitte der Form an den Anfang des Weges", () => {
    const spine = spineFor([["a", 0, 0], ["b", 0, -10]]);
    const placement = sweepProfilePlacement(spine, { x: 7, z: -3 })!;
    placedPoint(placement, [7, 0, -3]).forEach((value, index) => expect(value).toBeCloseTo([0, 0, 0][index], 9));
  });

  it("laesst die Form liegen, wo der Weg schon hinauffuehrt", () => {
    const spine = spineFor([["a", 0, 0], ["b", 0, -10]]);
    const placement = sweepProfilePlacement(spine, { x: 0, z: 0 })!;
    expect(placedNormal(placement).map((value) => Number(value.toFixed(9)))).toEqual([0, 1, 0]);
  });

  it("stellt die Form quer, wenn der Weg zur Seite laeuft", () => {
    // Waagerecht war frueher der Fall, den das Folgen abgelehnt hat: Die Form
    // haette flach in ihrer eigenen Bahn gelegen. Jetzt kippt sie mit.
    const spine = spineFor([["a", 0, 0], ["b", 20, 0]]);
    const placement = sweepProfilePlacement(spine, { x: 0, z: 0 })!;
    const normal = placedNormal(placement);
    expect(Math.abs(normal[0])).toBeCloseTo(1, 9);
    expect(normal[1]).toBeCloseTo(0, 9);
    expect(normal[2]).toBeCloseTo(0, 9);
  });

  it("stellt sie auch quer zu einem schraegen Weg", () => {
    const spine = spineFor([["a", 0, 0], ["b", 10, -10]]);
    const placement = sweepProfilePlacement(spine, { x: 0, z: 0 })!;
    const direction = sweepStartDirection(spine)!;
    const normal = placedNormal(placement);
    // Die Normale der Form zeigt genau dorthin, wo der Weg losgeht.
    expect(normal[0]).toBeCloseTo(direction.x, 9);
    expect(normal[1]).toBeCloseTo(direction.y, 9);
    expect(normal[2]).toBeCloseTo(direction.z, 9);
  });

  it("schlaegt die Form um, wenn der Weg nach unten faellt", () => {
    // Der kuerzeste Weg von der Hochachse auf ihr Gegenteil hat keine
    // eindeutige Achse - dort muss eine gewaehlt werden, statt durch Null zu
    // teilen.
    const steps = [{ segment: { id: "s", startId: "a", endId: "b", kind: "line" as const }, from: { id: "a", x: 0, z: 0 }, to: { id: "b", x: 0, z: 10 } }];
    const spine = { id: "s", points: [steps[0].from, steps[0].to], steps, closed: false };
    const placement = sweepProfilePlacement(spine, { x: 0, z: 0 })!;
    expect(placedNormal(placement).map((value) => Number(value.toFixed(9)))).toEqual([0, -1, 0]);
    // Und es bleibt eine Drehung: Laengen aendern sich nicht.
    const moved = placedPoint(placement, [3, 0, 4]);
    expect(Math.hypot(...moved)).toBeCloseTo(5, 9);
  });

  it("bleibt in jedem Fall eine Drehung, ohne Stauchen oder Spiegeln", () => {
    for (const spine of [spineFor([["a", 0, 0], ["b", 3, -4]]), spineFor([["a", 0, 0], ["b", 20, 0]])]) {
      const placement = sweepProfilePlacement(spine, { x: 0, z: 0 })!;
      const rows = [0, 1, 2].map((row) => [placement[row * 4], placement[row * 4 + 1], placement[row * 4 + 2]]);
      rows.forEach((row) => expect(Math.hypot(...row)).toBeCloseTo(1, 9));
      const determinant = rows[0][0] * (rows[1][1] * rows[2][2] - rows[1][2] * rows[2][1])
        - rows[0][1] * (rows[1][0] * rows[2][2] - rows[1][2] * rows[2][0])
        + rows[0][2] * (rows[1][0] * rows[2][1] - rows[1][1] * rows[2][0]);
      expect(determinant).toBeCloseTo(1, 9);
    }
  });

  it("meldet nichts, wo der Weg an seinem Anfang keine Laenge hat", () => {
    const steps = [{ segment: { id: "s", startId: "a", endId: "b", kind: "line" as const }, from: { id: "a", x: 2, z: 2 }, to: { id: "b", x: 2, z: 2 } }];
    expect(sweepProfilePlacement({ id: "s", points: [], steps, closed: false }, { x: 0, z: 0 })).toBeNull();
  });
});

/**
 * Die Regel - offener Zug, sonst der weiteste Ring - trifft es meistens,
 * aber nicht immer. Wer den Weg festlegt, hat recht.
 */
describe("den Weg festlegen", () => {
  /** Eine kleine Form mitten in einem grossen Ring. */
  const nested = path(
    [["p1", -20, -20], ["p2", 20, -20], ["p3", 20, 20], ["p4", -20, 20],
      ["s1", -2, -2], ["s2", 2, -2], ["s3", 2, 2], ["s4", -2, 2]],
    [["p12", "p1", "p2"], ["p23", "p2", "p3"], ["p34", "p3", "p4"], ["p41", "p4", "p1"],
      ["s12", "s1", "s2"], ["s23", "s2", "s3"], ["s34", "s3", "s4"], ["s41", "s4", "s1"]],
  );

  it("nimmt den ausgezeichneten Zug, auch gegen die Regel", () => {
    // Ohne Auszeichnung gaelte der weiteste Ring als Weg. Hier wird der enge
    // festgelegt - und dann ist er es.
    const marked = markSweepPath(nested, "s12")!;
    expect(sweepSpinePath(marked)!.points.map((point) => point.id).sort()).toEqual(["s1", "s2", "s3", "s4"]);
    // Und die Form ist der Rest.
    expect(splitSweepDrawing(marked)!.shape.segments.map((segment) => segment.id).sort())
      .toEqual(["p12", "p23", "p34", "p41"]);
  });

  it("zeichnet den ganzen Zug aus, nicht die eine Kante", () => {
    const marked = markSweepPath(nested, "s12")!;
    expect(marked.segments.filter((segment) => segment.role === "path").map((segment) => segment.id).sort())
      .toEqual(["s12", "s23", "s34", "s41"]);
  });

  it("laesst nur einen Weg zu", () => {
    // Ein zweiter Weg waere eine zweite Bewegung, und die Form kann nur eine
    // ausfuehren.
    const first = markSweepPath(nested, "s12")!;
    const second = markSweepPath(first, "p12")!;
    expect(second.segments.filter((segment) => segment.role === "path").map((segment) => segment.id).sort())
      .toEqual(["p12", "p23", "p34", "p41"]);
    expect(hasMarkedSweepPath(second)).toBe(true);
  });

  it("nimmt die Auszeichnung beim zweiten Mal wieder weg", () => {
    const marked = markSweepPath(nested, "s12")!;
    const cleared = markSweepPath(marked, "s34")!;
    expect(hasMarkedSweepPath(cleared)).toBe(false);
    // Danach gilt wieder die Regel: der weiteste Ring.
    expect(sweepSpinePath(cleared)!.points.map((point) => point.id).sort()).toEqual(["p1", "p2", "p3", "p4"]);
  });

  it("bleibt der Weg, wenn er verlaengert wird", () => {
    // Eine neu angesetzte Kante traegt die Auszeichnung nicht - eine
    // ausgezeichnete im selben Zug genuegt aber. Daneben steht hier ein
    // laengerer offener Zug, der nach der Regel gewaenne.
    const marked = markSweepPath(path(
      [["a", 0, 0], ["b", 0, -10],
        ["l1", 40, 0], ["l2", 44, 0], ["l3", 48, 0], ["l4", 52, 0], ["l5", 56, 0]],
      [["ab", "a", "b"],
        ["l12", "l1", "l2"], ["l23", "l2", "l3"], ["l34", "l3", "l4"], ["l45", "l4", "l5"]],
    ), "ab")!;
    const extended = {
      ...marked,
      points: [...marked.points, { id: "c", x: 6, z: -14 }],
      segments: [...marked.segments, { id: "bc", startId: "b", endId: "c", kind: "line" as const }],
    };
    const spine = sweepSpinePath(extended)!;
    expect(spine.steps).toHaveLength(2);
    expect(spine.points.map((point) => point.id)).toContain("c");
  });

  it("meldet nichts fuer eine Kante, die es nicht gibt", () => {
    expect(markSweepPath(nested, "gibtsnicht")).toBeNull();
    expect(hasMarkedSweepPath(nested)).toBe(false);
  });
});
