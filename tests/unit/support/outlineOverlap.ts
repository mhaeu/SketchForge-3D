/**
 * Zwei Umrisse nebeneinanderlegen und nachsehen, ob sie sich beruehren oder
 * ineinanderstecken.
 *
 * Das ist das Messwerkzeug fuer jede Kaemm-Zusage: zwei Zahnraeder, ein Rad
 * auf einer Zahnstange, ein Rad in einem Hohlrad. Es steht hier und nicht in
 * einer der Pruefdateien, weil sonst jede ihre eigene Fassung haette - und
 * ein Messfehler in einer Fassung faellt in der anderen nicht auf.
 */

export type OutlinePoint = { x: number; z: number };

export function pointInPolygon(point: OutlinePoint, polygon: readonly OutlinePoint[]) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const a = polygon[index];
    const b = polygon[previous];
    if ((a.z > point.z) !== (b.z > point.z)
      && point.x < ((b.x - a.x) * (point.z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

/**
 * Wie viele Punkte des einen Umrisses im anderen liegen - also wie weit sie
 * sich ueberdecken.
 *
 * `band` grenzt ein, **welche Punkte** gefragt werden: Ein Punkt am anderen
 * Ende des Rades kann nicht im Gegenrad stecken, und ohne diese Grenze laeuft
 * die Suche ueber alle Verdrehungen in die Zeitsperre. Die Vielecke selbst
 * bleiben ganz - eine Auswahl von Punkten ist kein Vieleck.
 */
export function overlapCount(
  one: readonly OutlinePoint[],
  other: readonly OutlinePoint[],
  band?: { from: number; to: number },
) {
  const near = (points: readonly OutlinePoint[]) => (
    band ? points.filter((point) => point.x > band.from && point.x < band.to) : points
  );
  return near(one).filter((point) => pointInPolygon(point, other)).length
    + near(other).filter((point) => pointInPolygon(point, one)).length;
}

export function distanceToSegment(point: OutlinePoint, a: OutlinePoint, b: OutlinePoint) {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const lengthSquared = abx * abx + abz * abz;
  const share = lengthSquared > 0
    ? Math.max(0, Math.min(1, ((point.x - a.x) * abx + (point.z - a.z) * abz) / lengthSquared))
    : 0;
  return Math.hypot(point.x - (a.x + abx * share), point.z - (a.z + abz * share));
}

/**
 * Der kleinste Abstand von diesen Punkten zu den Kanten des Vielecks.
 *
 * `points` darf eine Auswahl sein - etwa nur die Zaehne an der Beruehrung -,
 * `polygon` **nie**: Aus einer Auswahl von Punkten ein Vieleck zu machen gibt
 * eine Form, die es nicht gibt. Genau daran ist mein erster Messanlauf bei den
 * Zahnraedern gescheitert: Er hielt 12 Zaehne fuer klemmend, und das war die
 * Auswahl, die als Vieleck gelesen wurde.
 */
export function closestApproach(points: readonly OutlinePoint[], polygon: readonly OutlinePoint[]) {
  let closest = Number.POSITIVE_INFINITY;
  points.forEach((point) => {
    for (let index = 0; index < polygon.length; index += 1) {
      closest = Math.min(closest, distanceToSegment(point, polygon[index], polygon[(index + 1) % polygon.length]));
    }
  });
  return closest;
}
