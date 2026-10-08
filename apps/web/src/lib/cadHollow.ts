import type { OcctKernel, ShapeHandle } from "occt-wasm";

/**
 * cadHollow.ts
 *
 * Aushoehlen: Aus einem vollen Koerper wird eine Schale mit einer Wand.
 *
 * Bisher ging das bei uns nur ueber einen zweiten, kleineren Koerper als
 * Abzug - und daran scheiterte jeder Fall, in dem der Innenraum der aeusseren
 * Form folgen soll: eine Schuessel, ein Rohr, alles mit einer Rundung. Der
 * CAD-Kern kann es richtig (`shell`), und seit occt-wasm 5.4.0 auch an
 * scharfen Ecken.
 *
 * Hier stehen die Zahlen und die Auswahl der offenen Seiten; die Rechnung
 * selbst macht der Kern im Arbeiter.
 *
 * Nach Layerling 1.18.x, samt der beiden Nachbesserungen: scharfe oder runde
 * Innenkanten, und die Wand haengt davon ab, welche Seiten offen bleiben.
 */

/**
 * Die sechs Seiten eines Koerpers, in seinem eigenen Rahmen.
 *
 * Die Richtungen sind die des Ansichtswuerfels (viewCubeOrientation.ts): vorn
 * ist +z, hinten -z. So heisst "vorn" hier dieselbe Seite, die der Wuerfel
 * zeigt, wenn man auf "vorn" klickt - und nicht die gegenueberliegende.
 */
export const HOLLOW_SIDES = ["top", "bottom", "front", "back", "left", "right"] as const;
export type HollowSide = (typeof HOLLOW_SIDES)[number];

/** Welche Seiten offen bleiben. Leer heisst: ringsherum zu. */
export type CadHollowOpening = readonly HollowSide[];

/** Wie die Waende innen aufeinandertreffen. */
export type CadHollowJoin = "round" | "sharp";

type HollowDirection = { x: number; y: number; z: number };

const SIDE_DIRECTIONS: Record<HollowSide, HollowDirection> = {
  top: { x: 0, y: 1, z: 0 },
  bottom: { x: 0, y: -1, z: 0 },
  front: { x: 0, y: 0, z: 1 },
  back: { x: 0, y: 0, z: -1 },
  left: { x: -1, y: 0, z: 0 },
  right: { x: 1, y: 0, z: 0 },
};

function isHollowSide(value: unknown): value is HollowSide {
  return typeof value === "string" && (HOLLOW_SIDES as readonly string[]).includes(value);
}

/**
 * Eine Liste offener Seiten, aufgeraeumt: nur gueltige Seiten, jede einmal,
 * in der Reihenfolge von HOLLOW_SIDES. So vergleichen sich zwei Auswahlen
 * gleich, egal in welcher Reihenfolge angeklickt wurde.
 */
export function normalizeHollowOpening(value: unknown): CadHollowOpening {
  if (!Array.isArray(value)) return [];
  const wanted = new Set(value.filter(isHollowSide));
  return HOLLOW_SIDES.filter((side) => wanted.has(side));
}

export function toggleHollowSide(opening: CadHollowOpening, side: HollowSide): CadHollowOpening {
  return opening.includes(side)
    ? opening.filter((entry) => entry !== side)
    : normalizeHollowOpening([...opening, side]);
}

/** Duenner als das haelt kein Druck zusammen. */
export const MIN_HOLLOW_WALL = 0.4;

/**
 * Wie viel von der kleinsten Abmessung die Wand hoechstens einnehmen darf.
 *
 * Zwei Waende muessen hineinpassen und etwas Hohlraum dazwischen lassen. Bei
 * 0,4 der halben Abmessung bleibt ein Fuenftel uebrig - darunter rechnet der
 * Kern noch, heraus kommt aber kein Hohlkoerper mehr, sondern ein Klumpen mit
 * einer Fuge.
 */
const HOLLOW_WALL_SHARE = 0.4;

export type HollowDimensions = { width: number; depth: number; height: number };

/**
 * Die Grenzen der Wandstaerke fuer diesen Koerper.
 *
 * Eine Abmessung zaehlt nur mit, wenn **beide** ihrer Seiten zu bleiben: dann
 * muessen dort zwei Waende hineinpassen. Ist eine der beiden offen, steht dort
 * nur eine Wand, und eine flache Schale darf eine Wand haben, die dicker ist
 * als ihre halbe Hoehe - sonst waere jede flache Form unaushoehlbar.
 *
 * Bleibt keine Abmessung uebrig (jede Richtung an beiden Enden offen), zaehlt
 * die kleinste von allen: Von so einem Koerper ist nichts mehr da, was eine
 * Wand traegt, und eine grosszuegige Grenze wuerde das nur verschleiern.
 */
export function hollowWallLimits(dimensions: HollowDimensions, opening: CadHollowOpening) {
  const open = (side: HollowSide) => opening.includes(side);
  const constrained: number[] = [];
  if (!open("left") && !open("right")) constrained.push(dimensions.width);
  if (!open("front") && !open("back")) constrained.push(dimensions.depth);
  if (!open("top") && !open("bottom")) constrained.push(dimensions.height);
  const smallest = constrained.length > 0
    ? Math.min(...constrained)
    : Math.min(dimensions.width, dimensions.depth, dimensions.height);
  const max = Math.max(MIN_HOLLOW_WALL, (smallest / 2) * HOLLOW_WALL_SHARE);
  return { min: MIN_HOLLOW_WALL, max };
}

export function normalizeHollowWall(value: unknown, dimensions: HollowDimensions, opening: CadHollowOpening) {
  const limits = hollowWallLimits(dimensions, opening);
  const wanted = typeof value === "number" && Number.isFinite(value) ? value : limits.max / 2;
  return Math.min(limits.max, Math.max(limits.min, wanted));
}

/** Eine Flaeche, so weit sie fuer die Auswahl zaehlt - im Rahmen des Koerpers. */
export type HollowFace = {
  /** Die Mitte der Flaeche. */
  centre: HollowDirection;
  /** Ihre Normale, nach aussen zeigend. */
  normal: HollowDirection;
};

/**
 * Wie weit eine Normale von der Richtung einer Seite abweichen darf, um noch
 * als deren Flaeche zu gelten. 0,9 sind etwa 26 Grad - das nimmt die leicht
 * schraege Deckflaeche eines verjuengten Koerpers mit, aber keine Nachbarwand.
 */
const FACING_UP = 0.9;

function along(point: HollowDirection, direction: HollowDirection) {
  return point.x * direction.x + point.y * direction.y + point.z * direction.z;
}

/**
 * Welche Flaechen einer Seite offen bleiben.
 *
 * Gesucht wird nicht einfach die aeusserste Flaeche: Bei einem liegenden Rohr
 * liegt die Mitte des Mantels genauso hoch wie die der Deckel. Es zaehlt,
 * wohin die Flaeche **schaut** - und von denen, die zu dieser Seite schauen,
 * die aeusserste.
 *
 * Mehrere auf derselben Hoehe kommen zusammen heraus: Die Oberseite eines
 * Koerpers mit einem Loch darin besteht aus mehreren Flaechen, und offen
 * bleiben muessen sie alle.
 */
export function sideFaceIndexes(faces: ReadonlyArray<HollowFace>, side: HollowSide): number[] {
  if (faces.length === 0) return [];
  const direction = SIDE_DIRECTIONS[side];
  const reach = faces.map((face) => along(face.centre, direction));
  // Die Toleranz richtet sich nach dem Koerper: ein Hundertstel seiner
  // Ausdehnung in dieser Richtung, mindestens ein Hundertstel Millimeter.
  const tolerance = Math.max(0.01, (Math.max(...reach) - Math.min(...reach)) * 0.01);
  const facing = faces
    .map((face, index) => ({ index, outward: along(face.normal, direction), reach: reach[index] }))
    .filter((entry) => entry.outward >= FACING_UP);
  if (facing.length === 0) return [];
  const edge = facing.reduce((best, entry) => Math.max(best, entry.reach), Number.NEGATIVE_INFINITY);
  return facing.filter((entry) => Math.abs(entry.reach - edge) <= tolerance).map((entry) => entry.index);
}

/** Dieselbe Suche fuer jede gewaehlte Seite, zusammengelegt. */
export function openingFaceIndexes(faces: ReadonlyArray<HollowFace>, opening: CadHollowOpening): number[] {
  const found = new Set<number>();
  opening.forEach((side) => sideFaceIndexes(faces, side).forEach((index) => found.add(index)));
  return [...found].sort((one, other) => one - other);
}

/** Die gewaehlten Seiten, auf denen der Koerper keine passende Flaeche hat. */
export function hollowSidesWithoutFace(faces: ReadonlyArray<HollowFace>, opening: CadHollowOpening): HollowSide[] {
  return opening.filter((side) => sideFaceIndexes(faces, side).length === 0);
}

/**
 * Die Flaechen eines Koerpers, wie die Seitenauswahl sie braucht.
 *
 * Steht hier und nicht im Arbeiter, damit die Durchlaufpruefung genau diese
 * Beschreibung gegen den echten Kern laufen laesst - handgebaute Flaechen
 * sagen nichts darueber, ob Mitte und Normale aus OpenCascade zusammenpassen.
 *
 * `surfaceNormal` liefert die Normale **schon nach aussen gedreht**: An einem
 * Kasten (20 x 30 x 20, mittig auf x und z) gibt der Kern fuer die linke
 * Flaeche (-1,0,0) und fuer die rechte (1,0,0), obwohl die linke "reversed"
 * heisst. Wer das Vorzeichen der Umlaufrichtung noch einmal daraufrechnet,
 * dreht genau die drei Flaechen am unteren Ende jeder Achse nach innen - und
 * dann findet die Suche nach dem Boden keinen. Genau das war hier der Fall:
 * Mit "unten" offen fand das Aushoehlen keine Flaeche und brach ab, und
 * "oben und unten" oeffnete nur den Deckel. Gemessen in occt-wasm 5.5.0
 * (tests/e2e/hollowSides.e2e.ts haelt es fest).
 */
export function describeHollowFaces(cad: OcctKernel, faces: ReadonlyArray<ShapeHandle>): HollowFace[] {
  return faces.map((face) => {
    try {
      const centre = cad.getSurfaceCenterOfMass(face);
      const bounds = cad.uvBounds(face);
      const normal = cad.surfaceNormal(face, (bounds.uMin + bounds.uMax) / 2, (bounds.vMin + bounds.vMax) / 2);
      return {
        centre: { x: centre.x, y: centre.y, z: centre.z },
        normal: { x: normal.x, y: normal.y, z: normal.z },
      };
    } catch {
      // Eine Flaeche, die sich nicht ausmessen laesst, bleibt zu. Lieber ein
      // geschlossener Koerper als ein Abbruch. Eine Normale aus Nullen zeigt
      // zu keiner Seite und wird darum von keiner genommen.
      return { centre: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 0 } };
    }
  });
}
