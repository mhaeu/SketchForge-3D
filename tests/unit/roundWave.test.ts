import { describe, expect, it } from "vitest";
import { roundToothArcs, roundWave, roundWaveCorners } from "@/lib/roundWave";
import { gearOutlineCorners, involuteCentreDistance, roundGearMeasures, ROUND_GEAR_ADDENDUM, ROUND_GEAR_DEDENDUM } from "@/lib/gearGeometry";
import type { WorkplaneShape } from "@/types/sketchforge";

/**
 * Die runde Welle: Boegen ueber den Koepfen, Boegen in den Luecken, und jeder
 * laeuft glatt in den naechsten.
 *
 * "Glatt" ist hier keine Beschreibung, sondern eine Rechnung: Zwei Kreise
 * beruehren sich genau dann glatt, wenn der Abstand ihrer Mitten die Summe
 * ihrer Halbmesser ist. Faellt das, hat die Welle einen Knick - und ein Knick
 * im Zahnfuss ist die Stelle, an der ein gedruckter Zahn bricht.
 */
describe("Die runde Welle", () => {
  const wave = roundWave(12, 14, 11, 12.5, Math.PI / 24, 0);

  it("setzt Koepfe und Gruende auf ihre Kreise", () => {
    expect(wave.toothCentre + wave.toothRadius).toBeCloseTo(14, 9);
    expect(wave.gapCentre - wave.gapRadius).toBeCloseTo(11, 9);
  });

  it("laesst Kopf- und Lueckenbogen einander glatt beruehren", () => {
    const half = Math.PI / wave.teeth;
    const gapX = wave.gapCentre * Math.cos(half);
    const gapZ = wave.gapCentre * Math.sin(half);
    const distance = Math.hypot(gapX - wave.toothCentre, gapZ);
    expect(distance).toBeCloseTo(wave.toothRadius + wave.gapRadius, 6);
  });

  /**
   * Der Umriss bleibt zwischen Grund und Kopf und erreicht beide - eine
   * gerade Anzahl Schritte setzt je eine Ecke genau auf den Scheitel.
   */
  it("bleibt zwischen Grund und Kopf und erreicht beide", () => {
    const radii = roundWaveCorners(wave).map(({ radiusX }) => radiusX);
    expect(Math.max(...radii)).toBeCloseTo(14, 6);
    expect(Math.min(...radii)).toBeCloseTo(11, 6);
  });

  /** Die Winkel steigen rund herum - darauf verlassen sich Netz und Deckel. */
  it("laesst die Winkel rund herum steigen", () => {
    const angles = roundWaveCorners(wave).map(({ angle }) => angle);
    for (let index = 1; index < angles.length; index += 1) {
      expect(angles[index], `${index}`).toBeGreaterThan(angles[index - 1]);
    }
    // Und nach einer Runde ist nicht mehr als ein Vollkreis zusammengekommen.
    expect(angles[angles.length - 1] - angles[0]).toBeLessThan(Math.PI * 2);
  });

  it("gibt je Zahn einen Kopf- und einen Lueckenbogen", () => {
    const arcs = roundToothArcs(wave, 0);
    expect(arcs.tooth.radius).toBeCloseTo(wave.toothRadius, 9);
    expect(arcs.gap.radius).toBeCloseTo(wave.gapRadius, 9);
    // Der Kopfbogen laeuft ueber den Kopf, der Lueckenbogen ueber den Grund.
    const atTooth = { x: arcs.tooth.x + arcs.tooth.radius * Math.cos((arcs.tooth.start + arcs.tooth.end) / 2), z: arcs.tooth.z + arcs.tooth.radius * Math.sin((arcs.tooth.start + arcs.tooth.end) / 2) };
    expect(Math.hypot(atTooth.x, atTooth.z)).toBeCloseTo(14, 6);
    const atGap = { x: arcs.gap.x + arcs.gap.radius * Math.cos((arcs.gap.start + arcs.gap.end) / 2), z: arcs.gap.z + arcs.gap.radius * Math.sin((arcs.gap.start + arcs.gap.end) / 2) };
    expect(Math.hypot(atGap.x, atGap.z)).toBeCloseTo(11, 6);
  });
});

describe("Runde Zaehne am Zahnrad", () => {
  const module = 2;
  /** Runde Zaehne stehen niedriger: Aussendurchmesser = Modul x (Zaehne + 1,2). */
  const diameterFor = (teeth: number) => module * (teeth + 2 * ROUND_GEAR_ADDENDUM);

  const gear = (teeth: number): WorkplaneShape => ({
    id: "g",
    name: "Zahnrad",
    kind: "gear",
    color: "#6f7f8d",
    x: 0,
    z: 0,
    elevation: 0,
    size: diameterFor(teeth),
    width: diameterFor(teeth),
    depth: diameterFor(teeth),
    height: 6,
    rotation: 0,
    teeth,
    gearProfile: "round",
    gearBacklash: 0.2,
  } as WorkplaneShape);

  it("steht niedriger als ein evolventischer Zahn", () => {
    const measures = roundGearMeasures(diameterFor(20), { teeth: 20 } as WorkplaneShape);
    expect(measures.module).toBeCloseTo(module, 9);
    expect(measures.pitchRadius).toBeCloseTo(20, 9);
    expect(measures.tipRadius).toBeCloseTo(20 + ROUND_GEAR_ADDENDUM * module, 9);
    expect(measures.rootRadius).toBeCloseTo(20 - ROUND_GEAR_DEDENDUM * module, 9);
  });

  /**
   * Und die Zusage bleibt dieselbe wie bei der Evolvente: Zwei runde Raeder
   * desselben Moduls kaemmen bei Modul x (z1 + z2) / 2 - gemessen, indem die
   * Umrisse gegeneinander gedreht und auf Ueberdeckung geprueft werden.
   */
  it("kaemmt mit einem zweiten runden Rad desselben Moduls", () => {
    type Point = { x: number; z: number };
    const polygon = (shape: WorkplaneShape, turn: number, offsetX: number): Point[] =>
      gearOutlineCorners(shape.width, shape.depth, shape).map(({ angle, radiusX, radiusZ }) => ({
        x: Math.cos(angle + turn) * radiusX + offsetX,
        z: Math.sin(angle + turn) * radiusZ,
      }));
    const inside = (point: Point, poly: readonly Point[]) => {
      let within = false;
      for (let index = 0, previous = poly.length - 1; index < poly.length; previous = index, index += 1) {
        const a = poly[index];
        const b = poly[previous];
        if ((a.z > point.z) !== (b.z > point.z) && point.x < ((b.x - a.x) * (point.z - a.z)) / (b.z - a.z) + a.x) within = !within;
      }
      return within;
    };
    /*
     * Gezaehlt wird zwischen den **ganzen** Vielecken; gefiltert werden nur
     * die Punkte, die ueberhaupt in der Naehe der Beruehrung liegen - ein
     * Punkt am anderen Ende kann nicht im Gegenrad stecken. Ohne das lief
     * diese Pruefung in die Zeitsperre.
     */
    const overlap = (one: readonly Point[], other: readonly Point[], band: { from: number; to: number }) => {
      const near = (points: readonly Point[]) => points.filter((point) => point.x > band.from && point.x < band.to);
      return near(one).filter((point) => inside(point, other)).length
        + near(other).filter((point) => inside(point, one)).length;
    };

    const a = gear(20);
    const b = gear(30);
    const distance = involuteCentreDistance(module, 20, 30);
    expect(distance).toBeCloseTo(50, 9);
    const polyA = polygon(a, 0, 0);
    const pitchTurn = (Math.PI * 2) / 30;
    /** Erst grob die ganze Zahnteilung ab, dann fein um die beste Stelle. */
    const leastOverlap = (gap: number) => {
      const band = { from: module * 20 * 0.35, to: gap - module * 30 * 0.35 };
      let best = { overlap: Number.POSITIVE_INFINITY, turn: 0 };
      const look = (turn: number) => {
        const found = overlap(polyA, polygon(b, turn, gap), band);
        if (found < best.overlap) best = { overlap: found, turn };
      };
      for (let step = 0; step < 60; step += 1) look((pitchTurn * step) / 60);
      const coarse = best.turn;
      for (let step = -10; step <= 10; step += 1) look(coarse + (pitchTurn * step) / 600);
      return best.overlap;
    };
    expect(leastOverlap(distance)).toBe(0);
    // Gegenprobe: einen Millimeter zu nah geht es nicht mehr.
    expect(leastOverlap(distance - 1)).toBeGreaterThan(0);
  });
});
