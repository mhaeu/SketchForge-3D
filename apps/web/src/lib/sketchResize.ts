import type { SketchPoint } from "@/types/sketchforge";

export type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
export type SelectionBounds = { minX: number; maxX: number; minZ: number; maxZ: number; width: number; depth: number; cx: number; cz: number };

/**
 * Scales a sketch selection by one of its eight handles.
 *
 * With `lockAspect`, width and height keep their ratio: the axis the handle
 * actually drives sets the factor, and the free edge is rebuilt from it so the
 * dragged edge stays under the pointer. A side handle drives one axis only, so
 * there the other simply follows.
 */
export function resizeSketchPoints(points: SketchPoint[], bounds: SelectionBounds, handle: ResizeHandle, current: { x: number; z: number }, lockAspect = false) {
  const minimum = 0.5;
  let minX = bounds.minX;
  let maxX = bounds.maxX;
  let minZ = bounds.minZ;
  let maxZ = bounds.maxZ;
  if (handle.includes("w")) minX = Math.min(current.x, bounds.maxX - minimum);
  if (handle.includes("e")) maxX = Math.max(current.x, bounds.minX + minimum);
  if (handle.includes("n")) minZ = Math.min(current.z, bounds.maxZ - minimum);
  if (handle.includes("s")) maxZ = Math.max(current.z, bounds.minZ + minimum);
  const width = Math.max(minimum, bounds.width);
  const depth = Math.max(minimum, bounds.depth);
  let scaleX = (maxX - minX) / width;
  let scaleZ = (maxZ - minZ) / depth;
  if (lockAspect) {
    // The axis the handle actually drives sets the factor; a side handle only
    // drives one, so the other simply follows it. Rebuilding the free edge from
    // the factor keeps the dragged edge under the pointer.
    const drivesX = handle.includes("w") || handle.includes("e");
    const drivesZ = handle.includes("n") || handle.includes("s");
    const factor = drivesX && drivesZ
      ? (Math.abs(scaleX - 1) >= Math.abs(scaleZ - 1) ? scaleX : scaleZ)
      : drivesX ? scaleX : scaleZ;
    scaleX = factor;
    scaleZ = factor;
    if (handle.includes("w")) minX = maxX - width * factor; else maxX = minX + width * factor;
    if (handle.includes("n")) minZ = maxZ - depth * factor; else maxZ = minZ + depth * factor;
  }
  const map = (value: { x: number; z: number }) => ({
    x: minX + (value.x - bounds.minX) * scaleX,
    z: minZ + (value.z - bounds.minZ) * scaleZ,
  });
  return points.map((point) => ({
    ...point,
    ...map(point),
    handleIn: point.handleIn ? map(point.handleIn) : undefined,
    handleOut: point.handleOut ? map(point.handleOut) : undefined,
  }));
}
