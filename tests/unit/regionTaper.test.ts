import { describe, expect, it } from "vitest";
import { regionTaperIsUntouched, taperPositionsInSlice, untouchedRegionTaper, type RegionTaper } from "@/lib/regionTaper";
import type { ResizeRegion } from "@/lib/regionResize";

/** Ein Kasten von 20 x 20 x 20, Mitte auf null, Unterkante bei null. */
const region: ResizeRegion = { minX: -10, maxX: 10, minY: 0, maxY: 20, minZ: -10, maxZ: 10 };

function taper(patch: Partial<RegionTaper["edges"]> = {}, heights: Partial<RegionTaper["heights"]> = {}): RegionTaper {
  const plain = untouchedRegionTaper(region);
  return { edges: { ...plain.edges, ...patch }, heights: { ...plain.heights, ...heights } };
}

/** Ein einzelner Punkt, durch die Verformung geschickt. */
function at(x: number, y: number, z: number, t: RegionTaper, slice = region) {
  const [px, py, pz] = taperPositionsInSlice([x, y, z], slice, t);
  return { x: px, y: py, z: pz };
}

describe("Verjuengung eines Teilbereichs", () => {
  it("laesst alles stehen, solange nichts eingestellt ist", () => {
    expect(regionTaperIsUntouched(region, untouchedRegionTaper(region))).toBe(true);
    expect(at(7, 13, -4, untouchedRegionTaper(region))).toEqual({ x: 7, y: 13, z: -4 });
  });

  it("zieht die Deckflaeche des Kastens ein und laesst die Grundflaeche stehen", () => {
    const pulled = taper({ left: -5, right: 5 });
    expect(regionTaperIsUntouched(region, pulled)).toBe(false);
    // Unten: unveraendert. Oben: auf die Haelfte. In der Mitte: dazwischen.
    expect(at(10, 0, 0, pulled).x).toBeCloseTo(10, 9);
    expect(at(10, 20, 0, pulled).x).toBeCloseTo(5, 9);
    expect(at(10, 10, 0, pulled).x).toBeCloseTo(7.5, 9);
  });

  it("stellt eine einzelne Seite schraeg und laesst die andere stehen", () => {
    const leaning = taper({ left: -4 });
    expect(at(-10, 20, 0, leaning).x).toBeCloseTo(-4, 9);
    expect(at(10, 20, 0, leaning).x).toBeCloseTo(10, 9);
    expect(at(-10, 0, 0, leaning).x).toBeCloseTo(-10, 9);
  });

  it("laesst das Material unter dem Kasten in Ruhe und das darueber starr mitfahren", () => {
    /*
     * Genau das macht die Abbildung ueberall stetig: Unten passiert nichts,
     * in der Scheibe waechst die Verjuengung, und oberhalb faehrt alles mit
     * dem fertigen Mass mit. Damit bleibt das Netz dicht, ohne dass etwas
     * geschnitten und wieder zugenaeht werden muesste.
     */
    const slice: ResizeRegion = { ...region, minY: 5, maxY: 15 };
    const pulled = { edges: { left: -5, right: 5, front: -10, back: 10 }, heights: { left: 1, right: 1, front: 1, back: 1 } };
    expect(at(10, 0, 0, pulled, slice).x).toBeCloseTo(10, 9);
    expect(at(10, 5, 0, pulled, slice).x).toBeCloseTo(10, 9);
    expect(at(10, 15, 0, pulled, slice).x).toBeCloseTo(5, 9);
    // Darueber dasselbe Mass, nicht mehr - der obere Teil bleibt, wie er ist.
    expect(at(10, 20, 0, pulled, slice).x).toBeCloseTo(5, 9);
    expect(at(10, 100, 0, pulled, slice).x).toBeCloseTo(5, 9);
  });

  it("bleibt an der Nahtstelle stetig", () => {
    const slice: ResizeRegion = { ...region, minY: 5, maxY: 15 };
    const pulled = taper({ left: -2, right: 8 });
    const below = at(10, 5 - 1e-9, 0, pulled, slice);
    const above = at(10, 5 + 1e-9, 0, pulled, slice);
    expect(above.x).toBeCloseTo(below.x, 6);
    const under = at(10, 15 - 1e-9, 0, pulled, slice);
    const over = at(10, 15 + 1e-9, 0, pulled, slice);
    expect(over.x).toBeCloseTo(under.x, 6);
  });

  it("senkt eine Seite ab und nimmt alles darueber mit nach unten", () => {
    const lowered = taper({}, { left: 0.5 });
    // Links halb so hoch, rechts unveraendert.
    expect(at(-10, 20, 0, lowered).y).toBeCloseTo(10, 9);
    expect(at(10, 20, 0, lowered).y).toBeCloseTo(20, 9);
    // Die Unterkante bleibt liegen.
    expect(at(-10, 0, 0, lowered).y).toBeCloseTo(0, 9);
  });

  it("nimmt das Material ueber der Scheibe um dasselbe Mass mit", () => {
    const slice: ResizeRegion = { ...region, minY: 0, maxY: 10 };
    const lowered = { edges: untouchedRegionTaper(region).edges, heights: { left: 0.5, right: 0.5, front: 1, back: 1 } };
    // Die Scheibe verliert die Haelfte ihrer zehn, also fuenf.
    expect(at(0, 10, 0, lowered, slice).y).toBeCloseTo(5, 9);
    expect(at(0, 20, 0, lowered, slice).y).toBeCloseTo(15, 9);
  });

  it("aendert die Anzahl der Punkte nicht", () => {
    // Nichts wird geschnitten, also bleibt die Netzstruktur, wie sie war.
    const positions = Array.from({ length: 90 }, (_, index) => (index % 7) - 3);
    expect(taperPositionsInSlice(positions, region, taper({ left: -3 }))).toHaveLength(positions.length);
  });
});
