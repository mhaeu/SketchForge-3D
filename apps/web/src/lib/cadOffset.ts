import { JoinType, type OcctKernel, type ShapeHandle } from "occt-wasm";
import type { CadHollowJoin } from "@/lib/cadHollow";

/**
 * cadOffset.ts
 *
 * Versatz: jede Flaeche eines Koerpers um denselben Abstand nach aussen
 * oder innen schieben. Das ist das Spiel einer Presspassung oder eines
 * Schnappverschlusses - Skalieren verschiebt die Formelemente, Aushoehlen
 * geht nur nach innen. Die Rechnung ist der Versatz des Kerns, den das
 * Aushoehlen schon nach innen benutzt.
 *
 * Nach layerling 1.113.0 (#919).
 */

export const OFFSET_MIN_DISTANCE = 0.01;
export const OFFSET_MAX_DISTANCE = 10;

/** Die rohe Meldung eines gescheiterten Versatzes; der Editor uebersetzt sie. */
export const CANNOT_OFFSET_MESSAGE = "This body cannot be grown or shrunk by this distance. Choose a smaller distance.";

export function normalizeOffsetDistance(value: unknown) {
  const number = typeof value === "number" && Number.isFinite(value) ? value : 0.2;
  return Math.min(OFFSET_MAX_DISTANCE, Math.max(OFFSET_MIN_DISTANCE, Math.round(number * 100) / 100));
}

/** Der Kern gibt bei manchen Koerpern eine Huelle statt eines Koerpers zurueck. */
function solidFromOffset(cad: OcctKernel, offset: ShapeHandle) {
  if (cad.getShapeType(offset) !== "shell") return offset;
  try {
    return cad.makeSolid(offset);
  } finally {
    cad.release(offset);
  }
}

function isValidShape(cad: OcctKernel, shape: ShapeHandle) {
  try {
    return cad.isValid(shape);
  } catch {
    return false;
  }
}

/**
 * Jede Flaeche entlang ihrer Normalen um `distance` versetzt: nach aussen,
 * wenn er waechst, nach innen, wenn er schrumpft. Runde Ecken (der Versatz
 * einer Kante ist ein Zylinder) oder scharfe (die Flaechen laufen weiter,
 * bis sie sich treffen). Die genaue Toleranz zuerst, die grobere ueberlebt
 * mehr gekruemmte Eingaben. Ein Ergebnis, dessen Rauminhalt nicht in die
 * gewuenschte Richtung ging, ist kein Versatz.
 */
export function offsetSolid(cad: OcctKernel, solid: ShapeHandle, distance: number, shrink: boolean, join: CadHollowJoin = "round") {
  const joinTypes: Array<JoinType.Arc | JoinType.Intersection> = join === "sharp" ? [JoinType.Intersection] : [JoinType.Arc, JoinType.Intersection];
  const baseVolume = cad.getVolume(solid);
  for (const joinType of joinTypes) {
    for (const tolerance of [1e-6, 1e-3]) {
      try {
        const result = solidFromOffset(cad, cad.offset(solid, shrink ? -distance : distance, tolerance, joinType));
        const volume = isValidShape(cad, result) ? cad.getVolume(result) : 0;
        if (volume > 0 && (shrink ? volume < baseVolume * (1 - 1e-6) : volume > baseVolume * (1 + 1e-6))) return result;
        cad.release(result);
      } catch (error) {
        if (error instanceof Error && /is not a function/.test(error.message)) throw error;
      }
    }
  }
  throw new Error(CANNOT_OFFSET_MESSAGE);
}
