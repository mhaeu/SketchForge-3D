import type { SketchPoint, SketchProfile, SketchSegment } from "@/types/sketchforge";

export type SketchPlanePoint = { x: number; z: number };

/**
 * Der Winkel an einer Ecke, in Grad und zwischen 0 und 180.
 *
 * Gemessen wird zwischen den beiden Schenkeln, die von der Ecke wegfuehren -
 * so, wie man ihn an eine Zeichnung schreibt. Ein gestreckter Durchgang ist
 * 180 Grad, eine Kehrtwende 0.
 */
export function cornerAngleDegrees(
  from: SketchPlanePoint,
  vertex: SketchPlanePoint,
  to: SketchPlanePoint,
): number | null {
  const a = { x: from.x - vertex.x, z: from.z - vertex.z };
  const b = { x: to.x - vertex.x, z: to.z - vertex.z };
  const lengthA = Math.hypot(a.x, a.z);
  const lengthB = Math.hypot(b.x, b.z);
  // Zwei Punkte aufeinander haben keinen Winkel - und eine Null, die von einer
  // Rundung kommt, waere hier eine Aussage, die es nicht gibt.
  if (lengthA < 1e-6 || lengthB < 1e-6) return null;
  const cosine = (a.x * b.x + a.z * b.z) / (lengthA * lengthB);
  return (Math.acos(Math.min(1, Math.max(-1, cosine))) * 180) / Math.PI;
}

/**
 * Der Punkt, aus dem die zuletzt gezeichnete Kante an `pointId` ankommt.
 *
 * Bei einem Bogen zaehlt sein Griff und nicht der Nachbarpunkt: Die Linie
 * laeuft dort in Richtung des Griffs in die Ecke, und genau dieser Winkel ist
 * der, den man sieht. Gibt es mehrere Kanten, gilt die zuletzt angelegte -
 * beim Zeichnen ist das die, an der man gerade weiterbaut.
 */
export function incomingCornerPoint(profile: SketchProfile, pointId: string): SketchPlanePoint | null {
  const pointById = new Map(profile.points.map((point) => [point.id, point]));
  const vertex = pointById.get(pointId);
  if (!vertex) return null;
  let found: SketchSegment | null = null;
  for (const segment of profile.segments) {
    if (segment.startId === pointId || segment.endId === pointId) found = segment;
  }
  if (!found) return null;
  const neighbourId = found.startId === pointId ? found.endId : found.startId;
  const neighbour = pointById.get(neighbourId);
  if (!neighbour) return null;
  if (found.kind !== "line") {
    const handle = handleTowards(vertex, found.startId === pointId);
    if (handle) return handle;
  }
  return { x: neighbour.x, z: neighbour.z };
}

/** Der Griff, mit dem eine Kurve die Ecke verlaesst - falls sie einen hat. */
function handleTowards(vertex: SketchPoint, outgoing: boolean): SketchPlanePoint | null {
  const handle = outgoing ? vertex.handleOut : vertex.handleIn;
  if (!handle) return null;
  if (Math.hypot(handle.x - vertex.x, handle.z - vertex.z) < 1e-6) return null;
  return { x: handle.x, z: handle.z };
}

export type SketchPreviewAngle = {
  degrees: number;
  /** Die Ecke selbst. */
  vertex: SketchPlanePoint;
  /** Die Richtung, in der die Beschriftung aus der Ecke heraus steht. */
  bisector: SketchPlanePoint;
  /** Die beiden Schenkel als Einheitsvektoren, fuer den Bogen. */
  from: SketchPlanePoint;
  to: SketchPlanePoint;
};

/**
 * Alles, was zum Zeichnen eines Winkels gehoert: das Mass, die beiden
 * Schenkel und die Richtung, in der die Beschriftung steht. Ob der Winkel
 * gerade gezogen wird oder laengst dasteht, macht dabei keinen Unterschied -
 * deshalb rechnet beides hier.
 */
function cornerGeometry(
  vertex: SketchPlanePoint,
  fromPoint: SketchPlanePoint,
  toPoint: SketchPlanePoint,
): Omit<SketchPreviewAngle, "vertex"> | null {
  const degrees = cornerAngleDegrees(fromPoint, vertex, toPoint);
  if (degrees === null) return null;
  const from = unit(fromPoint, vertex);
  const to = unit(toPoint, vertex);
  if (!from || !to) return null;
  const sum = { x: from.x + to.x, z: from.z + to.z };
  const length = Math.hypot(sum.x, sum.z);
  // Bei einem gestreckten Durchgang heben sich die Schenkel auf; dann steht
  // die Beschriftung senkrecht darueber statt nirgends.
  const bisector = length < 1e-6
    ? { x: -from.z, z: from.x }
    : { x: sum.x / length, z: sum.z / length };
  return { degrees, bisector, from, to };
}

export type SketchCornerAngle = SketchPreviewAngle & { pointId: string };

/** Eine Kante ohne eigene Art ist eine Gerade - so liest sie auch der Rest. */
function isStraight(segment: { kind?: string }) {
  return !segment.kind || segment.kind === "line";
}

/**
 * Die Winkel, die dauerhaft in der Skizze stehen: an jeder Ecke, an der genau
 * zwei **gerade** Kanten zusammentreffen.
 *
 * Nur gerade Kanten, weil nur dort der Winkel eindeutig ist - an einem Bogen
 * haengt er am Griff, und der verschiebt sich beim Ziehen, ohne dass sich der
 * Umriss sichtbar aendert. Ein gestreckter Durchgang faellt weg: 180 Grad an
 * einer Stelle, die gar keine Ecke ist, waere nur Beiwerk im Bild.
 */
export function sketchStraightCornerAngles(profile: SketchProfile, straightLimitDegrees = 0.5): SketchCornerAngle[] {
  const pointById = new Map(profile.points.map((point) => [point.id, point]));
  const neighboursByPoint = new Map<string, string[]>();
  for (const segment of profile.segments) {
    if (!isStraight(segment) || segment.startId === segment.endId) continue;
    for (const [id, otherId] of [[segment.startId, segment.endId], [segment.endId, segment.startId]] as const) {
      const list = neighboursByPoint.get(id);
      if (list) list.push(otherId);
      else neighboursByPoint.set(id, [otherId]);
    }
  }
  const corners: SketchCornerAngle[] = [];
  for (const point of profile.points) {
    const neighbours = neighboursByPoint.get(point.id);
    // Genau zwei: an einem Ende laeuft nichts zusammen, und wo sich drei
    // Kanten treffen, gibt es keinen einzelnen Winkel zu nennen.
    if (!neighbours || neighbours.length !== 2) continue;
    const first = pointById.get(neighbours[0]);
    const second = pointById.get(neighbours[1]);
    if (!first || !second) continue;
    const geometry = cornerGeometry(point, first, second);
    if (!geometry) continue;
    if (Math.abs(geometry.degrees - 180) < straightLimitDegrees) continue;
    corners.push({ ...geometry, pointId: point.id, vertex: { x: point.x, z: point.z } });
  }
  return corners;
}

/**
 * Der Winkel, den die Linie, die man gerade zieht, mit der davor einschliesst.
 *
 * Er steht beim Zeichnen neben der Ecke, damit man eine Ecke setzen kann, ohne
 * sie hinterher nachzumessen. Ohne eine Kante davor gibt es nichts zu
 * vergleichen - dann steht auch nichts da.
 */
export function sketchPreviewAngle(
  profile: SketchProfile,
  activePointId: string,
  hover: SketchPlanePoint,
): SketchPreviewAngle | null {
  const vertex = profile.points.find((point) => point.id === activePointId);
  if (!vertex) return null;
  const incoming = incomingCornerPoint(profile, activePointId);
  if (!incoming) return null;
  const geometry = cornerGeometry(vertex, incoming, hover);
  if (!geometry) return null;
  return { ...geometry, vertex: { x: vertex.x, z: vertex.z } };
}

function unit(point: SketchPlanePoint, vertex: SketchPlanePoint): SketchPlanePoint | null {
  const dx = point.x - vertex.x;
  const dz = point.z - vertex.z;
  const length = Math.hypot(dx, dz);
  if (length < 1e-6) return null;
  return { x: dx / length, z: dz / length };
}
