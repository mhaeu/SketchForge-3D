/**
 * Muster: die Auswahl mehrfach wiederholt - in einer Reihe oder im Kreis.
 * Lochreihen, Schraubenkreise, die Zaehne eines Rings.
 *
 * Hier stehen nur Zahlen; die Kopien baut der Editor daraus. Gerechnet wird in
 * den Achsen, die auch im Eigenschaftsfeld stehen: X nach rechts, **Y nach
 * oben** (die Aufstellhoehe) und Z nach hinten. Das ist bewusst anders als bei
 * Layerling, von wo die Idee kommt: dort ist Z die Hoehe und Y wird negiert.
 * Wer den dortigen Code danebenlegt, darf die Achsen nicht uebernehmen.
 */

export type PatternMode = "row" | "circle";
export type PatternAxis = "x" | "y" | "z";

export type PatternSettings = {
  mode: PatternMode;
  /** Stuecke im Muster, das Original mitgezaehlt. */
  count: number;
  /** Reihe: Mitte zu Mitte. Negativ laeuft nach der anderen Seite. */
  spacing: number;
  axis: PatternAxis;
  /** Kreis: der Winkel, ueber den sich das Muster erstreckt. 360 schliesst den Ring. */
  angle: number;
  /** Kreis: die Mitte, um die gedreht wird. */
  centreX: number;
  centreZ: number;
  /** Kreis: jede Kopie mitdrehen (wie Zaehne) oder stehen lassen, wie sie ist. */
  turnCopies: boolean;
};

export const PATTERN_MIN_COUNT = 2;
export const PATTERN_MAX_COUNT = 100;

export function defaultPatternSettings(): PatternSettings {
  return { mode: "row", count: 4, spacing: 30, axis: "x", angle: 360, centreX: 0, centreZ: 0, turnCopies: true };
}

export function clampPatternCount(count: number) {
  if (!Number.isFinite(count)) return PATTERN_MIN_COUNT;
  return Math.min(PATTERN_MAX_COUNT, Math.max(PATTERN_MIN_COUNT, Math.round(count)));
}

/** Wie weit die Kopie Nummer `index` in der Reihe versetzt ist (1 = die erste). */
export function rowOffset(settings: Pick<PatternSettings, "spacing" | "axis">, index: number) {
  const distance = settings.spacing * index;
  if (settings.axis === "x") return { dx: distance, dy: 0, dz: 0 };
  if (settings.axis === "y") return { dx: 0, dy: distance, dz: 0 };
  return { dx: 0, dy: 0, dz: distance };
}

/**
 * Der Winkel zwischen zwei Nachbarn auf dem Kreis.
 *
 * Beim vollen Kreis teilen sich **alle** Stuecke die 360 Grad - die letzte
 * Kopie darf nicht auf dem Original landen. Ein Bogen setzt das erste und das
 * letzte Stueck auf seine beiden Enden, also teilen sich die Luecken den
 * Winkel.
 */
export function circleStepDegrees(count: number, angle: number) {
  const pieces = clampPatternCount(count);
  const full = Math.abs(Math.abs(angle) - 360) < 1e-9 || Math.abs(angle) > 360;
  return full ? (360 / pieces) * Math.sign(angle || 1) : angle / (pieces - 1);
}

/**
 * Ein Punkt, um die senkrechte Achse durch `centre` gedreht.
 *
 * Genau die Drehung, die auch der Drehwinkel eines Koerpers beschreibt (die
 * Gierung um die Y-Achse) - nur so passt eine mitgedrehte Kopie zu ihrem
 * eigenen Winkel.
 */
export function turnedAroundUp(point: { x: number; z: number }, centre: { x: number; z: number }, degrees: number) {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = point.x - centre.x;
  const dz = point.z - centre.z;
  return {
    x: centre.x + dx * cos + dz * sin,
    z: centre.z - dx * sin + dz * cos,
  };
}

export type PatternPlacement = {
  x: number;
  z: number;
  elevation: number;
  /** Um wie viel Grad das Stueck gegenueber dem Original gedreht steht. */
  turn: number;
};

/**
 * Wo das Stueck `index` steht (0 ist das Original) und wie weit es gedreht ist.
 *
 * Damit liegt die ganze Geometrie eines Musters an einer Stelle; der Editor
 * klont nur noch die Koerper und setzt diese Werte ein.
 */
export function patternPlacement(
  settings: PatternSettings,
  index: number,
  from: { x: number; z: number; elevation: number },
): PatternPlacement {
  if (settings.mode === "row") {
    const { dx, dy, dz } = rowOffset(settings, index);
    return { x: from.x + dx, z: from.z + dz, elevation: from.elevation + dy, turn: 0 };
  }
  const degrees = circleStepDegrees(settings.count, settings.angle) * index;
  const moved = turnedAroundUp(from, { x: settings.centreX, z: settings.centreZ }, degrees);
  return { x: moved.x, z: moved.z, elevation: from.elevation, turn: settings.turnCopies ? degrees : 0 };
}
