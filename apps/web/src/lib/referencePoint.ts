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
 * Ensures exactly one reference point exists. Adds one at the origin if the
 * list has none; leaves the list untouched otherwise. Used both when starting
 * a new project and when loading an older project saved before this feature.
 */
export function ensureReferencePoint(shapes: WorkplaneShape[]): WorkplaneShape[] {
  return hasReferencePoint(shapes) ? shapes : [createReferencePoint(), ...shapes];
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
export function withoutReferencePoints<T extends Pick<WorkplaneShape, "kind">>(
  shapes: ReadonlyArray<T>,
): T[] {
  return shapes.filter((shape) => !isReferencePoint(shape));
}
