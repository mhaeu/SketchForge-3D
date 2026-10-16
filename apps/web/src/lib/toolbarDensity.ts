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
 * Gemessen wird **jede Stufe selbst**, nicht eine hochgerechnet. Frueher
 * wurde die Leiste in der Stufe gemessen, die gerade galt, und auf die volle
 * Symbolgroesse zurueckgerechnet - als aendere eine Stufe nur die Symbole.
 * Die kleinste aendert aber mehr: Die Abschnitte verlieren ihre
 * Mindestbreite, das Namensfeld wird schmaler, und die Gruppenkaesten loesen
 * sich auf (`display: contents`), damit sie einzeln umbrechen koennen. Ein
 * aufgeloester Kasten misst 0 px. Gemessen im Browser bei 1400 px: voll 2056
 * px feste Abschnitte, kompakt angeblich 208 - also "passt voll", dann
 * "passt nicht", und die Leiste sprang in jedem Bild (alle 17 ms) zwischen
 * voll und kompakt, 185 und 261 px hoch, und der Arbeitsbereich darunter mit.
 *
 * Nach Layerling, das seine Umschaltbreiten ebenfalls an der gemessenen
 * Breite nachgezogen hat (Issue #54).
 */

export type ToolbarDensity = "full" | "medium" | "compact";

export const TOOLBAR_ICON_STEPS: ReadonlyArray<{ density: ToolbarDensity; size: number }> = [
  { density: "full", size: 43 },
  { density: "medium", size: 39 },
  { density: "compact", size: 35 },
];

export const TOOLBAR_BASE_ICON_SIZE = TOOLBAR_ICON_STEPS[0].size;

/**
 * Was in einer Zeile der Leiste steht, so wie der Browser es auslegt.
 *
 * - `box`: ein Kasten mit seiner Breite (samt Rand aussen).
 * - `spacer`: ein dehnbarer Streifen, der nur seine Mindestbreite braucht -
 *   er waechst in den freien Platz hinein und wuerde sonst die Summe immer so
 *   gross machen wie die Leiste.
 * - `contents`: ein Kasten, der sich aufgeloest hat; seine Kinder stehen
 *   selbst in der Zeile.
 */
export type ToolbarRowItem =
  | { kind: "box"; width: number }
  | { kind: "spacer"; minWidth: number }
  | { kind: "contents"; children: ToolbarRowItem[] };

/** Die einzelnen Eintraege einer Zeile, aufgeloeste Kaesten aufgeklappt. */
function flattenRow(items: ReadonlyArray<ToolbarRowItem>): Array<Exclude<ToolbarRowItem, { kind: "contents" }>> {
  return items.flatMap((item) => (item.kind === "contents" ? flattenRow(item.children) : [item]));
}

/** Wie breit diese Eintraege in einer Zeile waeren, mit dem Abstand dazwischen. */
export function toolbarRowWidth(items: ReadonlyArray<ToolbarRowItem>, gap = 0) {
  const flat = flattenRow(items);
  const widths = flat.reduce((sum, item) => sum + (item.kind === "box" ? item.width : item.minWidth), 0);
  return widths + Math.max(0, flat.length - 1) * gap;
}

/**
 * Die groesste Stufe, die noch in eine Zeile passt.
 *
 * `rowWidthAt` misst die Leiste in einer Stufe. Weil jede Stufe fuer sich
 * gemessen wird, haengt die Antwort nicht an der Stufe, die gerade gilt - und
 * genau darauf kommt es an, sonst springt die Leiste hin und her.
 *
 * Passt keine, bleibt die kleinste: Dann bricht die Leiste um, und das ist
 * besser, als die hinteren Gruppen ueber den Rand laufen zu lassen - genau
 * das war der Zustand, der zum Zoomen auf 67 Prozent zwang.
 */
export function toolbarDensityFor(available: number, rowWidthAt: (density: ToolbarDensity) => number): ToolbarDensity {
  if (!(available > 0)) return "full";
  const fitting = TOOLBAR_ICON_STEPS.find((step) => rowWidthAt(step.density) <= available);
  return (fitting ?? TOOLBAR_ICON_STEPS[TOOLBAR_ICON_STEPS.length - 1]).density;
}
