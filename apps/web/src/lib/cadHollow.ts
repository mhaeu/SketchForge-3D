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

/** Welche Seiten offen bleiben. */
export type CadHollowOpening = "none" | "top" | "bottom" | "both";

/** Wie die Waende innen aufeinandertreffen. */
export type CadHollowJoin = "round" | "sharp";

export const CAD_HOLLOW_OPENINGS: readonly CadHollowOpening[] = ["top", "bottom", "both", "none"];

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
 * Die Hoehe zaehlt nur mit, wenn oben und unten zu bleiben: Bei einer offenen
 * Seite steht die Wand dort nicht, und eine flache Schale darf eine Wand
 * haben, die dicker ist als ihre halbe Hoehe.
 */
export function hollowWallLimits(dimensions: HollowDimensions, opening: CadHollowOpening) {
  const across = Math.min(dimensions.width, dimensions.depth);
  const closedTopAndBottom = opening === "none";
  const smallest = closedTopAndBottom ? Math.min(across, dimensions.height) : across;
  const max = Math.max(MIN_HOLLOW_WALL, (smallest / 2) * HOLLOW_WALL_SHARE);
  return { min: MIN_HOLLOW_WALL, max };
}

export function normalizeHollowWall(value: unknown, dimensions: HollowDimensions, opening: CadHollowOpening) {
  const limits = hollowWallLimits(dimensions, opening);
  const wanted = typeof value === "number" && Number.isFinite(value) ? value : limits.max / 2;
  return Math.min(limits.max, Math.max(limits.min, wanted));
}

/** Eine Flaeche, so weit sie fuer die Auswahl zaehlt. */
export type HollowFace = {
  /** Die Hoehe ihrer Mitte entlang der Hochachse des Koerpers. */
  up: number;
  /** Wie weit ihre Normale nach oben zeigt: 1 ganz nach oben, -1 nach unten. */
  normalUp: number;
};

/**
 * Wie weit eine Normale von der Hochachse abweichen darf, um noch als Deckel
 * oder Boden zu gelten. 0,9 sind etwa 26 Grad - das nimmt die leicht schraege
 * Deckflaeche eines verjuengten Koerpers mit, aber keine Seitenwand.
 */
const FACING_UP = 0.9;

/**
 * Welche Flaechen offen bleiben.
 *
 * Gesucht wird nicht einfach die hoechste Flaeche: Bei einem liegenden Rohr
 * liegt die Mitte des Mantels genauso hoch wie die der Deckel. Es zaehlt, wohin
 * die Flaeche **schaut** - und von denen, die nach oben schauen, die hoechste.
 *
 * Mehrere auf derselben Hoehe kommen zusammen heraus: Die Oberseite eines
 * Koerpers mit einem Loch darin besteht aus mehreren Flaechen, und offen
 * bleiben muessen sie alle.
 */
export function openingFaceIndexes(faces: ReadonlyArray<HollowFace>, opening: CadHollowOpening): number[] {
  if (opening === "none" || faces.length === 0) return [];
  const extent = faces.reduce(
    (span, face) => ({ min: Math.min(span.min, face.up), max: Math.max(span.max, face.up) }),
    { min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY },
  );
  // Die Toleranz richtet sich nach dem Koerper: ein Hundertstel seiner Hoehe,
  // mindestens aber ein Hundertstel Millimeter.
  const tolerance = Math.max(0.01, (extent.max - extent.min) * 0.01);

  const pick = (wantsTop: boolean) => {
    const facing = faces
      .map((face, index) => ({ face, index }))
      .filter((entry) => (wantsTop ? entry.face.normalUp >= FACING_UP : entry.face.normalUp <= -FACING_UP));
    if (facing.length === 0) return [];
    const edge = facing.reduce(
      (best, entry) => (wantsTop ? Math.max(best, entry.face.up) : Math.min(best, entry.face.up)),
      wantsTop ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY,
    );
    return facing.filter((entry) => Math.abs(entry.face.up - edge) <= tolerance).map((entry) => entry.index);
  };

  if (opening === "top") return pick(true);
  if (opening === "bottom") return pick(false);
  return [...new Set([...pick(true), ...pick(false)])].sort((one, other) => one - other);
}
