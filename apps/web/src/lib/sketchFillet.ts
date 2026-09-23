import { arcBulgeThrough } from "@/lib/sketchArcs";
import type { SketchProfile, SketchSegment } from "@/types/sketchforge";

/**
 * Eine runde Ecke.
 *
 * Aus einer Ecke zwischen zwei Strecken wird ein echter Kreisbogen, der beide
 * Strecken beruehrt: Der Eckpunkt weicht zwei Punkten auf den Schenkeln, und
 * dazwischen sitzt ein Bogen. Anders als eine Kurve mit Griffen ist das ein
 * Stueck Kreis mit einem Halbmesser, den man nennen kann - und der sich am
 * Bogen nachtraeglich weiterziehen laesst.
 */

/** So viel von dem kuerzeren Schenkel nimmt die Rundung, wenn niemand etwas sagt. */
export const DEFAULT_ROUND_CORNER_SHARE = 0.25;

/** Weiter als bis zur Haelfte darf eine Rundung keinen Schenkel aufbrauchen. */
const MAX_LEG_SHARE = 0.5;

type Vector = { x: number; z: number };

function unit(from: Vector, to: Vector) {
  const x = to.x - from.x;
  const z = to.z - from.z;
  const length = Math.hypot(x, z);
  if (!(length > 1e-9)) return null;
  return { x: x / length, z: z / length, length };
}

function isStraight(segment: SketchSegment) {
  return !segment.kind || segment.kind === "line";
}

export type RoundedCorner = {
  profile: SketchProfile;
  /** Der Halbmesser der Rundung, wie er am Ende herauskam. */
  radius: number;
  arcId: string;
};

/**
 * Die Ecke `pointId` runden.
 *
 * Gefordert sind zwei gerade Schenkel - eine Rundung an einer Kurve haette
 * keinen Halbmesser, den man ausrechnen koennte, und genau die unbestimmten
 * Kurven soll das hier ja ersetzen. `share` sagt, wie viel vom kuerzeren
 * Schenkel die Rundung nimmt.
 */
export function roundSketchCorner(
  profile: SketchProfile,
  pointId: string,
  createId: (prefix: string) => string,
  share = DEFAULT_ROUND_CORNER_SHARE,
): RoundedCorner | null {
  const corner = profile.points.find((point) => point.id === pointId);
  if (!corner) return null;
  const touching = profile.segments.filter((segment) => segment.startId === pointId || segment.endId === pointId);
  if (touching.length !== 2 || !touching.every(isStraight)) return null;

  const pointById = new Map(profile.points.map((point) => [point.id, point]));
  const legs = touching.map((segment) => {
    const other = pointById.get(segment.startId === pointId ? segment.endId : segment.startId);
    return other ? { segment, direction: unit(corner, other) } : null;
  });
  const [first, second] = legs;
  if (!first?.direction || !second?.direction) return null;

  const cosine = first.direction.x * second.direction.x + first.direction.z * second.direction.z;
  const angle = Math.acos(Math.min(1, Math.max(-1, cosine)));
  // Gestreckt oder in sich zurueck: Da ist keine Ecke, die sich runden liesse.
  if (!(angle > 1e-4) || angle > Math.PI - 1e-4) return null;

  const reach = Math.min(
    first.direction.length * MAX_LEG_SHARE,
    second.direction.length * MAX_LEG_SHARE,
    Math.min(first.direction.length, second.direction.length) * Math.max(0.01, share),
  );
  if (!(reach > 1e-6)) return null;
  const radius = reach * Math.tan(angle / 2);

  const start = { x: corner.x + first.direction.x * reach, z: corner.z + first.direction.z * reach };
  const end = { x: corner.x + second.direction.x * reach, z: corner.z + second.direction.z * reach };
  // Der Scheitel liegt auf der Winkelhalbierenden, um genau so viel von der
  // Ecke entfernt, dass der Bogen beide Schenkel beruehrt.
  const bisector = unit({ x: 0, z: 0 }, { x: first.direction.x + second.direction.x, z: first.direction.z + second.direction.z });
  if (!bisector) return null;
  const apexDistance = radius / Math.sin(angle / 2) - radius;
  const apex = { x: corner.x + bisector.x * apexDistance, z: corner.z + bisector.z * apexDistance };

  const startId = createId("sketch-point");
  const endId = createId("sketch-point");
  const arcId = createId("sketch-segment");
  const points = profile.points.flatMap((point) => point.id === pointId
    ? [{ id: startId, x: start.x, z: start.z, mode: "corner" as const }, { id: endId, x: end.x, z: end.z, mode: "corner" as const }]
    : [point]);
  const segments = profile.segments.map((segment) => {
    const replacement = segment.id === first.segment.id ? startId : segment.id === second.segment.id ? endId : null;
    if (!replacement) return segment;
    return segment.startId === pointId
      ? { ...segment, startId: replacement }
      : { ...segment, endId: replacement };
  });
  segments.push({
    id: arcId,
    startId,
    endId,
    kind: "arc",
    bulge: arcBulgeThrough(start, end, apex),
  });

  return { profile: { ...profile, points, segments }, radius, arcId };
}
