/**
 * holePattern.ts
 *
 * Ein Lochmuster auf einer flachen Flaeche: Lueftungsgitter, Lautsprecherfeld,
 * Korbboden, Gehaeusedeckel.
 *
 * Gerechnet wird in der Flaeche, in den Koordinaten ihrer Arbeitsebene (x
 * laengs, z quer - siehe `placementWorkplane.ts`), und das Ergebnis sind die
 * Mitten der Loecher. Was daraus im Editor wird - eine Aussparung je Mitte,
 * mit dem Koerper gruppiert -, entscheidet der Aufrufer; hier steht nur, wo
 * sie hingehoeren und welche hineinpassen.
 *
 * Zwei Anordnungen:
 *
 * - **Raster**: Zeilen und Spalten im Abstand `spacing`. Der naechste Nachbar
 *   liegt eine Teilung weit weg, der diagonale eine Teilung mal Wurzel 2.
 * - **Versetzt**: Jede zweite Zeile um eine halbe Teilung geschoben, und die
 *   Zeilen entsprechend enger - `spacing * sqrt(3) / 2`. Erst damit liegt
 *   **jeder** der sechs Nachbarn genau eine Teilung weit weg; mit dem
 *   Zeilenabstand des Rasters waeren die versetzten Nachbarn naeher und die
 *   Steglinien ungleich dick. Das ist die Packung, die ein Gitter
 *   gleichmaessig macht.
 *
 * Ein Loch entsteht nur, wenn es **ganz** in der Flaeche liegt, mit dem
 * Randabstand ringsum - auch um die Oeffnungen der Flaeche herum, denn eine
 * Bohrung, die ein Lueftungsloch anschneidet, laesst eine Schneide stehen.
 *
 * Nach Layerling 1.62.0 (#223), wo es die Honigwabe als Form abgeloest hat.
 */

import { placementWorkplaneCoordinates, placementWorkplanePoint, type PlacementWorkplane } from "@/lib/placementWorkplane";
import type { PlanarMeshFace } from "@/lib/meshPlanarFaces";

export type HolePatternKind = "round" | "square" | "rectangle" | "hexagon" | "slot";

export const HOLE_PATTERN_KINDS: readonly HolePatternKind[] = ["round", "square", "rectangle", "hexagon", "slot"];

export const DEFAULT_HOLE_PATTERN_KIND: HolePatternKind = "round";
export const DEFAULT_HOLE_PATTERN_SIZE = 4;
export const DEFAULT_HOLE_PATTERN_LENGTH = 12;
export const DEFAULT_HOLE_PATTERN_SPACING = 6;
export const DEFAULT_HOLE_PATTERN_MARGIN = 2;

export const MIN_HOLE_PATTERN_SIZE = 0.4;
export const MAX_HOLE_PATTERN_SIZE = 200;
export const MAX_HOLE_PATTERN_MARGIN = 200;

/**
 * Hoechstens so viele Loecher. Jedes wird im Editor eine eigene Aussparung,
 * und alle zusammen werden beim Gruppieren einmal gegen den Koerper gerechnet;
 * darueber wartet man laenger, als das Muster wert ist. Dieselbe Grenze zieht
 * Layerling.
 */
export const MAX_HOLE_PATTERN_COUNT = 400;

/** Die Rundung eines runden Loches im Umriss - fein genug fuer den Randabstand. */
const ROUND_OUTLINE_SIDES = 24;

export type HolePatternArrangement = "grid" | "staggered";

export type HolePatternSettings = {
  kind: HolePatternKind;
  /** Die Weite quer zur Laenge, in mm: Durchmesser, Schluesselweite, Breite. */
  size: number;
  /** Nur fuer Rechteck und Schlitz: die Laenge in mm. */
  length?: number;
  /** Mitte zu Mitte, in mm. */
  spacing: number;
  arrangement: HolePatternArrangement;
  /** Abstand zum Rand der Flaeche und zu ihren Oeffnungen, in mm. */
  margin: number;
  /** Drehung des Musters in der Flaeche, in Grad. */
  angle?: number;
};

/** Ein Punkt in der Flaeche, in den Koordinaten ihrer Arbeitsebene. */
export type HolePatternPoint = { x: number; z: number };

export type HolePatternFace = {
  /** Der Aussenrand, als geschlossener Zug. */
  outline: ReadonlyArray<HolePatternPoint>;
  /** Oeffnungen in der Flaeche - Bohrungen, Ausschnitte. */
  openings?: ReadonlyArray<ReadonlyArray<HolePatternPoint>>;
};

export function normalizeHolePatternKind(value: unknown): HolePatternKind {
  return HOLE_PATTERN_KINDS.includes(value as HolePatternKind) ? (value as HolePatternKind) : DEFAULT_HOLE_PATTERN_KIND;
}

export function normalizeHolePatternArrangement(value: unknown): HolePatternArrangement {
  return value === "staggered" ? "staggered" : "grid";
}

function clamp(value: unknown, fallback: number, min: number, max: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value * 100) / 100));
}

/** Nimmt ein Loch zwei Masse? Rechteck und Schlitz schon, der Rest nicht. */
export function holePatternHasLength(kind: HolePatternKind) {
  return kind === "rectangle" || kind === "slot";
}

/**
 * Die kleinste Teilung, die noch einen Steg laesst: die groesste Ausdehnung
 * des Loches plus 0,8 mm. Feiner als 0,8 mm druckt kein FDM-Drucker als Wand -
 * dasselbe Mass, das die Raendelung begrenzt.
 */
export const MIN_HOLE_PATTERN_WEB = 0.8;

export function minHolePatternSpacing(settings: Pick<HolePatternSettings, "kind" | "size" | "length">) {
  const size = Math.max(MIN_HOLE_PATTERN_SIZE, settings.size);
  const length = holePatternHasLength(settings.kind) ? Math.max(size, settings.length ?? size) : size;
  return Math.round((Math.max(size, length) + MIN_HOLE_PATTERN_WEB) * 100) / 100;
}

export function normalizeHolePatternSettings(value: Partial<HolePatternSettings> | undefined): HolePatternSettings {
  const kind = normalizeHolePatternKind(value?.kind);
  const size = clamp(value?.size, DEFAULT_HOLE_PATTERN_SIZE, MIN_HOLE_PATTERN_SIZE, MAX_HOLE_PATTERN_SIZE);
  const length = holePatternHasLength(kind)
    ? clamp(value?.length, Math.max(size, DEFAULT_HOLE_PATTERN_LENGTH), size, MAX_HOLE_PATTERN_SIZE)
    : undefined;
  const settings: HolePatternSettings = {
    kind,
    size,
    length,
    spacing: clamp(value?.spacing, DEFAULT_HOLE_PATTERN_SPACING, MIN_HOLE_PATTERN_SIZE, MAX_HOLE_PATTERN_SIZE * 2),
    arrangement: normalizeHolePatternArrangement(value?.arrangement),
    margin: clamp(value?.margin, DEFAULT_HOLE_PATTERN_MARGIN, 0, MAX_HOLE_PATTERN_MARGIN),
    angle: clamp(value?.angle, 0, -180, 180),
  };
  // Eine Teilung unter dem Loch waere kein Muster, sondern ein Ausschnitt.
  return { ...settings, spacing: Math.max(settings.spacing, minHolePatternSpacing(settings)) };
}

/**
 * Der Umriss eines Loches um (0, 0), ungedreht.
 *
 * Die Laenge laeuft in x, die Weite in z. Ein Schlitz ist das Rechteck mit
 * halbrunden Enden - darum seine Laenge nie kuerzer als seine Weite.
 */
export function holePatternOutline(settings: Pick<HolePatternSettings, "kind" | "size" | "length">): HolePatternPoint[] {
  const half = Math.max(MIN_HOLE_PATTERN_SIZE, settings.size) / 2;
  const length = holePatternHasLength(settings.kind) ? Math.max(half * 2, settings.length ?? half * 2) : half * 2;
  const halfLength = length / 2;

  if (settings.kind === "round") {
    return Array.from({ length: ROUND_OUTLINE_SIDES }, (_, index) => {
      const angle = (index / ROUND_OUTLINE_SIDES) * Math.PI * 2;
      return { x: Math.cos(angle) * half, z: Math.sin(angle) * half };
    });
  }

  if (settings.kind === "hexagon") {
    // Schluesselweite: die Weite ueber die Flaechen, wie bei einer Mutter.
    const radius = half / Math.cos(Math.PI / 6);
    return Array.from({ length: 6 }, (_, index) => {
      const angle = (index / 6) * Math.PI * 2 + Math.PI / 6;
      return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius };
    });
  }

  if (settings.kind === "slot") {
    const straight = Math.max(0, halfLength - half);
    const steps = ROUND_OUTLINE_SIDES / 2;
    const points: HolePatternPoint[] = [];
    for (let index = 0; index <= steps; index += 1) {
      const angle = -Math.PI / 2 + (index / steps) * Math.PI;
      points.push({ x: straight + Math.cos(angle) * half, z: Math.sin(angle) * half });
    }
    for (let index = 0; index <= steps; index += 1) {
      const angle = Math.PI / 2 + (index / steps) * Math.PI;
      points.push({ x: -straight + Math.cos(angle) * half, z: Math.sin(angle) * half });
    }
    return points;
  }

  // Quadrat und Rechteck.
  return [
    { x: -halfLength, z: -half },
    { x: halfLength, z: -half },
    { x: halfLength, z: half },
    { x: -halfLength, z: half },
  ];
}

/** Die groesste Ausdehnung eines Loches von seiner Mitte aus. */
export function holePatternReach(settings: Pick<HolePatternSettings, "kind" | "size" | "length">) {
  return holePatternOutline(settings).reduce((reach, point) => Math.max(reach, Math.hypot(point.x, point.z)), 0);
}

function polygonBounds(points: ReadonlyArray<HolePatternPoint>) {
  return points.reduce(
    (bounds, point) => ({
      minX: Math.min(bounds.minX, point.x),
      maxX: Math.max(bounds.maxX, point.x),
      minZ: Math.min(bounds.minZ, point.z),
      maxZ: Math.max(bounds.maxZ, point.z),
    }),
    { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity },
  );
}

/** Liegt der Punkt im Zug? Strahlverfahren, Rand zaehlt als drin. */
export function pointInHolePatternPolygon(point: HolePatternPoint, polygon: ReadonlyArray<HolePatternPoint>) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const a = polygon[previous];
    const b = polygon[index];
    if ((a.z > point.z) === (b.z > point.z)) continue;
    const crossing = a.x + ((point.z - a.z) / (b.z - a.z)) * (b.x - a.x);
    if (crossing > point.x) inside = !inside;
  }
  return inside;
}

/** Der kuerzeste Abstand eines Punktes zum Zug - ohne Vorzeichen. */
export function distanceToHolePatternPolygon(point: HolePatternPoint, polygon: ReadonlyArray<HolePatternPoint>) {
  let best = Infinity;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const a = polygon[previous];
    const b = polygon[index];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const lengthSquared = dx * dx + dz * dz;
    const along = lengthSquared > 0 ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / lengthSquared)) : 0;
    best = Math.min(best, Math.hypot(point.x - (a.x + dx * along), point.z - (a.z + dz * along)));
  }
  return best;
}

function rotated(point: HolePatternPoint, cos: number, sin: number): HolePatternPoint {
  return { x: point.x * cos - point.z * sin, z: point.x * sin + point.z * cos };
}

/**
 * Die Mitten der Loecher, die in diese Flaeche passen.
 *
 * Gesetzt wird um die Mitte des Flaechenrahmens, damit das Muster mittig
 * steht und nicht an einer Ecke anfaengt. Gezaehlt wird von dort nach beiden
 * Seiten, so weit der Rahmen reicht - ein Loch, das nicht ganz hineinpasst,
 * faellt bei der Pruefung heraus und nicht beim Zaehlen.
 */
export function holePatternPlacements(
  face: HolePatternFace,
  settings: HolePatternSettings,
  limit = MAX_HOLE_PATTERN_COUNT,
): HolePatternPoint[] {
  if (face.outline.length < 3) return [];
  const spacing = Math.max(MIN_HOLE_PATTERN_SIZE, settings.spacing);
  const bounds = polygonBounds(face.outline);
  if (!Number.isFinite(bounds.minX) || !Number.isFinite(bounds.minZ)) return [];

  const centreX = (bounds.minX + bounds.maxX) / 2;
  const centreZ = (bounds.minZ + bounds.maxZ) / 2;
  const reach = holePatternReach(settings);
  const radians = ((settings.angle ?? 0) * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const outline = holePatternOutline(settings).map((point) => rotated(point, cos, sin));

  const rowStep = settings.arrangement === "staggered" ? (spacing * Math.sqrt(3)) / 2 : spacing;
  // So weit, dass auch ein gedrehtes Muster den ganzen Rahmen ueberdeckt.
  const span = Math.hypot(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) / 2 + reach + spacing;
  const columns = Math.ceil(span / spacing);
  const rows = Math.ceil(span / rowStep);

  const openings = face.openings ?? [];
  const fits = (centre: HolePatternPoint) => {
    if (!pointInHolePatternPolygon(centre, face.outline)) return false;
    if (distanceToHolePatternPolygon(centre, face.outline) < settings.margin + reach - 1e-9) {
      // Der Rahmen reicht nicht; Punkt fuer Punkt nachsehen, weil ein
      // laengliches Loch naeher an den Rand darf, wenn es laengs dazu liegt.
      for (const corner of outline) {
        const point = { x: centre.x + corner.x, z: centre.z + corner.z };
        if (!pointInHolePatternPolygon(point, face.outline)) return false;
        if (distanceToHolePatternPolygon(point, face.outline) < settings.margin - 1e-9) return false;
      }
    }
    for (const opening of openings) {
      if (opening.length < 3) continue;
      if (pointInHolePatternPolygon(centre, opening)) return false;
      if (distanceToHolePatternPolygon(centre, opening) >= settings.margin + reach) continue;
      for (const corner of outline) {
        const point = { x: centre.x + corner.x, z: centre.z + corner.z };
        if (pointInHolePatternPolygon(point, opening)) return false;
        if (distanceToHolePatternPolygon(point, opening) < settings.margin - 1e-9) return false;
      }
    }
    return true;
  };

  const placements: HolePatternPoint[] = [];
  for (let row = -rows; row <= rows && placements.length < limit; row += 1) {
    const shift = settings.arrangement === "staggered" && Math.abs(row % 2) === 1 ? spacing / 2 : 0;
    for (let column = -columns; column <= columns && placements.length < limit; column += 1) {
      const local = { x: column * spacing + shift, z: row * rowStep };
      const turned = rotated(local, cos, sin);
      const centre = { x: centreX + turned.x, z: centreZ + turned.z };
      if (fits(centre)) placements.push(centre);
    }
  }
  return placements;
}

/**
 * Der Rand einer angeklickten Flaeche, in den Koordinaten ihrer Arbeitsebene.
 *
 * Damit haengt das Muster an derselben Ebene, auf der auch eine neu
 * abgesetzte Form steht - eine Stelle fuer "wo ist auf dieser Flaeche
 * vorne?", nicht zwei.
 */
export function holePatternFaceFromLoops(workplane: PlacementWorkplane, loops: PlanarMeshFace): HolePatternFace {
  const flatten = (loop: ReadonlyArray<number>) => {
    const points: HolePatternPoint[] = [];
    for (let index = 0; index + 2 < loop.length; index += 3) {
      const local = placementWorkplaneCoordinates(workplane, { x: loop[index], y: loop[index + 1], z: loop[index + 2] });
      points.push({ x: local.x, z: local.z });
    }
    return points;
  };
  return { outline: flatten(loops.outline), openings: loops.holes.map(flatten) };
}

/** Die Mitten zurueck in den Raum. */
export function holePatternWorldPoints(workplane: PlacementWorkplane, placements: ReadonlyArray<HolePatternPoint>) {
  return placements.map((placement) => placementWorkplanePoint(workplane, placement.x, placement.z));
}

/**
 * Die Ringe der Loecher fuer die Vorschau, in Weltkoordinaten.
 *
 * Gezeichnet werden nur Linien: Ein Loch ist erst nach dem Setzen eine
 * Aussparung, und bis dahin soll man die Flaeche darunter sehen.
 */
export function holePatternPreviewRings(
  workplane: PlacementWorkplane,
  settings: HolePatternSettings,
  placements: ReadonlyArray<HolePatternPoint>,
) {
  const radians = ((settings.angle ?? 0) * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const outline = holePatternOutline(settings).map((point) => rotated(point, cos, sin));
  return placements.map((placement) => {
    const ring: number[] = [];
    outline.forEach((corner) => {
      const world = placementWorkplanePoint(workplane, placement.x + corner.x, placement.z + corner.z);
      ring.push(world.x, world.y, world.z);
    });
    return ring;
  });
}

/**
 * Die Aussparung zu einer Lochform: welcher Grundkoerper, in welchen Massen.
 *
 * Hier steht die Uebersetzung, damit sie messbar ist - der Geist auf der
 * Flaeche (`holePatternOutline`) und die Aussparung, die spaeter wirklich
 * schneidet, muessen dieselbe Form haben, sonst zeigt die Vorschau etwas
 * anderes als das Ergebnis.
 *
 * - **Rund** ist der Zylinder.
 * - **Quadrat** und **Rechteck** sind der Kasten.
 * - **Sechseck** ist das Vieleck mit sechs Seiten, und `size` ist seine
 *   Schluesselweite - die Weite ueber die Flaechen, wie bei einer Mutter.
 *   Weil das Vieleck ueber die Ecken breiter ist als ueber die Flaechen,
 *   braucht es dafuer eine tiefere als breite Grundflaeche: `size / cos(30)`.
 * - **Schlitz** ist der Rundkasten, dessen Eckenradius seine halbe Breite
 *   ist. Damit sind seine Enden Halbkreise - ein eigener Grundkoerper dafuer
 *   waere ein zweiter Weg zu derselben Form.
 */
export type HolePatternCutter = {
  kind: "cylinder" | "box" | "polygon" | "roundedBox";
  width: number;
  depth: number;
  sides?: number;
  cornerFillet?: number;
  topBottomFillet?: number;
};

export function holePatternCutter(settings: Pick<HolePatternSettings, "kind" | "size" | "length">): HolePatternCutter {
  const size = Math.max(MIN_HOLE_PATTERN_SIZE, settings.size);
  const length = holePatternHasLength(settings.kind) ? Math.max(size, settings.length ?? size) : size;
  switch (settings.kind) {
    case "round":
      return { kind: "cylinder", width: size, depth: size };
    case "hexagon":
      return { kind: "polygon", width: size, depth: size / Math.cos(Math.PI / 6), sides: 6 };
    case "slot":
      return { kind: "roundedBox", width: length, depth: size, cornerFillet: size / 2, topBottomFillet: 0 };
    case "rectangle":
      return { kind: "box", width: length, depth: size };
    default:
      return { kind: "box", width: size, depth: size };
  }
}
