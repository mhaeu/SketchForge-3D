import type { SketchPoint, SketchProfile } from "@/types/sketchforge";

export type SketchGeometrySelection = {
  pointIds: readonly string[];
  segmentIds: readonly string[];
  imageIds?: readonly string[];
};

/**
 * Die ausgewaehlten Punkte, ohne Bedingung an ihre Form.
 *
 * Drehen und Spiegeln brauchen keinen geschlossenen Umriss - zwei Punkte
 * genuegen, und ein offener Zug dreht sich so gut wie ein Rechteck. Nur
 * Vorlagenbilder bleiben aussen vor: die haengen an ihren eigenen Feldern.
 */
export function selectedSketchPoints(
  profile: SketchProfile,
  selection: SketchGeometrySelection,
): SketchPoint[] | null {
  if (selection.imageIds?.length) return null;
  const pointIds = new Set(selection.pointIds);
  if (pointIds.size < 2) return null;
  const points = profile.points.filter((point) => pointIds.has(point.id));
  return points.length >= 2 ? points : null;
}

/** Die Mitte des Rahmens um eine Auswahl - der Punkt, um den sie sich dreht. */
function selectionPivot(points: readonly SketchPoint[]) {
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minZ = Math.min(...points.map((point) => point.z));
  const maxZ = Math.max(...points.map((point) => point.z));
  return { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 };
}

/**
 * Spiegeln an der Mittellinie der Auswahl - waagerecht heisst: links und
 * rechts tauschen.
 *
 * Die Griffe der Kurven werden mitgespiegelt und nicht getauscht: Eine Kante
 * laeuft weiterhin von ihrem Anfang zu ihrem Ende, nur eben seitenverkehrt,
 * und ihr Bogen kommt dabei von selbst richtig heraus.
 */
export function mirrorSketchPoints(points: readonly SketchPoint[], axis: "x" | "z"): SketchPoint[] {
  if (points.length === 0) return [];
  const pivot = selectionPivot(points);
  const mirrorPosition = (position: { x: number; z: number }) => (axis === "x"
    ? { x: pivot.x * 2 - position.x, z: position.z }
    : { x: position.x, z: pivot.z * 2 - position.z });
  return points.map((point) => ({
    ...point,
    ...mirrorPosition(point),
    handleIn: point.handleIn ? mirrorPosition(point.handleIn) : undefined,
    handleOut: point.handleOut ? mirrorPosition(point.handleOut) : undefined,
  }));
}

export function rotateSketchPoints(points: readonly SketchPoint[], degrees = 45): SketchPoint[] {
  if (points.length === 0) return [];

  const pivot = selectionPivot(points);
  const radians = degrees * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const rotatePosition = (position: { x: number; z: number }) => {
    const deltaX = position.x - pivot.x;
    const deltaZ = position.z - pivot.z;
    return {
      x: pivot.x + deltaX * cosine - deltaZ * sine,
      z: pivot.z + deltaX * sine + deltaZ * cosine,
    };
  };

  return points.map((point) => ({
    ...point,
    ...rotatePosition(point),
    handleIn: point.handleIn ? rotatePosition(point.handleIn) : undefined,
    handleOut: point.handleOut ? rotatePosition(point.handleOut) : undefined,
  }));
}
