import { describe, expect, it } from "vitest";
import {
  hollowWallLimits,
  MIN_HOLLOW_WALL,
  normalizeHollowWall,
  openingFaceIndexes,
  type HollowFace,
} from "@/lib/cadHollow";

/** Deckel, Boden und vier Waende eines Kastens von 20 x 20 x 30. */
const BOX_FACES: HollowFace[] = [
  { up: 30, normalUp: 1 },
  { up: 0, normalUp: -1 },
  { up: 15, normalUp: 0 },
  { up: 15, normalUp: 0 },
  { up: 15, normalUp: 0 },
  { up: 15, normalUp: 0 },
];

describe("Die Wandstaerke", () => {
  it("laesst zwei Waende und Hohlraum dazwischen", () => {
    const limits = hollowWallLimits({ width: 20, depth: 20, height: 30 }, "top");
    expect(limits.min).toBe(MIN_HOLLOW_WALL);
    // 20 / 2 * 0,4 = 4: zwei Waende von 4 mm lassen 12 mm Hohlraum.
    expect(limits.max).toBeCloseTo(4, 6);
  });

  /**
   * Bei offener Seite steht dort keine Wand. Eine flache Schale von 6 mm Hoehe
   * darf darum eine Wand von mehr als 1,2 mm haben - sonst waere jede flache
   * Form unaushoehlbar.
   */
  it("zaehlt die Hoehe nur mit, wenn oben und unten zu bleiben", () => {
    const flat = { width: 60, depth: 60, height: 6 };
    expect(hollowWallLimits(flat, "none").max).toBeCloseTo(1.2, 6);
    expect(hollowWallLimits(flat, "top").max).toBeCloseTo(12, 6);
  });

  it("haelt sich an die Grenzen", () => {
    const box = { width: 20, depth: 20, height: 30 };
    expect(normalizeHollowWall(2, box, "top")).toBe(2);
    expect(normalizeHollowWall(99, box, "top")).toBeCloseTo(4, 6);
    expect(normalizeHollowWall(0, box, "top")).toBe(MIN_HOLLOW_WALL);
  });

  it("nimmt die halbe Hoechststaerke, wenn nichts gesetzt ist", () => {
    expect(normalizeHollowWall(undefined, { width: 20, depth: 20, height: 30 }, "top")).toBeCloseTo(2, 6);
  });

  it("laesst auch einen sehr kleinen Koerper noch eine Wand haben", () => {
    const tiny = { width: 1, depth: 1, height: 1 };
    expect(hollowWallLimits(tiny, "none").max).toBe(MIN_HOLLOW_WALL);
    expect(normalizeHollowWall(5, tiny, "none")).toBe(MIN_HOLLOW_WALL);
  });
});

describe("Welche Seiten offen bleiben", () => {
  it("nimmt oben den Deckel", () => {
    expect(openingFaceIndexes(BOX_FACES, "top")).toEqual([0]);
  });

  it("nimmt unten den Boden", () => {
    expect(openingFaceIndexes(BOX_FACES, "bottom")).toEqual([1]);
  });

  it("nimmt bei beiden beide, jeden nur einmal", () => {
    expect(openingFaceIndexes(BOX_FACES, "both")).toEqual([0, 1]);
  });

  it("laesst bei keiner Seite alles zu", () => {
    expect(openingFaceIndexes(BOX_FACES, "both").length).toBeGreaterThan(0);
    expect(openingFaceIndexes(BOX_FACES, "none")).toEqual([]);
  });

  /**
   * Der Fall, an dem die einfache Regel "die hoechste Flaeche" scheitert: Bei
   * einem liegenden Rohr liegt die Mitte des Mantels genauso hoch wie die der
   * Deckel. Es zaehlt, wohin die Flaeche schaut.
   */
  it("nimmt den Mantel nicht fuer einen Deckel", () => {
    const lyingPipe: HollowFace[] = [
      { up: 10, normalUp: 0 },
      { up: 10, normalUp: 0 },
      { up: 20, normalUp: 1 },
    ];
    expect(openingFaceIndexes(lyingPipe, "top")).toEqual([2]);
  });

  /**
   * Eine Oberseite mit einem Loch darin besteht aus mehreren Flaechen auf
   * derselben Hoehe. Bleibt nur eine davon offen, ist der Koerper nicht offen,
   * sondern nur angebohrt.
   */
  it("nimmt alle Flaechen derselben Hoehe mit", () => {
    const holedTop: HollowFace[] = [
      { up: 30, normalUp: 1 },
      { up: 30, normalUp: 1 },
      { up: 30.05, normalUp: 1 },
      { up: 0, normalUp: -1 },
    ];
    expect(openingFaceIndexes(holedTop, "top")).toEqual([0, 1, 2]);
  });

  it("nimmt eine leicht schraege Deckflaeche noch mit", () => {
    // Ein verjuengter Koerper: die Deckflaeche steht um etwa 20 Grad schraeg.
    const tapered: HollowFace[] = [
      { up: 25, normalUp: Math.cos((20 * Math.PI) / 180) },
      { up: 0, normalUp: -1 },
    ];
    expect(openingFaceIndexes(tapered, "top")).toEqual([0]);
  });

  it("haelt eine Seitenwand heraus, auch wenn sie leicht geneigt ist", () => {
    const leaning: HollowFace[] = [
      { up: 30, normalUp: 1 },
      { up: 29, normalUp: 0.5 },
    ];
    expect(openingFaceIndexes(leaning, "top")).toEqual([0]);
  });

  it("gibt nichts zurueck, wenn es keine Flaeche gibt", () => {
    expect(openingFaceIndexes([], "top")).toEqual([]);
    expect(openingFaceIndexes([{ up: 5, normalUp: 0 }], "top")).toEqual([]);
  });
});
