import { normalizeDegrees, shapeHasShapeDeform } from "@/lib/workplaneShapes";
import type { WorkplaneShape } from "@/types/sketchforge";

/**
 * Die Schnellwege beim Verschneiden.
 *
 * Ein achsenparalleler Quader laesst sich ohne den Umweg ueber Dreiecke
 * schneiden: als Kasten gegen Kasten, oder als Grundkoerper im Kern. Beides
 * ist schneller und sauberer als das Netz - aber nur, solange der Koerper
 * wirklich ein Quader ist.
 */

/** Winkel, bei denen ein Quader noch auf den Achsen steht. */
function straightAngle(value: number) {
  const angle = Math.abs(normalizeDegrees(value));
  return angle < 0.001 || Math.abs(angle - 180) < 0.001 || Math.abs(angle - 360) < 0.001;
}

/**
 * Ob dieser Koerper als achsenparalleler Quader durchgehen darf.
 *
 * Eine **Verjuengung, ein Drall, eine Neigung oder ungleiche Seitenhoehen
 * machen aus ihm keinen Quader mehr.** Die Schnellwege rechneten ihn trotzdem
 * als einen: Ein verjuengter Quader mit verjuengter Aussparung - ein Trichter,
 * ein Uebergangsstueck zwischen zwei Rechtecken - kam nach dem Gruppieren als
 * gerader Quader heraus, und die Verformung war weg. Nur das Netz traegt sie,
 * also muss ein verformter Koerper diesen Weg gehen.
 */
export function isAxisAlignedBoxCutter(shape: WorkplaneShape) {
  if (shape.kind !== "box") return false;
  if (!straightAngle(shape.rotation) || !straightAngle(shape.rotationX ?? 0) || !straightAngle(shape.rotationZ ?? 0)) {
    return false;
  }
  return !shapeHasShapeDeform(shape);
}
