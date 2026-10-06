import { describe, expect, it } from "vitest";
import {
  TOOLBAR_BASE_ICON_SIZE,
  TOOLBAR_ICON_STEPS,
  toolbarDensityFor,
  toolbarWidthAtBase,
  toolbarWidthAtSize,
  type ToolbarMeasurement,
} from "@/lib/toolbarDensity";

/**
 * Eine Leiste mit 34 Symbolen, wie sie der Editor im Koerpermodus traegt, und
 * 1660 px festen Abschnitten bei voller Symbolgroesse plus 220 px Namensfeld.
 */
function measured(available: number, currentIconSize = TOOLBAR_BASE_ICON_SIZE): ToolbarMeasurement {
  const icons = 34;
  return {
    available,
    // Bei kleineren Symbolen misst die Leiste entsprechend weniger.
    fixed: 1660 - icons * (TOOLBAR_BASE_ICON_SIZE - currentIconSize),
    flexible: 220,
    icons,
    currentIconSize,
  };
}

describe("Wie breit die Leiste waere", () => {
  it("rechnet die Messung auf die volle Symbolgroesse zurueck", () => {
    // Egal, bei welcher Stufe gemessen wurde: 1660 + 220 = 1880.
    for (const step of TOOLBAR_ICON_STEPS) {
      expect(toolbarWidthAtBase(measured(1600, step.size))).toBeCloseTo(1880, 6);
    }
  });

  it("nennt die Breite jeder Stufe", () => {
    const measurement = measured(1600);
    expect(toolbarWidthAtSize(measurement, 43)).toBeCloseTo(1880, 6);
    // 34 Symbole, je 4 px schmaler: 136 px weniger.
    expect(toolbarWidthAtSize(measurement, 39)).toBeCloseTo(1744, 6);
    expect(toolbarWidthAtSize(measurement, 35)).toBeCloseTo(1608, 6);
  });
});

describe("Welche Stufe gilt", () => {
  it("nimmt die volle Groesse, wenn sie passt", () => {
    expect(toolbarDensityFor(measured(1900))).toBe("full");
  });

  it("geht eine Stufe zurueck, wenn die volle nicht passt", () => {
    expect(toolbarDensityFor(measured(1800))).toBe("medium");
  });

  it("geht zwei Stufen zurueck, wenn auch die mittlere nicht passt", () => {
    expect(toolbarDensityFor(measured(1700))).toBe("compact");
  });

  /**
   * Passt keine Stufe, bleibt die kleinste und die Leiste bricht um. Das ist
   * besser, als die hinteren Gruppen ueber den Rand laufen zu lassen - genau
   * das war der Zustand, der zum Zoomen auf 67 Prozent zwang.
   */
  it("bleibt bei der kleinsten, wenn gar nichts passt", () => {
    expect(toolbarDensityFor(measured(900))).toBe("compact");
  });

  /**
   * Die tragende Eigenschaft: Dieselbe Leiste in derselben Breite muss
   * dieselbe Stufe ergeben, ganz gleich, welche Stufe gerade gilt. Sonst
   * springt sie hin und her, weil jede Stufe die Messung aendert, auf der sie
   * beruht.
   */
  it("entscheidet gleich, egal bei welcher Stufe gemessen wurde", () => {
    for (const available of [900, 1600, 1700, 1750, 1800, 1900, 2400]) {
      const decisions = TOOLBAR_ICON_STEPS.map((step) => toolbarDensityFor(measured(available, step.size)));
      expect(new Set(decisions).size, `bei ${available}px`).toBe(1);
    }
  });

  it("nimmt die volle Groesse, solange nichts zu messen ist", () => {
    expect(toolbarDensityFor({ ...measured(0), available: 0 })).toBe("full");
    expect(toolbarDensityFor({ ...measured(0), available: -5 })).toBe("full");
  });

  /**
   * Weniger Symbole heissen weniger Breite: Im Skizzenmodus traegt die Leiste
   * andere Werkzeuge, und dieselbe Fensterbreite darf dort eine groessere
   * Stufe hergeben.
   */
  it("richtet sich nach dem, was wirklich in der Leiste steht", () => {
    const narrow: ToolbarMeasurement = { available: 1700, fixed: 900, flexible: 0, icons: 18, currentIconSize: 43 };
    expect(toolbarDensityFor(narrow)).toBe("full");
  });
});
