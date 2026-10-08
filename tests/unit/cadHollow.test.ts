import { describe, expect, it } from "vitest";
import {
  HOLLOW_SIDES,
  hollowSidesWithoutFace,
  hollowWallLimits,
  MIN_HOLLOW_WALL,
  normalizeHollowOpening,
  normalizeHollowWall,
  openingFaceIndexes,
  sideFaceIndexes,
  toggleHollowSide,
  type HollowFace,
} from "@/lib/cadHollow";

const face = (centre: [number, number, number], normal: [number, number, number]): HollowFace => ({
  centre: { x: centre[0], y: centre[1], z: centre[2] },
  normal: { x: normal[0], y: normal[1], z: normal[2] },
});

/** Die sechs Flaechen eines Kastens von 20 x 20 x 30, in HOLLOW_SIDES-Reihenfolge. */
const BOX_FACES: HollowFace[] = [
  face([0, 30, 0], [0, 1, 0]),
  face([0, 0, 0], [0, -1, 0]),
  face([0, 15, 10], [0, 0, 1]),
  face([0, 15, -10], [0, 0, -1]),
  face([-10, 15, 0], [-1, 0, 0]),
  face([10, 15, 0], [1, 0, 0]),
];

describe("Die Wandstaerke", () => {
  it("laesst zwei Waende und Hohlraum dazwischen", () => {
    const limits = hollowWallLimits({ width: 20, depth: 20, height: 30 }, ["top"]);
    expect(limits.min).toBe(MIN_HOLLOW_WALL);
    // 20 / 2 * 0,4 = 4: zwei Waende von 4 mm lassen 12 mm Hohlraum.
    expect(limits.max).toBeCloseTo(4, 6);
  });

  /**
   * Eine Abmessung zaehlt nur mit, wenn beide ihrer Seiten zu bleiben - dort
   * muessen zwei Waende hineinpassen. Eine flache Schale von 6 mm Hoehe darf
   * darum eine Wand von mehr als 1,2 mm haben, sonst waere jede flache Form
   * unaushoehlbar.
   */
  it("zaehlt eine Abmessung nur mit, wenn beide ihrer Seiten zu bleiben", () => {
    const flat = { width: 60, depth: 60, height: 6 };
    expect(hollowWallLimits(flat, []).max).toBeCloseTo(1.2, 6);
    expect(hollowWallLimits(flat, ["top"]).max).toBeCloseTo(12, 6);
    // Unten statt oben aendert daran nichts: in beiden Faellen faellt die Hoehe weg.
    expect(hollowWallLimits(flat, ["bottom"]).max).toBeCloseTo(12, 6);
  });

  /**
   * Dasselbe quer: Ein langer, schmaler Riegel mit offener Vorderseite wird
   * nicht mehr von seiner Tiefe begrenzt, wohl aber von seiner Breite.
   */
  it("laesst eine offene Seite die Abmessung quer dazu fallen", () => {
    const bar = { width: 10, depth: 4, height: 40 };
    expect(hollowWallLimits(bar, []).max).toBeCloseTo(0.8, 6);
    expect(hollowWallLimits(bar, ["front"]).max).toBeCloseTo(2, 6);
    expect(hollowWallLimits(bar, ["left"]).max).toBeCloseTo(0.8, 6);
  });

  /**
   * Bleibt keine Abmessung uebrig, zaehlt die kleinste von allen. Von so einem
   * Koerper ist nichts mehr da, was eine Wand traegt - eine grosszuegige
   * Grenze wuerde das nur verschleiern.
   */
  it("nimmt die kleinste Abmessung, wenn jede Richtung offen ist", () => {
    const box = { width: 40, depth: 30, height: 8 };
    expect(hollowWallLimits(box, [...HOLLOW_SIDES]).max).toBeCloseTo(1.6, 6);
  });

  it("haelt sich an die Grenzen", () => {
    const box = { width: 20, depth: 20, height: 30 };
    expect(normalizeHollowWall(2, box, ["top"])).toBe(2);
    expect(normalizeHollowWall(99, box, ["top"])).toBeCloseTo(4, 6);
    expect(normalizeHollowWall(0, box, ["top"])).toBe(MIN_HOLLOW_WALL);
  });

  it("nimmt die halbe Hoechststaerke, wenn nichts gesetzt ist", () => {
    expect(normalizeHollowWall(undefined, { width: 20, depth: 20, height: 30 }, ["top"])).toBeCloseTo(2, 6);
  });

  it("laesst auch einen sehr kleinen Koerper noch eine Wand haben", () => {
    const tiny = { width: 1, depth: 1, height: 1 };
    expect(hollowWallLimits(tiny, []).max).toBe(MIN_HOLLOW_WALL);
    expect(normalizeHollowWall(5, tiny, [])).toBe(MIN_HOLLOW_WALL);
  });
});

describe("Welche Seiten offen bleiben", () => {
  it("findet zu jeder Seite ihre eigene Flaeche", () => {
    // Die Richtungen sind die des Ansichtswuerfels: vorn ist +z, hinten -z.
    expect(sideFaceIndexes(BOX_FACES, "top")).toEqual([0]);
    expect(sideFaceIndexes(BOX_FACES, "bottom")).toEqual([1]);
    expect(sideFaceIndexes(BOX_FACES, "front")).toEqual([2]);
    expect(sideFaceIndexes(BOX_FACES, "back")).toEqual([3]);
    expect(sideFaceIndexes(BOX_FACES, "left")).toEqual([4]);
    expect(sideFaceIndexes(BOX_FACES, "right")).toEqual([5]);
  });

  it("legt mehrere Seiten zusammen, jede Flaeche nur einmal", () => {
    expect(openingFaceIndexes(BOX_FACES, ["top", "bottom"])).toEqual([0, 1]);
    expect(openingFaceIndexes(BOX_FACES, ["left", "right", "top"])).toEqual([0, 4, 5]);
    expect(openingFaceIndexes(BOX_FACES, [...HOLLOW_SIDES])).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("laesst bei keiner Seite alles zu", () => {
    expect(openingFaceIndexes(BOX_FACES, [])).toEqual([]);
  });

  /**
   * Der Fall, an dem die einfache Regel "die aeusserste Flaeche" scheitert:
   * Bei einem liegenden Rohr liegt die Mitte des Mantels genauso hoch wie die
   * der Deckel. Es zaehlt, wohin die Flaeche schaut.
   */
  it("nimmt den Mantel nicht fuer einen Deckel", () => {
    const lyingPipe: HollowFace[] = [
      face([0, 10, 0], [1, 0, 0]),
      face([0, 10, 0], [-1, 0, 0]),
      face([0, 20, 0], [0, 1, 0]),
    ];
    expect(sideFaceIndexes(lyingPipe, "top")).toEqual([2]);
  });

  /**
   * Eine Oberseite mit einem Loch darin besteht aus mehreren Flaechen auf
   * derselben Hoehe. Bleibt nur eine davon offen, ist der Koerper nicht offen,
   * sondern nur angebohrt.
   */
  it("nimmt alle Flaechen derselben Hoehe mit", () => {
    const holedTop: HollowFace[] = [
      face([-5, 30, 0], [0, 1, 0]),
      face([5, 30, 0], [0, 1, 0]),
      face([0, 30.05, 5], [0, 1, 0]),
      face([0, 0, 0], [0, -1, 0]),
    ];
    expect(sideFaceIndexes(holedTop, "top")).toEqual([0, 1, 2]);
  });

  it("nimmt eine leicht schraege Deckflaeche noch mit", () => {
    // Ein verjuengter Koerper: die Deckflaeche steht um etwa 20 Grad schraeg.
    const radians = (20 * Math.PI) / 180;
    const tapered: HollowFace[] = [
      face([0, 25, 0], [Math.sin(radians), Math.cos(radians), 0]),
      face([0, 0, 0], [0, -1, 0]),
    ];
    expect(sideFaceIndexes(tapered, "top")).toEqual([0]);
  });

  it("haelt eine Seitenwand heraus, auch wenn sie leicht geneigt ist", () => {
    const leaning: HollowFace[] = [
      face([0, 30, 0], [0, 1, 0]),
      face([0, 29, 10], [0, 0.5, 0.87]),
    ];
    expect(sideFaceIndexes(leaning, "top")).toEqual([0]);
  });

  it("gibt nichts zurueck, wenn es keine Flaeche gibt", () => {
    expect(sideFaceIndexes([], "top")).toEqual([]);
    expect(sideFaceIndexes([face([0, 5, 0], [1, 0, 0])], "top")).toEqual([]);
  });

  /**
   * Eine gewaehlte Seite ohne Flaeche wird gemeldet, nicht uebergangen: Sonst
   * bekaeme man einen Koerper mit einer Oeffnung weniger als bestellt und
   * keinen Hinweis darauf.
   */
  it("nennt die gewaehlten Seiten, auf denen keine Flaeche liegt", () => {
    const sphereLike: HollowFace[] = [face([0, 10, 0], [0, 0.3, 0.95])];
    expect(hollowSidesWithoutFace(sphereLike, ["front"])).toEqual([]);
    expect(hollowSidesWithoutFace(sphereLike, ["top", "front", "left"])).toEqual(["top", "left"]);
    expect(hollowSidesWithoutFace(BOX_FACES, [...HOLLOW_SIDES])).toEqual([]);
  });
});

describe("Die Liste der offenen Seiten", () => {
  it("raeumt auf: nur gueltige Seiten, jede einmal, in fester Reihenfolge", () => {
    expect(normalizeHollowOpening(["right", "top", "right"])).toEqual(["top", "right"]);
    expect(normalizeHollowOpening(["oben", "top", 7, null])).toEqual(["top"]);
    expect(normalizeHollowOpening("top")).toEqual([]);
    expect(normalizeHollowOpening(undefined)).toEqual([]);
  });

  /**
   * Die feste Reihenfolge ist kein Schmuck: Zwei Auswahlen derselben Seiten
   * muessen sich gleich vergleichen, egal in welcher Reihenfolge angeklickt
   * wurde - sonst rechnet das Werkzeug neu, wo sich nichts geaendert hat.
   */
  it("vergleicht sich gleich, egal in welcher Reihenfolge geklickt wurde", () => {
    const one = normalizeHollowOpening(["left", "top", "back"]);
    const other = normalizeHollowOpening(["back", "left", "top"]);
    expect(one).toEqual(other);
  });

  it("schaltet eine Seite an und wieder aus", () => {
    expect(toggleHollowSide([], "front")).toEqual(["front"]);
    expect(toggleHollowSide(["front"], "front")).toEqual([]);
    expect(toggleHollowSide(["front"], "top")).toEqual(["top", "front"]);
    expect(toggleHollowSide(["top", "front"], "front")).toEqual(["top"]);
  });
});
