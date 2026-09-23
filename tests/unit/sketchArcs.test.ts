import { describe, expect, it } from "vitest";
import {
  arcApex,
  arcBulgeThrough,
  arcCubics,
  arcGeometry,
  arcPointAt,
  arcSamples,
  MAX_ARC_BULGE_RATIO,
  retargetSketchArcs,
  segmentArcGeometry,
  stepsEncloseArea,
} from "@/lib/sketchArcs";

const from = { x: -3, z: 0 };
const to = { x: 3, z: 0 };

function distance(a: { x: number; z: number }, b: { x: number; z: number }) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

describe("Kreisbogen zwischen zwei Punkten", () => {
  it("laesst die beiden Punkte nie los", () => {
    // Das ist der Unterschied zur Kurve mit Griffen: Woelbung hin oder her,
    // die Enden bleiben, wo sie sind.
    for (const bulge of [0.3, 3, -3, 9]) {
      const geometry = arcGeometry(from, to, bulge)!;
      expect(distance(arcPointAt(geometry, 0), from)).toBeLessThan(1e-9);
      expect(distance(arcPointAt(geometry, 1), to)).toBeLessThan(1e-9);
    }
  });

  it("ist ein echter Kreis: jeder Punkt gleich weit von der Mitte", () => {
    const geometry = arcGeometry(from, to, 2)!;
    for (let index = 0; index <= 20; index += 1) {
      expect(distance(arcPointAt(geometry, index / 20), geometry.centre)).toBeCloseTo(geometry.radius, 9);
    }
  });

  it("macht aus einer Woelbung so hoch wie der halbe Abstand einen Halbkreis", () => {
    // Sehne 6, Woelbung 3: Der Mittelpunkt faellt mit der Mitte der Sehne
    // zusammen, der Halbmesser ist 3, und ueberstrichen wird ein halber Kreis.
    const geometry = arcGeometry(from, to, 3)!;
    expect(geometry.radius).toBeCloseTo(3, 9);
    expect(geometry.centre.x).toBeCloseTo(0, 9);
    expect(geometry.centre.z).toBeCloseTo(0, 9);
    expect(Math.abs(geometry.sweep)).toBeCloseTo(Math.PI, 9);
  });

  it("laeuft ueber den Scheitel und nicht auf der anderen Seite herum", () => {
    for (const bulge of [0.5, -0.5, 5, -5]) {
      const geometry = arcGeometry(from, to, bulge)!;
      expect(distance(arcPointAt(geometry, 0.5), geometry.apex)).toBeLessThan(1e-9);
      expect(distance(geometry.apex, arcApex(from, to, bulge)!)).toBeLessThan(1e-9);
    }
  });

  it("nimmt fuer eine Woelbung groesser als der Halbmesser den langen Weg", () => {
    // Woelbung 9 bei Sehne 6: Der Bogen ist der groessere Teil des Kreises,
    // also mehr als ein halber.
    expect(Math.abs(arcGeometry(from, to, 9)!.sweep)).toBeGreaterThan(Math.PI);
    // Flach gewoelbt bleibt es der kleinere.
    expect(Math.abs(arcGeometry(from, to, 1)!.sweep)).toBeLessThan(Math.PI);
  });

  it("legt den Bogen mit dem Vorzeichen der Woelbung auf die andere Seite", () => {
    // Die Woelbung zaehlt quer zur Sehne: Bei dieser waagerechten Sehne
    // liegt der Scheitel um genau diesen Betrag darueber oder darunter.
    expect(arcApex(from, to, 2)!.z).toBeCloseTo(2, 9);
    expect(arcApex(from, to, -2)!.z).toBeCloseTo(-2, 9);
    // Und damit laeuft der Bogen andersherum um seinen Mittelpunkt.
    expect(Math.sign(arcGeometry(from, to, 2)!.sweep)).toBe(-Math.sign(arcGeometry(from, to, -2)!.sweep));
  });

  it("gilt als Strecke, solange sich nichts woelbt", () => {
    expect(arcGeometry(from, to, 0)).toBeNull();
    expect(arcGeometry(from, to, 1e-9)).toBeNull();
    // Und ohne Abstand gibt es gar keinen Bogen.
    expect(arcGeometry(from, { ...from }, 2)).toBeNull();
  });

  it("findet aus einem gegriffenen Punkt die Woelbung zurueck", () => {
    const grabbed = { x: 1, z: -2.5 };
    const bulge = arcBulgeThrough(from, to, grabbed);
    // Der Scheitel liegt danach senkrecht unter dem Griff auf der
    // Mittelsenkrechten - die Laengsverschiebung des Griffs zaehlt nicht.
    expect(arcApex(from, to, bulge)!.z).toBeCloseTo(-2.5, 9);
  });

  it("begrenzt die Woelbung, damit kein geschlossener Kreis daraus wird", () => {
    const bulge = arcBulgeThrough(from, to, { x: 0, z: -500 });
    expect(bulge).toBeCloseTo(-6 * MAX_ARC_BULGE_RATIO, 9);
  });

  it("naehert den Bogen in Stuecken von hoechstens einem Viertelkreis", () => {
    // Ein voller Halbkreis braucht zwei, ein flacher Bogen einen.
    expect(arcCubics(from, to, 3)).toHaveLength(2);
    expect(arcCubics(from, to, 0.5)).toHaveLength(1);
    expect(arcCubics(from, to, 9).length).toBeGreaterThanOrEqual(3);
  });

  it("bleibt in dieser Naeherung auf dem Kreis", () => {
    const geometry = arcGeometry(from, to, 2)!;
    const cubics = arcCubics(from, to, 2);
    for (const cubic of cubics) {
      for (let index = 0; index <= 8; index += 1) {
        const amount = index / 8;
        const inverse = 1 - amount;
        const point = {
          x: inverse ** 3 * cubic.from.x + 3 * inverse ** 2 * amount * cubic.control1.x + 3 * inverse * amount ** 2 * cubic.control2.x + amount ** 3 * cubic.to.x,
          z: inverse ** 3 * cubic.from.z + 3 * inverse ** 2 * amount * cubic.control1.z + 3 * inverse * amount ** 2 * cubic.control2.z + amount ** 3 * cubic.to.z,
        };
        expect(Math.abs(distance(point, geometry.centre) - geometry.radius)).toBeLessThan(geometry.radius * 1e-4);
      }
    }
    // Die Kette haengt an denselben beiden Punkten wie der Bogen.
    expect(cubics[0].from).toEqual(from);
    expect(cubics[cubics.length - 1].to).toEqual(to);
  });

  it("liefert einen Punktzug, der auf dem Kreis liegt und am Ende ankommt", () => {
    const geometry = arcGeometry(from, to, 2)!;
    const samples = arcSamples(from, to, 2);
    expect(samples.length).toBeGreaterThan(4);
    samples.forEach((sample) => {
      expect(Math.abs(distance(sample, geometry.centre) - geometry.radius)).toBeLessThan(1e-6);
    });
    expect(samples[samples.length - 1]).toEqual(to);
  });

  it("spiegelt die Woelbung, wenn die Kante rueckwaerts durchlaufen wird", () => {
    // Sonst springt derselbe Bogen auf die andere Seite, je nachdem, von
    // welchem Ende der Weg kommt.
    const segment = { id: "s", startId: "a", endId: "b", kind: "arc" as const, bulge: 2 };
    const a = { id: "a", ...from };
    const b = { id: "b", ...to };
    const forward = segmentArcGeometry(segment, a, b)!;
    const backward = segmentArcGeometry(segment, b, a)!;
    expect(distance(forward.apex, backward.apex)).toBeLessThan(1e-9);
    expect(forward.centre.z).toBeCloseTo(backward.centre.z, 9);
  });

  it("nimmt eine Kante ohne Woelbung nicht fuer einen Bogen", () => {
    const a = { id: "a", ...from };
    const b = { id: "b", ...to };
    expect(segmentArcGeometry({ id: "s", startId: "a", endId: "b", kind: "line" }, a, b)).toBeNull();
    expect(segmentArcGeometry({ id: "s", startId: "a", endId: "b", kind: "arc", bulge: 0 }, a, b)).toBeNull();
  });
});

describe("Arbeiten am Bogen", () => {
  const arcProfile = {
    points: [{ id: "a", x: -3, z: 0 }, { id: "b", x: 3, z: 0 }],
    segments: [{ id: "ab", startId: "a", endId: "b", kind: "arc" as const, bulge: 3 }],
  };

  it("setzt einen eingefuegten Punkt auf den Bogen und nicht auf die Sehne", async () => {
    const { closestPointOnSketchSegment } = await import("@/lib/sketchPointRefinement");
    const geometry = arcGeometry(from, to, 3)!;
    const placement = closestPointOnSketchSegment(
      arcProfile.segments[0],
      arcProfile.points[0],
      arcProfile.points[1],
      { x: 0.2, z: 8 },
    );
    expect(Math.abs(distance(placement.point, geometry.centre) - geometry.radius)).toBeLessThan(1e-9);
    expect(placement.amount).toBeGreaterThan(0.4);
    expect(placement.amount).toBeLessThan(0.6);
  });

  it("faellt vor dem Anfang auf den Anfang und nicht einmal herum auf das Ende", async () => {
    const { closestPointOnSketchSegment } = await import("@/lib/sketchPointRefinement");
    const placement = closestPointOnSketchSegment(
      arcProfile.segments[0],
      arcProfile.points[0],
      arcProfile.points[1],
      { x: -8, z: -1 },
    );
    expect(placement.amount).toBe(0);
  });

  it("teilt einen Bogen in zwei Boegen auf demselben Kreis", async () => {
    const { splitSketchSegment } = await import("@/lib/sketchPointRefinement");
    let counter = 0;
    const result = splitSketchSegment(arcProfile, "ab", 0.5, (prefix) => `${prefix}-${counter++}`);
    expect(result.inserted).toBe(true);
    const whole = arcGeometry(from, to, 3)!;
    const pointById = new Map(result.profile.points.map((point) => [point.id, point]));
    const halves = result.profile.segments;
    expect(halves).toHaveLength(2);
    halves.forEach((segment) => {
      const start = pointById.get(segment.startId)!;
      const end = pointById.get(segment.endId)!;
      const half = arcGeometry(start, end, segment.bulge!)!;
      // Beide Haelften laufen auf demselben Kreis - an der Teilstelle
      // entsteht kein Knick.
      expect(half.radius).toBeCloseTo(whole.radius, 7);
      expect(half.centre.x).toBeCloseTo(whole.centre.x, 7);
      expect(half.centre.z).toBeCloseTo(whole.centre.z, 7);
      expect(Math.abs(half.sweep)).toBeCloseTo(Math.abs(whole.sweep) / 2, 7);
    });
  });
});

describe("Boegen im Umriss", () => {
  /** Ein Kreis aus zwei Halbboegen - ohne einen einzigen Stuetzpunkt dazwischen. */
  function ring(prefix: string, radius: number) {
    return {
      points: [
        { id: `${prefix}-l`, x: -radius, z: 0 },
        { id: `${prefix}-r`, x: radius, z: 0 },
      ],
      segments: [
        { id: `${prefix}-top`, startId: `${prefix}-l`, endId: `${prefix}-r`, kind: "arc" as const, bulge: radius },
        { id: `${prefix}-bottom`, startId: `${prefix}-r`, endId: `${prefix}-l`, kind: "arc" as const, bulge: radius },
      ],
    };
  }

  it("nimmt einen Umriss aus zwei Halbboegen als Flaeche", async () => {
    const { cadSketchRegions } = await import("@/lib/sketchCadProfile");
    // Als Sehnen gelesen waeren beide Boegen dieselbe Strecke, die Flaeche
    // waere null, und der Umriss fiele als entartet heraus.
    const outer = ring("o", 10);
    const regions = cadSketchRegions({ points: outer.points, segments: outer.segments });
    expect(regions).toHaveLength(1);
  });

  it("erkennt einen kleineren Bogenumriss darin als Loch", async () => {
    const { cadSketchRegions } = await import("@/lib/sketchCadProfile");
    const outer = ring("o", 10);
    const inner = ring("i", 3);
    const regions = cadSketchRegions({
      points: [...outer.points, ...inner.points],
      segments: [...outer.segments, ...inner.segments],
    });
    expect(regions).toHaveLength(1);
    expect(regions[0].holes).toHaveLength(1);
  });
});

describe("Wann ein zurueckgekehrter Zug eine Flaeche umschliesst", () => {
  const line = { segment: { id: "s", startId: "a", endId: "b", kind: "line" as const } };
  const arc = { segment: { id: "s", startId: "a", endId: "b", kind: "arc" as const, bulge: 2 } };

  it("verlangt von Geraden mindestens drei", () => {
    // Zwei Strecken zwischen denselben beiden Punkten laegen aufeinander.
    expect(stepsEncloseArea([line, line])).toBe(false);
    expect(stepsEncloseArea([line, line, line])).toBe(true);
    expect(stepsEncloseArea([line])).toBe(false);
    expect(stepsEncloseArea([])).toBe(false);
  });

  it("laesst zwei Gekruemmte genuegen", () => {
    // Zwei Boegen zwischen denselben Punkten ergeben einen Kreis, ein Bogen
    // und eine Sehne einen Halbkreis.
    expect(stepsEncloseArea([arc, arc])).toBe(true);
    expect(stepsEncloseArea([arc, line])).toBe(true);
  });
});

describe("Boegen mitziehen", () => {
  const points = (entries: Array<[string, number, number]>) =>
    new Map(entries.map(([id, x, z]) => [id, { x, z }]));
  const arc = { id: "ab", startId: "a", endId: "b", kind: "arc" as const, bulge: 2 };
  const before = points([["a", -3, 0], ["b", 3, 0]]);

  it("laesst einen Bogen in Ruhe, der sich nicht bewegt hat", () => {
    const [same] = retargetSketchArcs([arc], before, before);
    expect(same).toBe(arc);
  });

  it("verkleinert die Woelbung mit der Sehne", () => {
    // Bleibt die Woelbung beim Verkleinern stehen, waelbt sich der Bogen
    // immer staerker heraus - genau das war zu sehen.
    const [smaller] = retargetSketchArcs([arc], before, points([["a", -1.5, 0], ["b", 1.5, 0]]));
    expect(smaller.bulge).toBeCloseTo(1, 9);
  });

  it("behaelt dabei die Form des Bogens", () => {
    // Gleichmaessig verkleinert bleibt derselbe Kreisausschnitt: derselbe
    // ueberstrichene Winkel, der halbe Halbmesser.
    const whole = arcGeometry({ x: -3, z: 0 }, { x: 3, z: 0 }, 2)!;
    const [smaller] = retargetSketchArcs([arc], before, points([["a", -1.5, 0], ["b", 1.5, 0]]));
    const half = arcGeometry({ x: -1.5, z: 0 }, { x: 1.5, z: 0 }, smaller.bulge!)!;
    expect(half.radius).toBeCloseTo(whole.radius / 2, 9);
    expect(half.sweep).toBeCloseTo(whole.sweep, 9);
  });

  it("dreht die Woelbung um, wenn gespiegelt wurde", () => {
    // Beim Spiegeln liegt dieselbe Zahl auf der anderen Seite der Sehne -
    // ohne das Umkehren stuelpt sich der Bogen nach innen.
    const mirrored = points([["a", 3, 0], ["b", -3, 0]]);
    const [flipped] = retargetSketchArcs([arc], before, mirrored, true);
    expect(flipped.bulge).toBeCloseTo(-2, 9);
    // Und der Scheitel liegt danach dort, wo ihn die Spiegelung hinlegt: auf
    // derselben Seite der Zeichnung wie vorher.
    expect(arcApex({ x: -3, z: 0 }, { x: 3, z: 0 }, 2)!.z).toBeCloseTo(2, 9);
    expect(arcApex({ x: 3, z: 0 }, { x: -3, z: 0 }, flipped.bulge!)!.z).toBeCloseTo(2, 9);
  });

  it("ruehrt Strecken und Kurven nicht an", () => {
    const others = [
      { id: "l", startId: "a", endId: "b", kind: "line" as const },
      { id: "c", startId: "a", endId: "b", kind: "bezier" as const },
      { id: "flach", startId: "a", endId: "b", kind: "arc" as const, bulge: 0 },
    ];
    expect(retargetSketchArcs(others, before, points([["a", -1, 0], ["b", 1, 0]]))).toEqual(others);
  });

  it("laesst einen Bogen stehen, dessen Punkte es nicht mehr gibt", () => {
    const [kept] = retargetSketchArcs([arc], before, points([["a", -3, 0]]));
    expect(kept).toBe(arc);
    // Und eine Sehne ohne Laenge gibt kein Verhaeltnis her.
    const [alsoKept] = retargetSketchArcs([arc], points([["a", 0, 0], ["b", 0, 0]]), before);
    expect(alsoKept).toBe(arc);
  });
});
