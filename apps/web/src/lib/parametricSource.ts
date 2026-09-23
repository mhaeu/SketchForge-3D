import { canonicalizeShape, shapeDepth, shapeWidth } from "@/lib/workplaneShapes";
import { composedShapeRotation } from "@/lib/geometryRotation";
import type { ParametricSource, WorkplaneShape } from "@/types/sketchforge";

/**
 * Die Werte, die den Koerper bauen - im Unterschied zu denen, die ihn nur
 * stellen. Wer einen davon an einem gedrehten Koerper aendert, meint den
 * Koerper und nicht sein gebackenes Netz: dann wird neu gebaut, neu gedreht
 * und neu gebacken. **Eine neue Form traegt ihre Felder hier nach**, sonst
 * laesst sie sich nach dem Drehen nicht mehr aendern.
 */
export const BODY_PARAMETER_KEYS = [
  "steps", "sides", "bevel", "segments",
  "topRadius", "baseRadius",
  "taperTopWidth", "taperTopDepth", "taperBottomWidth", "taperBottomDepth",
  "taperHeightLeft", "taperHeightRight", "taperHeightFront", "taperHeightBack",
  "cornerFillet", "topBottomFillet", "roundedBoxQuality",
  "honeycombCellSize", "honeycombWallThickness", "honeycombFrameWidth",
  "teeth", "toothSize", "toothWidth", "centerHoleSize", "gearType", "helixAngle", "helixQuality",
  "threadRole", "threadHead", "threadDrive", "threadHand", "threadProfile", "threadDiameter",
  "threadPitch", "threadClearance", "threadQuality", "threadHeadHeight", "threadChamfer",
  "threadHeadChamfer",
  "springTurns", "springWire", "springQuality",
  "loftBottomShape", "loftTopShape", "loftTopWidth", "loftTopDepth",
  "loftBottomRotation", "loftTopRotation", "loftSegments", "loftLayers",
  "text", "font",
] as const satisfies readonly (keyof WorkplaneShape)[];

/** Aendert dieser Patch einen Bauwert des Koerpers - oder nur seinen Rahmen? */
export function patchTouchesBodyParameters(patch: Partial<WorkplaneShape>) {
  return BODY_PARAMETER_KEYS.some((key) => key in patch);
}

/** Nennt dieser Patch einen Drehwinkel? */
export function patchTouchesRotation(patch: Partial<WorkplaneShape>) {
  return [patch.rotation, patch.rotationX, patch.rotationZ].some((value) => typeof value === "number");
}

/**
 * Beim Backen festhalten, was der Koerper war - sonst waere eine gedrehte
 * Mutter fuer immer ein Netz. Wer schon einmal gedreht wurde, behaelt seine
 * Urform; die neue Drehung kommt oben drauf, und verkettet wird ueber
 * Quaternionen, weil Eulerwinkel sich nicht addieren lassen.
 *
 * Eine Spiegelung wird **nicht** festgehalten: sie liesse sich nicht ehrlich
 * wieder auftragen - ein gespiegeltes Rechtsgewinde ist ein Linksgewinde, und
 * das waere ein anderer Koerper.
 */
export function parametricSourceForBake(shape: WorkplaneShape): ParametricSource | undefined {
  if (shape.mirrorX || shape.mirrorY || shape.mirrorZ) return undefined;
  const known = shape.parametricSource;
  if (known) return { ...known, ...composedShapeRotation(shape, known) };
  if (shape.kind === "mesh" || shape.importedMesh || shape.groupedShapes?.length || shape.imagePlate) {
    return undefined;
  }
  return {
    kind: shape.kind,
    width: shapeWidth(shape),
    depth: shapeDepth(shape),
    height: shape.height,
    size: shape.size,
    rotation: shape.rotation,
    rotationX: shape.rotationX ?? 0,
    rotationZ: shape.rotationZ ?? 0,
    taperTopWidth: shape.taperTopWidth,
    taperTopDepth: shape.taperTopDepth,
    taperBottomWidth: shape.taperBottomWidth,
    taperBottomDepth: shape.taperBottomDepth,
    extrudeTwist: shape.extrudeTwist,
    extrudeTopOffsetX: shape.extrudeTopOffsetX,
    extrudeTopOffsetZ: shape.extrudeTopOffsetZ,
    cornerFillet: shape.cornerFillet,
    topBottomFillet: shape.topBottomFillet,
    roundedBoxQuality: shape.roundedBoxQuality,
  };
}

/**
 * Die aufgelaufene Drehung eines Koerpers, der keine Urform hat.
 *
 * Ein Skizzen- oder Rotationskoerper, ein eingelesenes Netz: Aus ihnen laesst
 * sich der Koerper nicht neu bauen, also haelt `parametricSource` nichts von
 * ihnen fest. Der Winkel aber liesse sich festhalten, und ohne ihn fing der
 * Zaehler nach jeder Drehung wieder bei null an - man wusste nicht mehr, wie
 * schief das Objekt steht, und konnte es nicht wieder gerade stellen.
 *
 * Eine Spiegelung wird auch hier nicht mitgeschrieben: Sie liesse sich nicht
 * als Winkel wieder auftragen.
 */
export function bakedRotationForBake(shape: WorkplaneShape) {
  if (shape.mirrorX || shape.mirrorY || shape.mirrorZ) return undefined;
  const previous = shape.bakedRotation ?? { rotation: 0, rotationX: 0, rotationZ: 0 };
  const composed = composedShapeRotation(shape, previous);
  return { rotation: composed.rotation, rotationX: composed.rotationX, rotationZ: composed.rotationZ };
}

export type ParametricRebuildPlan = {
  /** Der ungedrehte Koerper mit der Aenderung darin. */
  original: WorkplaneShape;
  /** Die Drehung, die danach darauf kommt. */
  rotation: { rotation: number; rotationX: number; rotationZ: number };
  /** Ob dieser Zug den Koerper auch bewegt. */
  turns: boolean;
};

/**
 * Der Rueckweg: Urform herstellen und die Aenderung einsetzen. Das Drehen und
 * das Backen macht danach der Editor - nur dort steht die Geometrie.
 *
 * `absoluteRotation` unterscheidet die beiden Arten zu drehen: der Drehgriff
 * gibt einen Winkel **auf** das gebackene Netz, also kommt er oben auf die
 * aufgelaufene Drehung. Das Eingabefeld zeigt dagegen den aufgelaufenen
 * Winkel selbst - was man dort eintippt, ersetzt ihn, sonst koennte man ein
 * Objekt nie wieder gerade stellen.
 */
export function parametricRebuildPlan(
  shape: WorkplaneShape,
  patch: Partial<WorkplaneShape>,
  absoluteRotation = false,
): ParametricRebuildPlan | null {
  const source = shape.parametricSource;
  if (!source) return null;
  const { rotation, rotationX, rotationZ, ...bodyValues } = patch;
  const turns = patchTouchesRotation(patch);
  const asked = { rotation: rotation ?? 0, rotationX: rotationX ?? 0, rotationZ: rotationZ ?? 0 };
  const total = !turns
    ? { rotation: source.rotation, rotationX: source.rotationX, rotationZ: source.rotationZ }
    : absoluteRotation
      // Nur die genannte Achse wird gesetzt, die beiden anderen bleiben, wie
      // sie aufgelaufen sind - sonst raeumte ein Feld die anderen mit weg.
      ? {
        rotation: typeof rotation === "number" ? rotation : source.rotation,
        rotationX: typeof rotationX === "number" ? rotationX : source.rotationX,
        rotationZ: typeof rotationZ === "number" ? rotationZ : source.rotationZ,
      }
      : composedShapeRotation(asked, source);
  const original = canonicalizeShape({
    ...shape,
    kind: source.kind,
    width: source.width,
    depth: source.depth,
    height: source.height,
    size: source.size,
    taperTopWidth: source.taperTopWidth,
    taperTopDepth: source.taperTopDepth,
    taperBottomWidth: source.taperBottomWidth,
    taperBottomDepth: source.taperBottomDepth,
    extrudeTwist: source.extrudeTwist,
    extrudeTopOffsetX: source.extrudeTopOffsetX,
    extrudeTopOffsetZ: source.extrudeTopOffsetZ,
    cornerFillet: source.cornerFillet,
    topBottomFillet: source.topBottomFillet,
    roundedBoxQuality: source.roundedBoxQuality,
    importedMesh: undefined,
    parametricSource: undefined,
    rotation: 0,
    rotationX: 0,
    rotationZ: 0,
    ...bodyValues,
  });
  return { original, rotation: total, turns };
}
