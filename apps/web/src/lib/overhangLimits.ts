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
 * Ein Haar ueber dem eingestellten Winkel liegt die Schwelle, damit eine
 * Flaeche **genau** auf dem Winkel aussen vor bleibt - eine Fase von 45 Grad
 * bei der Vorgabe von 45 Grad, der haeufigste Fall von allen.
 *
 * Ohne das Haar entscheidet das Rauschen: Die Ansicht vergleicht
 * `-normal.y > Schwelle`, und bei Gleichheit kippt der Vergleich von Punkt zu
 * Punkt - dieselbe Fase war fleckig markiert oder nicht, je nach Blickwinkel.
 *
 * Gemessen, wie gross das Rauschen wirklich ist: Die Normalen einer echten
 * 45-Grad-Fase aus dem Kern (Kasten 20 mm, alle vier unteren Kanten, 3 mm)
 * weichen um hoechstens 1,2e-8 von sin(45 Grad) ab - sie kommen als float32,
 * und das ist dessen letzte Stelle. In der Ansicht wird die Normale ueber das
 * Dreieck geschoben und je Bildpunkt neu normiert, also etwa 1e-7.
 *
 * 0,01 Grad sind an der Schwelle 1,2e-4 - vier Groessenordnungen ueber dem
 * Rauschen und weit unter allem, was eine echte Flaeche vom Winkel abweicht:
 * Eine Flaeche mit 45,01 Grad wird weiter markiert. Layerling nimmt hier 0,4
 * Grad; das ist mehr, als die Messung hergibt, und wuerde einen echten
 * Ueberhang von 45,3 Grad verschweigen.
 */
export const OVERHANG_ANGLE_MARGIN = 0.01;

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
  return Math.sin(((normalizeOverhangAngle(angle) + OVERHANG_ANGLE_MARGIN) * Math.PI) / 180);
}
