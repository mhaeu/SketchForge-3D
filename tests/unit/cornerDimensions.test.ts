import { describe, expect, it, vi } from "vitest";
import { mergedDimensionPatch, type TypedDimension } from "@/lib/cornerDimensions";

/**
 * Ein Koerper, bei dem das Groessenfeld von *beiden* Massen abhaengt - so wie
 * bei uns `size` das groessere von Breite und Laenge ist. Daran ist zu sehen,
 * ob das zweite Mass auf dem Ergebnis des ersten gerechnet wurde.
 */
type Body = { width: number; depth: number; size: number };

function patchFor(shape: Body, axis: "width" | "depth", text: string): Partial<Body> | null {
  const value = Number(text);
  if (!Number.isFinite(value) || value <= 0) return null;
  return axis === "width"
    ? { width: value, size: Math.max(value, shape.depth) }
    : { depth: value, size: Math.max(shape.width, value) };
}

const body: Body = { width: 10, depth: 10, size: 10 };

function entries(width: [string, string], depth: [string, string]): TypedDimension<"width" | "depth">[] {
  return [
    { axis: "width", value: width[0], original: width[1] },
    { axis: "depth", value: depth[0], original: depth[1] },
  ];
}

describe("Zwei Masse zusammen", () => {
  /**
   * Die tragende Eigenschaft: Das zweite Mass rechnet auf dem Ergebnis des
   * ersten. Ungekettet kaeme size = max(10, 40) = 40 heraus statt 50.
   */
  it("rechnet das zweite auf dem Ergebnis des ersten", () => {
    const patch = mergedDimensionPatch(body, entries(["50", "10"], ["40", "10"]), patchFor);
    expect(patch).toEqual({ width: 50, depth: 40, size: 50 });
  });

  it("gibt einen Flicken heraus und nicht zwei", () => {
    const calls: Array<Partial<Body>> = [];
    const spy = vi.fn((shape: Body, axis: "width" | "depth", text: string) => {
      const patch = patchFor(shape, axis, text);
      if (patch) calls.push(patch);
      return patch;
    });
    const patch = mergedDimensionPatch(body, entries(["20", "10"], ["30", "10"]), spy);
    expect(spy).toHaveBeenCalledTimes(2);
    // Zwei Rechnungen, ein Ergebnis.
    expect(calls.length).toBe(2);
    expect(Object.keys(patch).sort()).toEqual(["depth", "size", "width"]);
  });

  /**
   * Wer nur eines eintippt, soll das andere nicht neu gesetzt bekommen: Das
   * Feld zeigt gerundet an, und das Zurueckschreiben verschoebe den Koerper um
   * die Rundung.
   */
  it("laesst ein unveraendertes Feld aussen vor", () => {
    expect(mergedDimensionPatch(body, entries(["25", "10"], ["10", "10"]), patchFor))
      .toEqual({ width: 25, size: 25 });
    expect(mergedDimensionPatch(body, entries(["10", "10"], ["25", "10"]), patchFor))
      .toEqual({ depth: 25, size: 25 });
  });

  it("zaehlt dazugekommene Leerzeichen nicht als Aenderung", () => {
    expect(mergedDimensionPatch(body, entries([" 10 ", "10"], ["10", "10"]), patchFor)).toEqual({});
  });

  it("gibt nichts her, wenn nichts angefasst wurde", () => {
    const untouched = mergedDimensionPatch(body, entries(["10", "10"], ["10", "10"]), patchFor);
    expect(untouched).toEqual({});
    // Der Aufrufer sieht daran, dass er den Koerper nicht anruehren muss.
    expect(Object.keys(untouched).length).toBe(0);
  });

  /**
   * Eine Eingabe, aus der kein Mass zu lesen ist, uebergeht ihr Feld - das
   * andere gilt trotzdem. Sonst waere eine Vertipper im einen Feld das Ende
   * fuer beide.
   */
  it("uebergeht ein Feld ohne lesbares Mass und laesst das andere gelten", () => {
    expect(mergedDimensionPatch(body, entries(["dreissig", "10"], ["30", "10"]), patchFor))
      .toEqual({ depth: 30, size: 30 });
    expect(mergedDimensionPatch(body, entries(["0", "10"], ["30", "10"]), patchFor))
      .toEqual({ depth: 30, size: 30 });
    /*
     * Und in der anderen Reihenfolge: Das schon Gerechnete darf dabei nicht
     * verlorengehen. Ohne diese Zeile faellt eine Fassung durch, die beim
     * ersten unlesbaren Feld alles Vorige wegwirft - das unlesbare Feld steht
     * oben nur an erster Stelle, wo es nichts zu verwerfen gibt.
     */
    expect(mergedDimensionPatch(body, entries(["30", "10"], ["dreissig", "10"]), patchFor))
      .toEqual({ width: 30, size: 30 });
  });

  it("ruehrt den uebergebenen Koerper nicht an", () => {
    mergedDimensionPatch(body, entries(["50", "10"], ["40", "10"]), patchFor);
    expect(body).toEqual({ width: 10, depth: 10, size: 10 });
  });
});
