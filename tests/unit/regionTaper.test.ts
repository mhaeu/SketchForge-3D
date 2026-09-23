import { describe, expect, it } from "vitest";
import { taperPositionsInRegion, type ResizeRegion } from "@/lib/regionResize";
import { regionTaperIsUntouched, untouchedRegionTaper } from "@/lib/regionTaper";

/** Ein geschlossener Kasten als Dreieckssuppe, so wie ein Netz abgelegt ist. */
const quad = (a: number[], b: number[], c: number[], d: number[]) => [...a, ...c, ...b, ...a, ...d, ...c];
function boxSoup(minX: number, maxX: number, minY: number, maxY: number, minZ: number, maxZ: number) {
  const c = (x: number, y: number, z: number) => [x, y, z];
  const p = [
    c(minX, minY, minZ), c(maxX, minY, minZ), c(maxX, maxY, minZ), c(minX, maxY, minZ),
    c(minX, minY, maxZ), c(maxX, minY, maxZ), c(maxX, maxY, maxZ), c(minX, maxY, maxZ),
  ];
  return [[0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7], [1, 5, 6, 2], [3, 2, 6, 7], [4, 5, 1, 0]]
    .flatMap(([a, b, cc, d]) => quad(p[a], p[b], p[cc], p[d]));
}

type P = [number, number, number];
const points = (positions: number[]): P[] =>
  Array.from({ length: positions.length / 3 }, (_, i) => [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]]);

/** Jede Kante einer geschlossenen Flaeche wird von genau zwei Dreiecken begangen. */
function watertight(positions: number[]) {
  const uses = new Map<string, number>();
  const key = (i: number) => points(positions)[i].map((v) => v.toFixed(6)).join(",");
  for (let t = 0; t + 2 < positions.length / 3; t += 3) {
    for (let e = 0; e < 3; e += 1) {
      const a = key(t + e);
      const b = key(t + ((e + 1) % 3));
      if (a === b) continue;
      const edge = a < b ? `${a}|${b}` : `${b}|${a}`;
      uses.set(edge, (uses.get(edge) ?? 0) + 1);
    }
  }
  return [...uses.values()].every((count) => count === 2);
}

/** Ein Koerper von 20 x 40 x 20, Unterkante bei null. */
const body = boxSoup(-10, 10, 0, 40, -10, 10);
const whole: ResizeRegion = { minX: -10, maxX: 10, minY: 0, maxY: 40, minZ: -10, maxZ: 10 };
const plain = untouchedRegionTaper(whole);

describe("Verjuengung eines Teilbereichs", () => {
  it("erkennt, dass nichts eingestellt ist", () => {
    expect(regionTaperIsUntouched(whole, plain)).toBe(true);
    expect(regionTaperIsUntouched(whole, { ...plain, edges: { ...plain.edges, left: -4 } })).toBe(false);
    expect(regionTaperIsUntouched(whole, { ...plain, heights: { ...plain.heights, left: 0.5 } })).toBe(false);
  });

  it("verjuengt den ganzen Koerper, wenn der Kasten ihn ganz umfasst", () => {
    const result = taperPositionsInRegion(body, whole, { left: -5, right: 5, front: -10, back: 10 }, plain.heights);
    const top = points(result).filter((p) => p[1] > 39.9);
    expect(Math.max(...top.map((p) => Math.abs(p[0])))).toBeCloseTo(5, 6);
    const bottom = points(result).filter((p) => p[1] < 0.1);
    expect(Math.max(...bottom.map((p) => Math.abs(p[0])))).toBeCloseTo(10, 6);
    expect(watertight(result)).toBe(true);
  });

  it("laesst alles ausserhalb des Kastens stehen", () => {
    /*
     * Das war der Fehler: Verjuengt wurde ueber die ganze Hoehe, egal wie
     * hoch der Kasten stand. Jetzt endet die Neigung an seiner Oberkante,
     * und darueber steht der Koerper unveraendert weiter.
     */
    const slice: ResizeRegion = { ...whole, minY: 10, maxY: 20 };
    const result = taperPositionsInRegion(body, slice, { left: -5, right: 5, front: -10, back: 10 }, plain.heights);
    const above = points(result).filter((p) => p[1] > 20 + 1e-6);
    expect(above.length).toBeGreaterThan(0);
    expect(Math.max(...above.map((p) => Math.abs(p[0])))).toBeCloseTo(10, 6);
    const below = points(result).filter((p) => p[1] < 10 - 1e-6);
    expect(Math.max(...below.map((p) => Math.abs(p[0])))).toBeCloseTo(10, 6);
    // An der Oberkante des Kastens treffen beide aufeinander: die verjuengte
    // Seitenflaeche bei fuenf und das unveraenderte Material daran bei zehn.
    const atTop = points(result).filter((p) => Math.abs(p[1] - 20) < 1e-6);
    expect(atTop.some((p) => Math.abs(Math.abs(p[0]) - 5) < 1e-6)).toBe(true);
    expect(atTop.some((p) => Math.abs(Math.abs(p[0]) - 10) < 1e-6)).toBe(true);
  });

  it("bleibt dabei dicht", () => {
    const slice: ResizeRegion = { ...whole, minY: 10, maxY: 20 };
    expect(watertight(taperPositionsInRegion(body, slice, { left: -5, right: 5, front: -10, back: 10 }, plain.heights))).toBe(true);
  });

  it("verjuengt nur ein Stueck der Laenge und laesst den Rest voll", () => {
    // Auch quer wird jetzt begrenzt: Wer nur ein Stueck der Laenge verjuengt,
    // bekommt an dessen Ende eine senkrechte Wand.
    const part: ResizeRegion = { ...whole, minZ: -10, maxZ: 0 };
    const result = taperPositionsInRegion(body, part, { left: -5, right: 5, front: -10, back: 0 }, plain.heights);
    const topFront = points(result).filter((p) => p[1] > 39.9 && p[2] < -1e-6);
    const topBack = points(result).filter((p) => p[1] > 39.9 && p[2] > 1e-6);
    expect(Math.max(...topFront.map((p) => Math.abs(p[0])))).toBeCloseTo(5, 6);
    expect(Math.max(...topBack.map((p) => Math.abs(p[0])))).toBeCloseTo(10, 6);
    expect(watertight(result)).toBe(true);
  });

  it("senkt eine Seite ab und laesst den Rest stehen", () => {
    const result = taperPositionsInRegion(body, whole, plain.edges, { left: 0.25, right: 1, front: 1, back: 1 });
    const left = points(result).filter((p) => Math.abs(p[0] + 10) < 1e-6);
    const right = points(result).filter((p) => Math.abs(p[0] - 10) < 1e-6);
    expect(Math.max(...left.map((p) => p[1]))).toBeCloseTo(10, 6);
    expect(Math.max(...right.map((p) => p[1]))).toBeCloseTo(40, 6);
    expect(watertight(result)).toBe(true);
  });

  it("ruehrt nichts an, wenn der Kasten unveraendert beschrieben wird", () => {
    const result = taperPositionsInRegion(body, whole, plain.edges, plain.heights);
    // Geschnitten wird, aber die Oberflaeche bleibt, wo sie war.
    points(result).forEach((p) => {
      expect(Math.abs(p[0]) <= 10 + 1e-6 && p[1] >= -1e-6 && p[1] <= 40 + 1e-6 && Math.abs(p[2]) <= 10 + 1e-6).toBe(true);
    });
    expect(watertight(result)).toBe(true);
  });
});
