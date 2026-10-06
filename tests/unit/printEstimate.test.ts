import { describe, expect, it } from "vitest";
import {
  DEFAULT_PRINT_MATERIAL,
  FILAMENT_DIAMETER_MM,
  PRINT_MATERIALS,
  PRINT_MATERIAL_DENSITY,
  normalizePrintMaterial,
  printEstimate,
} from "@/lib/printEstimate";

describe("Das Material", () => {
  it("faellt auf PLA zurueck, wenn nichts Brauchbares kommt", () => {
    expect(normalizePrintMaterial("petg")).toBe("petg");
    expect(normalizePrintMaterial("holz")).toBe(DEFAULT_PRINT_MATERIAL);
    expect(normalizePrintMaterial(null)).toBe(DEFAULT_PRINT_MATERIAL);
    expect(normalizePrintMaterial(7)).toBe(DEFAULT_PRINT_MATERIAL);
  });

  it("hat fuer jedes angebotene Material eine Dichte", () => {
    PRINT_MATERIALS.forEach((material) => {
      expect(PRINT_MATERIAL_DENSITY[material], material).toBeGreaterThan(0.9);
      expect(PRINT_MATERIAL_DENSITY[material], material).toBeLessThan(1.6);
    });
  });
});

describe("Die Schaetzung", () => {
  /**
   * Ein Wuerfel von 10 mm Kante: 1000 mm3, also ein Kubikzentimeter. In PLA
   * (1,24 g/cm3) sind das 1,24 g.
   */
  it("rechnet einen Kubikzentimeter in Gramm um", () => {
    const estimate = printEstimate(1000, "pla");
    expect(estimate.volumeCm3).toBeCloseTo(1, 9);
    expect(estimate.grams).toBeCloseTo(1.24, 9);
  });

  it("richtet sich nach der Dichte des Materials", () => {
    expect(printEstimate(1000, "abs").grams).toBeCloseTo(1.04, 9);
    expect(printEstimate(1000, "petg").grams).toBeGreaterThan(printEstimate(1000, "abs").grams);
  });

  /**
   * Der Faden ist ein Zylinder von 1,75 mm: ein Querschnitt von 2,405 mm2.
   * Ein Kubikzentimeter ist darum gut 41,6 cm Faden.
   */
  it("rechnet das Volumen in Filamentlaenge um", () => {
    const section = Math.PI * (FILAMENT_DIAMETER_MM / 2) ** 2;
    expect(printEstimate(1000).filamentMeters).toBeCloseTo(1000 / section / 1000, 9);
    expect(printEstimate(1000).filamentMeters).toBeCloseTo(0.4158, 4);
  });

  it("waechst geradlinig mit dem Volumen", () => {
    const one = printEstimate(1000, "pla");
    const ten = printEstimate(10_000, "pla");
    expect(ten.grams).toBeCloseTo(one.grams * 10, 9);
    expect(ten.filamentMeters).toBeCloseTo(one.filamentMeters * 10, 9);
  });

  /** Die Laenge haengt nicht am Material - nur das Gewicht tut es. */
  it("gibt fuer jedes Material dieselbe Laenge", () => {
    const lengths = PRINT_MATERIALS.map((material) => printEstimate(5000, material).filamentMeters);
    expect(new Set(lengths.map((value) => value.toFixed(9))).size).toBe(1);
  });

  it("faengt ein Volumen ab, das keine Zahl ist", () => {
    expect(printEstimate(Number.NaN).grams).toBe(0);
    expect(printEstimate(-500).volumeCm3).toBe(0);
    expect(printEstimate(Number.POSITIVE_INFINITY).grams).toBe(0);
  });

  it("nimmt PLA, wenn kein Material genannt wird", () => {
    expect(printEstimate(1000).material).toBe(DEFAULT_PRINT_MATERIAL);
  });
});
