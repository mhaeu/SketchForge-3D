/**
 * referencePoint.ts
 *
 * The reference point is a special shape (kind: "reference") that marks a
 * user-settable origin in the scene. It is:
 *   - selectable and movable like any other shape (reuses x / z / elevation),
 *   - never printed or exported (excluded from STL/OBJ/STEP and all boolean
 *     and grouping paths),
 *   - present exactly once per project, created at (0, 0, 0) for new projects,
 *   - not deletable and not duplicable, and not offered in the shape toolbar.
 *
 * Its purpose is the delta readout: every other shape's Position card shows the
 * offset (dX, dY, dZ) to this point in addition to the absolute position.
 *
 * License: MIT
 */

import { createLocalId } from "@/lib/localIds";
import type { WorkplaneShape } from "@/types/sketchforge";

/** Stable id so there is never more than one reference point per project. */
export const REFERENCE_POINT_ID = "reference-point";

export const REFERENCE_POINT_NAME = "Reference point";

/** Arm length of the on-screen cross in millimeters (fixed world size). */
export const REFERENCE_POINT_ARM_MM = 20;

/** Default radius of the center marker sphere in millimeters. */
export const REFERENCE_POINT_MARKER_MM = 1;

/** True for the reference-point shape. */
export function isReferencePoint(shape: Pick<WorkplaneShape, "kind">): boolean {
  return shape.kind === "reference";
}

/** True if the list already contains a reference point. */
export function hasReferencePoint(shapes: ReadonlyArray<WorkplaneShape>): boolean {
  return shapes.some(isReferencePoint);
}

/** Creates the reference-point shape at the given location (default origin). */
export function createReferencePoint(
  position: { x?: number; z?: number; elevation?: number } = {},
): WorkplaneShape {
  return {
    id: REFERENCE_POINT_ID,
    name: REFERENCE_POINT_NAME,
    kind: "reference",
    color: "#f5c542",
    x: position.x ?? 0,
    z: position.z ?? 0,
    elevation: position.elevation ?? 0,
    size: REFERENCE_POINT_ARM_MM,
    width: REFERENCE_POINT_ARM_MM,
    depth: REFERENCE_POINT_ARM_MM,
    height: REFERENCE_POINT_ARM_MM,
    rotation: 0,
    crossArm: REFERENCE_POINT_ARM_MM,
    markerRadius: REFERENCE_POINT_MARKER_MM,
  };
}

/**
 * Sorgt fuer **genau einen** Bezugspunkt: Ist keiner da, kommt einer an den
 * Nullpunkt; sind mehrere da, bleibt der erste.
 *
 * Dass es mehrere sein koennen, war lange nicht vorgesehen - der Name stand
 * schon so da, die Rechnung hielt ihn aber nicht. Geriet der Bezugspunkt in
 * eine Gruppe und wurde sie wieder aufgeloest, kam er mit neuer Kennung
 * zurueck, und er stand doppelt in der Szene.
 */
export function ensureReferencePoint(shapes: WorkplaneShape[]): WorkplaneShape[] {
  /*
   * Zuerst die Gruppen: In einer Gruppe hat der Bezugspunkt nichts zu suchen,
   * und eine Zeichnung, in der er dort sitzt, ist nicht abzulegen - die Datei
   * kennt seine Art nicht. Wer so eine Zeichnung offen hat, bekommt sie hier
   * gesaeubert, und der naechste Speicherstand ist wieder in Ordnung.
   */
  const cleaned = shapes.map((shape) => {
    if (!shape.groupedShapes?.length) return shape;
    const children = withoutReferencePoints(shape.groupedShapes);
    return sameList(children, shape.groupedShapes) ? shape : { ...shape, groupedShapes: children };
  });
  const points = cleaned.filter(isReferencePoint);
  if (points.length === 0) return [createReferencePoint(), ...cleaned];
  if (points.length === 1) return cleaned;
  const keep = points[0];
  return cleaned.filter((shape) => !isReferencePoint(shape) || shape === keep);
}

/**
 * Ob sich an einer Liste nichts geaendert hat - Kind fuer Kind, nicht nach
 * ihrer Zahl. Faellt erst eine Ebene tiefer etwas weg, bleibt die Zahl oben
 * gleich, das Kind ist aber ein neues.
 *
 * Anderswo haengen Zwischenspeicher an der Gleichheit des Objekts; wer ohne
 * Not ein neues baut, laesst sie ins Leere laufen.
 */
function sameList<T>(next: ReadonlyArray<T>, previous: ReadonlyArray<T>) {
  return next.length === previous.length && next.every((entry, index) => entry === previous[index]);
}

/** Reads the point coordinates, falling back to the origin. */
export function referencePointPosition(
  shapes: ReadonlyArray<WorkplaneShape>,
): { x: number; y: number; z: number } {
  const point = shapes.find(isReferencePoint);
  return {
    x: point?.x ?? 0,
    y: point?.elevation ?? 0,
    z: point?.z ?? 0,
  };
}

/** Removes reference points from a list (used before any export/geometry op). */
/**
 * Alle Bezugspunkte heraus - auch die, die in einer Gruppe stecken.
 *
 * Er ist ein Helfer der Szene und keine Geometrie; beim Ausfuehren und beim
 * Ablegen auf dem Server hat er nichts zu suchen. Geprueft wird bis in die
 * Gruppen hinein, denn dort ist er hingeraten, und eine Datei mit einem
 * Bezugspunkt als Gruppenkind liess sich nicht mehr ablegen.
 */
export function withoutReferencePoints<T extends Pick<WorkplaneShape, "kind"> & { groupedShapes?: T[] }>(
  shapes: ReadonlyArray<T>,
): T[] {
  return shapes
    .filter((shape) => !isReferencePoint(shape))
    .map((shape) => {
      if (!shape.groupedShapes?.length) return shape;
      const children = withoutReferencePoints(shape.groupedShapes);
      // Nur neu bauen, wenn wirklich etwas wegfiel - siehe `sameList`.
      return sameList(children, shape.groupedShapes) ? shape : { ...shape, groupedShapes: children };
    });
}
