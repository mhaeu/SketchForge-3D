import { describe, expect, it } from "vitest";
import { toolbarDensityFor, toolbarRowWidth, type ToolbarDensity, type ToolbarRowItem } from "@/lib/toolbarDensity";

/**
 * Die Leiste im Koerpermodus, wie Chromium sie auslegt, in einer Zeile
 * gemessen am laufenden Editor (2600 px Fenster): voll 2276 px, mittel 2153,
 * kompakt 1846 - jeweils samt Namensfeld (220 px, kompakt 160).
 */
const MEASURED: Record<ToolbarDensity, number> = { full: 2276, medium: 2153, compact: 1846 };

describe("Wie breit eine Zeile der Leiste waere", () => {
  it("zaehlt Kaesten mit ihrer Breite und den Fuellstreifen mit seiner Mindestbreite", () => {
    const row: ToolbarRowItem[] = [{ kind: "box", width: 300 }, { kind: "spacer", minWidth: 220 }, { kind: "box", width: 208 }];
    expect(toolbarRowWidth(row)).toBe(728);
  });

  /**
   * Der Fehler, der die Leiste flackern liess: In der kleinsten Stufe loesen
   * sich die Gruppenkaesten auf (`display: contents`) und messen 0 px. Ihre
   * Abschnitte stehen dann selbst in der Zeile und muessen mitzaehlen.
   */
  it("zaehlt die Abschnitte eines aufgeloesten Gruppenkastens", () => {
    const row: ToolbarRowItem[] = [
      { kind: "contents", children: [{ kind: "box", width: 400 }, { kind: "box", width: 500 }] },
      { kind: "spacer", minWidth: 160 },
      { kind: "contents", children: [{ kind: "box", width: 760 }] },
      { kind: "box", width: 208 },
    ];
    expect(toolbarRowWidth(row)).toBe(2028);
  });

  it("rechnet den Abstand zwischen den Eintraegen dazu, auch zwischen aufgeloesten", () => {
    const row: ToolbarRowItem[] = [{ kind: "contents", children: [{ kind: "box", width: 100 }, { kind: "box", width: 100 }] }, { kind: "box", width: 100 }];
    expect(toolbarRowWidth(row, 4)).toBe(308);
    expect(toolbarRowWidth([], 4)).toBe(0);
  });
});

describe("Welche Stufe gilt", () => {
  const at = (widths: Record<ToolbarDensity, number>) => (density: ToolbarDensity) => widths[density];

  it("nimmt die volle Groesse, wenn sie passt", () => {
    expect(toolbarDensityFor(2400, at(MEASURED))).toBe("full");
  });

  it("geht eine Stufe zurueck, wenn die volle nicht passt", () => {
    expect(toolbarDensityFor(2200, at(MEASURED))).toBe("medium");
  });

  it("geht zwei Stufen zurueck, wenn auch die mittlere nicht passt", () => {
    expect(toolbarDensityFor(2000, at(MEASURED))).toBe("compact");
  });

  /**
   * Passt keine Stufe, bleibt die kleinste und die Leiste bricht um - bei
   * 1400 px der Fall, an dem das Flackern gemessen wurde.
   */
  it("bleibt bei der kleinsten, wenn gar nichts passt", () => {
    expect(toolbarDensityFor(1400, at(MEASURED))).toBe("compact");
  });

  /**
   * Die tragende Eigenschaft: Gefragt wird jede Stufe nach ihrer eigenen
   * Breite, und die Antwort haengt nicht davon ab, welche gerade gilt. Die
   * alte Rechnung nahm die Messung der geltenden Stufe und rechnete sie hoch -
   * in der kleinsten Stufe also von 208 px aus, und "voll" passte scheinbar.
   */
  it("fragt jede Stufe nach ihrer eigenen Breite, von der groessten an", () => {
    const asked: ToolbarDensity[] = [];
    toolbarDensityFor(1400, (density) => {
      asked.push(density);
      return MEASURED[density];
    });
    expect(asked).toEqual(["full", "medium", "compact"]);
  });

  it("nimmt die volle Groesse, solange nichts zu messen ist", () => {
    expect(toolbarDensityFor(0, at(MEASURED))).toBe("full");
    expect(toolbarDensityFor(-5, at(MEASURED))).toBe("full");
  });

  /**
   * Weniger Werkzeuge heissen weniger Breite: Im Skizzenmodus traegt die
   * Leiste andere, und dieselbe Fensterbreite darf dort eine groessere Stufe
   * hergeben.
   */
  it("richtet sich nach dem, was wirklich in der Leiste steht", () => {
    expect(toolbarDensityFor(1400, at({ full: 1100, medium: 1000, compact: 900 }))).toBe("full");
  });
});
