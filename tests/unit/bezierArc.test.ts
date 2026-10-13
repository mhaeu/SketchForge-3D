import { describe, expect, it } from "vitest";
import { BEZIER_ARC_TOLERANCE, bezierArcGeometry } from "@/lib/sketchArcs";

/**
 * Ist diese Kurve in Wahrheit ein Kreisbogen?
 *
 * Ein gezeichneter Kreis liegt in der Skizze als vier Bezierstuecke, und eine
 * Kurve wird im Kern eine Freiformflaeche. Hier wird gemessen, dass die
 * Erkennung genau die Faelle trifft, die sie treffen soll - und die anderen
 * nicht.
 */

/** Der Faktor, mit dem ein Viertelkreis als Bezier gezeichnet wird. */
const KAPPA = 0.5522847498307933;

/** Das Viertelstueck eines Kreises mit Halbmesser r um (0,0), wie die Skizze es baut. */
const quarter = (r: number) => ({
  from: { x: r, z: 0 },
  first: { x: r, z: KAPPA * r },
  second: { x: KAPPA * r, z: r },
  to: { x: 0, z: r },
});

describe("Eine Kurve, die ein Bogen ist", () => {
  /**
   * Zuerst die Messung, aus der die Grenze kommt: Wie weit weicht das
   * Bezierviertel vom echten Kreis ab? Gemessen an hundert Stellen - der
   * groesste Abstand liegt bei 2,7e-4 Halbmesser, bei 10 mm also 2,7
   * Mikrometer.
   */
  it("weicht als Viertelstueck um 2,7e-4 Halbmesser vom Kreis ab", () => {
    const r = 10;
    const { from, first, second, to } = quarter(r);
    let worst = 0;
    for (let step = 0; step <= 100; step += 1) {
      const amount = step / 100;
      const inverse = 1 - amount;
      const x = inverse ** 3 * from.x + 3 * inverse ** 2 * amount * first.x + 3 * inverse * amount ** 2 * second.x + amount ** 3 * to.x;
      const z = inverse ** 3 * from.z + 3 * inverse ** 2 * amount * first.z + 3 * inverse * amount ** 2 * second.z + amount ** 3 * to.z;
      worst = Math.max(worst, Math.abs(Math.hypot(x, z) - r));
    }
    expect(worst / r).toBeCloseTo(2.7e-4, 5);
  });

  it("nimmt das Viertelstueck eines Kreises an, in jeder Groesse", () => {
    [0.5, 10, 100].forEach((r) => {
      const { from, first, second, to } = quarter(r);
      const arc = bezierArcGeometry(from, first, second, to);
      expect(arc, `r = ${r}`).not.toBeNull();
      expect(arc!.radius).toBeCloseTo(r, 6);
      // Der Scheitel liegt auf dem Kreis, bei 45 Grad.
      expect(Math.hypot(arc!.apex.x, arc!.apex.z)).toBeCloseTo(r, 6);
      expect(arc!.apex.x).toBeCloseTo(arc!.apex.z, 6);
    });
  });

  /** Verschoben bleibt es derselbe Bogen - gerechnet wird nicht um den Ursprung. */
  it("findet den Bogen auch abseits des Ursprungs", () => {
    const r = 8;
    const shift = { x: -37, z: 125 };
    const q = quarter(r);
    const move = (point: { x: number; z: number }) => ({ x: point.x + shift.x, z: point.z + shift.z });
    const arc = bezierArcGeometry(move(q.from), move(q.first), move(q.second), move(q.to));
    expect(arc).not.toBeNull();
    expect(arc!.radius).toBeCloseTo(r, 6);
    expect(Math.hypot(arc!.apex.x - shift.x, arc!.apex.z - shift.z)).toBeCloseTo(r, 6);
  });

  /**
   * Und die Gegenprobe, damit die Erkennung etwas wert ist: Eine Kurve, die
   * kein Bogen ist, wird keiner. Geprueft an einem eingedellten Viertel (ein
   * Griff zur Haelfte eingezogen), an einer S-Kurve und an einer Kurve, deren
   * Punkte auf einer Gerade liegen.
   */
  it("lehnt ab, was kein Bogen ist", () => {
    const r = 10;
    const q = quarter(r);
    // Ein Griff halb eingezogen: sieht aehnlich aus, ist es nicht.
    expect(bezierArcGeometry(q.from, { x: r, z: (KAPPA * r) / 2 }, q.second, q.to)).toBeNull();
    // Eine S-Kurve.
    expect(bezierArcGeometry({ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 0, z: 10 }, { x: 10, z: 10 })).toBeNull();
    // Alles auf einer Gerade: kein Kreis, also kein Bogen.
    expect(bezierArcGeometry({ x: 0, z: 0 }, { x: 3, z: 0 }, { x: 7, z: 0 }, { x: 10, z: 0 })).toBeNull();
  });

  /**
   * Die Grenze liegt bei 5e-4 Halbmesser: Das Bezierviertel mit 2,7e-4 kommt
   * durch, und mit einer strengeren Grenze kaeme es nicht durch - daran haengt
   * die ganze Uebung.
   */
  it("haengt an einer Grenze, die das Bezierviertel einschliesst", () => {
    const q = quarter(10);
    expect(BEZIER_ARC_TOLERANCE).toBe(5e-4);
    expect(bezierArcGeometry(q.from, q.first, q.second, q.to, 5e-4)).not.toBeNull();
    expect(bezierArcGeometry(q.from, q.first, q.second, q.to, 1e-4)).toBeNull();
  });
});
