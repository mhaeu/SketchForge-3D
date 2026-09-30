/**
 * buildVolume.ts
 *
 * Wie hoch der Drucker bauen kann, und welche Koerper darueber hinausragen.
 *
 * Die Grundflaeche steht schon in den Arbeitsbereich-Einstellungen; die Hoehe
 * fehlte. Ohne sie merkt man erst am Drucker, dass das Teil nicht hineinpasst
 * - und das ist der teuerste Zeitpunkt.
 *
 * Nach Layerling 1.21.0.
 *
 * License: MIT
 */

import { shapeWorldBounds } from "@/lib/cutTools";
import { isReferencePoint } from "@/lib/referencePoint";
import { isSolidShape } from "@/lib/workplaneShapes";
import type { WorkplaneShape } from "@/types/sketchforge";

/** Die uebliche Bauhoehe eines Tischdruckers, in Millimetern. */
export const DEFAULT_BUILD_HEIGHT_MM = 250;

export const MIN_BUILD_HEIGHT_MM = 10;
export const MAX_BUILD_HEIGHT_MM = 2000;

export type TooTallBody = {
  id: string;
  name: string;
  /** Wie hoch der Koerper ueber der Platte endet. */
  top: number;
  /** Um wie viel er ueber die Bauhoehe hinausragt. */
  over: number;
};

/**
 * Welche Koerper zu hoch sind, und um wie viel.
 *
 * Gemessen wird der Weltrahmen: Ein gedrehter Koerper ist hoeher als seine
 * Hoehe, und genau der faellt am Drucker auf. Nicht mitgezaehlt werden
 * Abzugskoerper und Helfer - die werden nicht gedruckt -, und ausgeblendete
 * Koerper auch nicht: Wer sie ausgeblendet hat, will sie gerade nicht sehen.
 *
 * Die Liste kommt nach Ueberstand geordnet, der groesste zuerst; die Meldung
 * nennt nur die ersten, und dann sollen die schlimmsten darunter sein.
 */
export function bodiesTooTall(
  shapes: ReadonlyArray<WorkplaneShape>,
  buildHeight: number,
): TooTallBody[] {
  if (!Number.isFinite(buildHeight) || buildHeight <= 0) return [];
  const tooTall: TooTallBody[] = [];
  shapes.forEach((shape) => {
    if (shape.hidden || shape.hole || isReferencePoint(shape) || !isSolidShape(shape)) return;
    const top = shapeWorldBounds(shape).max.y;
    if (!Number.isFinite(top)) return;
    // Ein Zehntelmillimeter Ueberstand ist Rundung und keine Warnung.
    const over = top - buildHeight;
    if (over > 0.1) tooTall.push({ id: shape.id, name: shape.name, top, over });
  });
  return tooTall.sort((one, other) => other.over - one.over);
}

export function clampBuildHeight(value: unknown) {
  const height = typeof value === "number" && Number.isFinite(value) ? value : DEFAULT_BUILD_HEIGHT_MM;
  return Math.min(MAX_BUILD_HEIGHT_MM, Math.max(MIN_BUILD_HEIGHT_MM, height));
}
