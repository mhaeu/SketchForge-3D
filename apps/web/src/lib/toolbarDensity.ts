/**
 * toolbarDensity.ts
 *
 * Welche Symbolgroesse die Werkzeugleiste gerade tragen kann.
 *
 * Nicht nach Fensterbreite: Wie breit die Leiste wirklich ist, haengt an der
 * Sprache, den eingeblendeten Werkzeugen und dem Entwurfsnamen. Eine Schwelle
 * nach Fensterbreite waere immer geraten - der Editor misst die Leiste und
 * fragt hier nach der Stufe.
 *
 * Nach Layerling, das seine Umschaltbreiten ebenfalls an der gemessenen
 * Breite nachgezogen hat (Issue #54) - nur messen wir sie bei jeder
 * Aenderung neu, statt die Zahlen einmal abzulesen.
 */

export type ToolbarDensity = "full" | "medium" | "compact";

export const TOOLBAR_ICON_STEPS: ReadonlyArray<{ density: ToolbarDensity; size: number }> = [
  { density: "full", size: 43 },
  { density: "medium", size: 39 },
  { density: "compact", size: 35 },
];

export const TOOLBAR_BASE_ICON_SIZE = TOOLBAR_ICON_STEPS[0].size;

export type ToolbarMeasurement = {
  /** Wie breit die Leiste sein darf. */
  available: number;
  /** Die Summe der festen Abschnitte, so breit wie gerade gemessen. */
  fixed: number;
  /** Was die dehnbaren Streifen mindestens brauchen (das Namensfeld). */
  flexible: number;
  /** Wie viele Symbole in der Leiste stehen. */
  icons: number;
  /** Die Symbolgroesse, bei der `fixed` gemessen wurde. */
  currentIconSize: number;
};

/**
 * Wie breit die Leiste bei voller Symbolgroesse waere.
 *
 * Jedes Symbol ist bei der gemessenen Stufe `base - current` schmaler als bei
 * voller Groesse. Zurueckgerechnet haengt die Zahl nicht mehr an der Stufe,
 * die gerade gilt - und genau darauf kommt es an: Sonst springt die Leiste
 * zwischen zwei Stufen hin und her, weil jede Stufe die Messung aendert, auf
 * der sie beruht.
 */
export function toolbarWidthAtBase(measurement: ToolbarMeasurement) {
  const gap = TOOLBAR_BASE_ICON_SIZE - measurement.currentIconSize;
  return measurement.fixed + measurement.flexible + measurement.icons * gap;
}

/** Wie breit die Leiste bei dieser Symbolgroesse waere. */
export function toolbarWidthAtSize(measurement: ToolbarMeasurement, size: number) {
  return toolbarWidthAtBase(measurement) - measurement.icons * (TOOLBAR_BASE_ICON_SIZE - size);
}

/**
 * Die groesste Stufe, die noch in eine Zeile passt.
 *
 * Passt keine, bleibt die kleinste: Dann bricht die Leiste um, und das ist
 * besser, als die hinteren Gruppen ueber den Rand laufen zu lassen - genau
 * das war der Zustand, der zum Zoomen auf 67 Prozent zwang.
 */
export function toolbarDensityFor(measurement: ToolbarMeasurement): ToolbarDensity {
  if (!(measurement.available > 0)) return "full";
  const fitting = TOOLBAR_ICON_STEPS.find((step) => toolbarWidthAtSize(measurement, step.size) <= measurement.available);
  return (fitting ?? TOOLBAR_ICON_STEPS[TOOLBAR_ICON_STEPS.length - 1]).density;
}
