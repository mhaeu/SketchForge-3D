/**
 * overhangLimits.ts
 *
 * Ueberhaenge: Flaechen, die steiler nach unten zeigen, als ein Drucker ohne
 * Stuetzen schafft.
 *
 * Der Winkel zaehlt von der Senkrechten - eine Wand hat 0 Grad, eine
 * waagerechte Decke 90. Ueblich sind 45: Bis dahin legt sich jede Bahn noch
 * weit genug auf die darunter, um zu halten. Darueber haengt sie in der Luft,
 * und der Druck braucht Stuetzen oder der Koerper muss anders liegen.
 *
 * Nach Layerling 1.33.0.
 *
 * License: MIT
 */

export const DEFAULT_OVERHANG_ANGLE = 45;
export const MIN_OVERHANG_ANGLE = 30;
export const MAX_OVERHANG_ANGLE = 70;

/** Was so knapp ueber der Platte liegt, steht auf ihr und braucht nichts. */
export const OVERHANG_PLATE_TOLERANCE = 0.05;

export function normalizeOverhangAngle(value: unknown, fallback = DEFAULT_OVERHANG_ANGLE) {
  const number = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(MAX_OVERHANG_ANGLE, Math.max(MIN_OVERHANG_ANGLE, Math.round(number)));
}

/**
 * Ab wann eine Flaeche ueberhaengt, gemessen daran, wie weit ihre Normale nach
 * unten zeigt: `-normal.y` darueber heisst Ueberhang.
 *
 * Der Sinus und nicht der Kosinus, weil der Winkel von der Senkrechten zaehlt:
 * Eine senkrechte Wand hat `-normal.y = 0`, eine waagerechte Decke 1. Bei 45
 * Grad liegt die Schwelle in der Mitte der Kurve, bei 30 Grad halb so hoch
 * (0,5 - mehr Flaechen gelten als Ueberhang), bei 70 Grad fast ganz oben.
 * Denselben Wert bekommt der Schattenrechner in der Ansicht.
 */
export function overhangDownwardLimit(angle: number) {
  return Math.sin((normalizeOverhangAngle(angle) * Math.PI) / 180);
}
