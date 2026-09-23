import { describe, expect, it } from "vitest";
import { filledRevolveSection, type RevolveSectionPolygon } from "@/lib/revolveFill";

/** Die Flaeche eines Querschnitts - sie sagt, wie viel gefuellt wurde. */
function area(polygon: RevolveSectionPolygon) {
  return Math.abs(polygon.reduce((sum, [r, y], index) => {
    const [r1, y1] = polygon[(index + 1) % polygon.length];
    return sum + r * y1 - r1 * y;
  }, 0) / 2);
}

/** Der weiteste Punkt eines gefuellten Querschnitts auf dieser Hoehe. */
function widthAt(polygons: RevolveSectionPolygon[], y: number) {
  return Math.max(0, ...polygons.flatMap((polygon) => polygon.filter(([, py]) => Math.abs(py - y) < 1e-6).map(([r]) => r)));
}

describe("Der volle Querschnitt eines Rotationskoerpers", () => {
  it("fuellt die Bohrung eines Rohrs bis zur Achse", () => {
    /*
     * Ein Rohr, als Rechteck neben der Achse gezeichnet: von fuenf bis zehn
     * im Halbmesser, zwanzig hoch. Voll ist es ein Vollzylinder von zehn.
     */
    const tube: RevolveSectionPolygon = [[5, 0], [10, 0], [10, 20], [5, 20]];
    const filled = filledRevolveSection([tube]);
    expect(filled).toHaveLength(1);
    expect(area(filled[0])).toBeCloseTo(10 * 20, 3);
    expect(widthAt(filled, 10)).toBeCloseTo(10, 6);
  });

  it("fuellt den Innenraum einer Vase, die gar kein Loch im Querschnitt hat", () => {
    /*
     * Eine Vase: aussen bis zehn, innen ausgehoehlt ab Hoehe zwei - ein
     * U-foermiger Querschnitt, der die Achse nur unten beruehrt. Hier gibt es
     * kein Loch, das man weglassen koennte; gefuellt wird zur Achse hin.
     */
    const vase: RevolveSectionPolygon = [
      [0, 0], [10, 0], [10, 20], [8, 20], [8, 2], [0, 2],
    ];
    const filled = filledRevolveSection([vase]);
    expect(filled).toHaveLength(1);
    expect(area(filled[0])).toBeCloseTo(10 * 20, 2);
  });

  it("laesst eine Kerbe von aussen eine Kerbe", () => {
    // Dort ist der weiteste Punkt eben der Kerbengrund - gefuellt wird nur
    // nach innen, nicht nach aussen.
    const grooved: RevolveSectionPolygon = [
      [0, 0], [10, 0], [10, 8], [7, 8], [7, 12], [10, 12], [10, 20], [0, 20],
    ];
    const filled = filledRevolveSection([grooved]);
    expect(widthAt(filled, 10)).toBeCloseTo(7, 6);
    expect(widthAt(filled, 4)).toBeCloseTo(10, 6);
    expect(area(filled[0])).toBeCloseTo(10 * 20 - 3 * 4, 1);
  });

  it("laesst einen vollen Koerper, wie er ist", () => {
    const solid: RevolveSectionPolygon = [[0, 0], [10, 0], [10, 20], [0, 20]];
    expect(area(filledRevolveSection([solid])[0])).toBeCloseTo(10 * 20, 3);
  });

  it("trennt zwei Koerper, zwischen denen nichts steht", () => {
    // Zwei Scheiben uebereinander mit Luft dazwischen bleiben zwei.
    const lower: RevolveSectionPolygon = [[0, 0], [8, 0], [8, 5], [0, 5]];
    const upper: RevolveSectionPolygon = [[0, 12], [6, 12], [6, 18], [0, 18]];
    const filled = filledRevolveSection([lower, upper]);
    expect(filled).toHaveLength(2);
    expect(area(filled[0])).toBeCloseTo(8 * 5, 1);
    expect(area(filled[1])).toBeCloseTo(6 * 6, 1);
  });

  it("folgt einer schraegen Wand", () => {
    // Ein Kegelstumpf, hohl: aussen schraeg von zehn auf fuenf.
    const cone: RevolveSectionPolygon = [[8, 0], [10, 0], [5, 20], [4, 20]];
    const filled = filledRevolveSection([cone]);
    expect(widthAt(filled, 0)).toBeCloseTo(10, 5);
    expect(widthAt(filled, 20)).toBeCloseTo(5, 5);
    expect(widthAt(filled, 10)).toBeCloseTo(7.5, 3);
  });

  it("meldet nichts, wo nichts steht", () => {
    expect(filledRevolveSection([])).toEqual([]);
    expect(filledRevolveSection([[[0, 0], [1, 0]]])).toEqual([]);
  });
});
