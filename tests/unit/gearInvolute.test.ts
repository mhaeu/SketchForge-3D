import { describe, expect, it } from "vitest";
import {
  DEFAULT_GEAR_BACKLASH,
  gearOutlineCorners,
  involuteCentreDistance,
  involuteGearDiameter,
  involuteGearMeasures,
  involuteGearModule,
  normalizeGearBacklash,
  normalizeGearPressureAngle,
  normalizeGearProfile,
} from "@/lib/gearGeometry";
import type { WorkplaneShape } from "@/types/sketchforge";

/**
 * Kaemmen zwei Zahnraeder?
 *
 * Darum geht es bei Evolventenzaehnen. Gerade Flanken sehen wie Zaehne aus,
 * haken aber: Zwei davon kratzen beim Abrollen aneinander. Die Evolvente
 * waelzt sich ueber, und zwei Raeder desselben Moduls kaemmen bei einem
 * Achsabstand, der nur von ihren Zaehnezahlen abhaengt.
 *
 * Diese Zusage steht unten als Rechnung, nicht als Behauptung: Die beiden
 * Umrisse werden nebeneinander gelegt und nachgesehen, ob sie sich
 * ueberdecken.
 */

const gear = (teeth: number, module: number, overrides: Partial<WorkplaneShape> = {}): WorkplaneShape => ({
  id: "g",
  name: "Zahnrad",
  kind: "gear",
  color: "#6f7f8d",
  x: 0,
  z: 0,
  elevation: 0,
  size: module * (teeth + 2),
  width: module * (teeth + 2),
  depth: module * (teeth + 2),
  height: 6,
  rotation: 0,
  teeth,
  gearProfile: "involute",
  ...overrides,
} as WorkplaneShape);

type Point = { x: number; z: number };

/** Der Umriss als Vieleck, gedreht um `turn` und nach `offsetX` geschoben. */
function outlinePolygon(shape: WorkplaneShape, turn = 0, offsetX = 0): Point[] {
  return gearOutlineCorners(shape.width, shape.depth, shape).map(({ angle, radiusX, radiusZ }) => ({
    x: Math.cos(angle + turn) * radiusX + offsetX,
    z: Math.sin(angle + turn) * radiusZ,
  }));
}

function pointInPolygon(point: Point, polygon: readonly Point[]) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const a = polygon[index];
    const b = polygon[previous];
    if ((a.z > point.z) !== (b.z > point.z)
      && point.x < ((b.x - a.x) * (point.z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

/**
 * Wie viele Punkte des einen Umrisses im anderen liegen - also wie weit sie
 * sich ueberdecken.
 *
 * `band` grenzt ein, **welche Punkte** gefragt werden: Ein Punkt am anderen
 * Ende des Rades kann nicht im Gegenrad stecken, und ohne diese Grenze laeuft
 * die Suche ueber alle Verdrehungen in die Zeitsperre. Die Vielecke selbst
 * bleiben ganz - eine Auswahl von Punkten ist kein Vieleck.
 */
function overlapCount(one: readonly Point[], other: readonly Point[], band?: { from: number; to: number }) {
  const near = (points: readonly Point[]) => (band ? points.filter((point) => point.x > band.from && point.x < band.to) : points);
  return near(one).filter((point) => pointInPolygon(point, other)).length
    + near(other).filter((point) => pointInPolygon(point, one)).length;
}

function distanceToSegment(point: Point, a: Point, b: Point) {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const lengthSquared = abx * abx + abz * abz;
  const share = lengthSquared > 0
    ? Math.max(0, Math.min(1, ((point.x - a.x) * abx + (point.z - a.z) * abz) / lengthSquared))
    : 0;
  return Math.hypot(point.x - (a.x + abx * share), point.z - (a.z + abz * share));
}

/**
 * Der kleinste Abstand von diesen Punkten zu den Kanten des Vielecks.
 *
 * `points` darf eine Auswahl sein - etwa nur die Zaehne an der Beruehrung -,
 * `polygon` **nie**: Aus einer Auswahl von Punkten ein Vieleck zu machen gibt
 * eine Form, die es nicht gibt. Genau daran ist mein erster Messanlauf
 * gescheitert: Er hielt 12 Zaehne fuer klemmend, und das war die Auswahl, die
 * als Vieleck gelesen wurde.
 */
function closestApproach(points: readonly Point[], polygon: readonly Point[]) {
  let closest = Number.POSITIVE_INFINITY;
  points.forEach((point) => {
    for (let index = 0; index < polygon.length; index += 1) {
      closest = Math.min(closest, distanceToSegment(point, polygon[index], polygon[(index + 1) % polygon.length]));
    }
  });
  return closest;
}

describe("Die Masse eines Evolventenrades", () => {
  /**
   * Alles folgt aus Zaehnezahl und Modul, wie bei jedem Zahnradrechner:
   * Teilkreis = Modul x Zaehnezahl, Aussendurchmesser = Modul x (Zaehne + 2),
   * Fusskreis 1,25 Modul unter dem Teilkreis, Grundkreis = Teilkreis x
   * cos(Eingriffswinkel).
   */
  it("folgt den Formeln der Norm", () => {
    const measures = involuteGearMeasures(2 * 14, { teeth: 12 } as WorkplaneShape);
    expect(measures.module).toBeCloseTo(2, 9);
    expect(measures.pitchRadius).toBeCloseTo(12, 9);
    expect(measures.tipRadius).toBeCloseTo(14, 9);
    expect(measures.rootRadius).toBeCloseTo(12 - 2.5, 9);
    expect(measures.baseRadius).toBeCloseTo(12 * Math.cos((20 * Math.PI) / 180), 9);
    expect(involuteGearDiameter(2, 12)).toBeCloseTo(28, 9);
    expect(involuteGearModule(28, 12)).toBeCloseTo(2, 9);
  });

  it("nimmt den Achsabstand aus den beiden Teilkreisen", () => {
    expect(involuteCentreDistance(2, 12, 18)).toBeCloseTo(30, 9);
    expect(involuteCentreDistance(1.5, 20, 20)).toBeCloseTo(30, 9);
  });

  it("haelt Eingriffswinkel, Spiel und Profil in ihren Grenzen", () => {
    expect(normalizeGearPressureAngle(undefined)).toBe(20);
    expect(normalizeGearPressureAngle(90)).toBe(30);
    expect(normalizeGearPressureAngle(1)).toBe(14.5);
    expect(normalizeGearBacklash(undefined, 2)).toBe(DEFAULT_GEAR_BACKLASH);
    // Hoechstens ein halbes Modul, sonst bleibt kein Zahn uebrig.
    expect(normalizeGearBacklash(5, 2)).toBeCloseTo(1, 9);
    expect(normalizeGearBacklash(-1, 2)).toBe(0);
    // Ein Rad ohne gespeichertes Profil behaelt seine geraden Zaehne.
    expect(normalizeGearProfile(undefined)).toBe("simple");
    expect(normalizeGearProfile("involute")).toBe("involute");
  });

  /**
   * Der Umriss bleibt zwischen Fuss- und Kopfkreis, und beide werden
   * getroffen - ein Zahn, der den Kopfkreis nicht erreicht, waere zu kurz,
   * einer darueber zu lang.
   */
  it("bleibt zwischen Fuss und Kopf und trifft beide", () => {
    const measures = involuteGearMeasures(2 * 14, { teeth: 12 } as WorkplaneShape);
    const radii = gearOutlineCorners(2 * 14, 2 * 14, gear(12, 2)).map(({ radiusX }) => radiusX);
    expect(Math.min(...radii)).toBeCloseTo(measures.rootRadius, 6);
    expect(Math.max(...radii)).toBeCloseTo(measures.tipRadius, 6);
  });

  /**
   * Die Zahnbreite auf dem Teilkreis ist die halbe Teilung minus die halbe
   * Spielbreite. Gemessen am Umriss: der Bogen zwischen den beiden Flanken,
   * dort wo sie den Teilkreis kreuzen.
   */
  it("macht den Zahn auf dem Teilkreis um die halbe Spielbreite schmaler", () => {
    const thicknessOf = (backlash: number) => {
      const shape = gear(12, 2, { gearBacklash: backlash });
      const measures = involuteGearMeasures(shape.width, shape);
      const corners = gearOutlineCorners(shape.width, shape.depth, shape);
      // Die Flankenpunkte des ersten Zahnes, die dem Teilkreis am naechsten liegen.
      const near = corners
        .slice(0, Math.floor(corners.length / 12))
        .map((corner) => ({ ...corner, distance: Math.abs(corner.radiusX - measures.pitchRadius) }))
        .sort((a, b) => a.distance - b.distance);
      const [first, second] = [near[0], near.find((corner) => Math.abs(corner.angle - near[0].angle) > 0.05)!];
      return Math.abs(first.angle - second.angle) * measures.pitchRadius;
    };
    const pitch = (Math.PI * 2 * 12) / 12;
    expect(thicknessOf(0)).toBeCloseTo(pitch / 2, 1);
    expect(thicknessOf(0) - thicknessOf(0.4)).toBeCloseTo(0.2, 1);
  });
});

describe("Zwei Zahnraeder, die kaemmen sollen", () => {
  const module = 2;

  /**
   * Die Probe: Bei welcher Verdrehung des zweiten Rades treffen die beiden
   * Umrisse am besten zusammen? Gesucht wird sie durch Absuchen einer ganzen
   * Zahnteilung in feinen Schritten.
   *
   * Die Ueberdeckung wird immer zwischen den **ganzen** Vielecken gezaehlt;
   * gefiltert wird nur, von welchen Punkten aus der Abstand gemessen wird.
   */
  function bestPhase(teethA: number, teethB: number, distance: number) {
    const a = gear(teethA, module);
    const b = gear(teethB, module);
    const polyA = outlinePolygon(a);
    const contactA = polyA.filter((point) => point.x > module * teethA * 0.35);
    const band = { from: module * teethA * 0.35, to: distance - module * teethB * 0.35 };
    let best = { overlap: Number.POSITIVE_INFINITY, gap: Number.POSITIVE_INFINITY, turn: 0 };
    const pitchTurn = (Math.PI * 2) / teethB;
    const look = (turn: number) => {
      const polyB = outlinePolygon(b, turn, distance);
      const overlap = overlapCount(polyA, polyB, band);
      if (overlap > best.overlap) return;
      const gap = closestApproach(contactA, polyB);
      if (overlap < best.overlap || gap < best.gap) best = { overlap, gap, turn };
    };
    // Erst grob die ganze Zahnteilung ab, dann fein um die beste Stelle.
    for (let step = 0; step < 60; step += 1) look((pitchTurn * step) / 60);
    const coarse = best.turn;
    for (let step = -10; step <= 10; step += 1) look(coarse + (pitchTurn * step) / 600);
    return best;
  }

  /**
   * Die Zusage: Beim Achsabstand aus den Teilkreisen gibt es eine Verdrehung,
   * bei der sich nichts ueberdeckt - und die Flanken liegen dabei aufeinander,
   * stehen nicht einfach weit auseinander. Das ist das Kaemmen.
   *
   * "Aufeinander" heisst 0,015 mm, und das ist die Feinheit des Vielecks, kein
   * Spalt. Das Spiel sitzt auf der Gegenflanke.
   */
  it("beruehren sich beim Achsabstand der Norm, ohne sich zu ueberdecken", () => {
    const distance = involuteCentreDistance(module, 20, 30);
    expect(distance).toBeCloseTo(50, 9);
    const best = bestPhase(20, 30, distance);
    expect(best.overlap).toBe(0);
    expect(best.gap).toBeLessThan(0.05);
  });

  /**
   * Und das gilt fuer jede Zaehnezahl, die wir zulassen - gemessen bis
   * hinunter zu sechs Zaehnen, gleich und ungleich gepaart. Ein erster
   * Messanlauf von mir sah hier ein Klemmen unter vierzehn Zaehnen; das war
   * ein Fehler in der Messung (eine Punktauswahl als Vieleck gelesen), nicht
   * in der Geometrie.
   */
  it("und zwar bei jeder Zaehnezahl", () => {
    ([[6, 6], [8, 8], [12, 12], [12, 18], [14, 14], [18, 18]] as const).forEach(([teethA, teethB]) => {
      const best = bestPhase(teethA, teethB, involuteCentreDistance(module, teethA, teethB));
      expect(best.overlap, `${teethA}/${teethB}`).toBe(0);
      expect(best.gap, `${teethA}/${teethB}`).toBeLessThan(0.05);
    });
  });

  /**
   * Die Gegenprobe, damit die Pruefung oben etwas wert ist: Einen Millimeter
   * zu nah gibt es keine Verdrehung ohne Ueberdeckung - gemessen bleiben
   * dann mindestens 30 Punkte im anderen Rad stecken.
   */
  it("ueberdecken sich, wenn man sie einen Millimeter zu nah stellt", () => {
    const distance = involuteCentreDistance(module, 20, 30) - 1;
    expect(bestPhase(20, 30, distance).overlap).toBeGreaterThan(20);
  });

  /**
   * Mit geraden Zaehnen gilt die Zusage nicht - sie sind nicht nach Modul
   * gebaut. Dass ihr Umriss ein anderer ist, haelt diese Pruefung fest,
   * damit niemand "einfach" fuer dasselbe haelt.
   */
  it("sind mit geraden Zaehnen ein anderer Umriss", () => {
    const shape = gear(20, module);
    const simple = gearOutlineCorners(shape.width, shape.depth, { ...shape, gearProfile: "simple" } as WorkplaneShape);
    const involute = gearOutlineCorners(shape.width, shape.depth, shape);
    expect(simple.length).toBe(20 * 4);
    expect(involute.length).toBeGreaterThan(simple.length);
  });
});
