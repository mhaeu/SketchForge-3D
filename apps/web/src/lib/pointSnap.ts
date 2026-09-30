/**
 * pointSnap.ts
 *
 * Der Punkt, den man am Koerper anfassen kann: eine Ecke, eine Stelle auf
 * einer Kante, oder die Mitte einer Flaeche.
 *
 * Gedacht fuer das Aufeinandersetzen zweier Koerper: Man zeigt auf eine Ecke
 * des einen und auf eine Ecke des anderen, und der erste wandert so, dass die
 * beiden Punkte zusammenfallen. Gedreht wird dabei nichts - eine reine
 * Verschiebung, damit der gezeigte Punkt danach immer noch derselbe ist.
 *
 * Gerechnet wird auf dem Dreiecksnetz in Weltkoordinaten (neun Zahlen je
 * Dreieck, wie in `rotationPivot`). Nicht auf den gezeichneten Kantenlinien:
 * die gibt es nur am ausgewaehlten Koerper, und der Koerper, auf den man
 * zielt, ist meist nicht der ausgewaehlte.
 *
 * Welche Kante eine Kante ist, entscheidet der Knick: Eine Naht zwischen zwei
 * Dreiecken derselben Ebene ist blosse Unterteilung - die Diagonale ueber
 * eine Kastenwand ist keine Kante, auf die man zeigen will. Am Mantel eines
 * Rohrs mit 32 Seiten knickt es je Naht nur 11 Grad; erst der Rand zum
 * runden Ende knickt deutlich, und genau der bleibt uebrig.
 *
 * License: MIT
 */

import { planarFaceCentroid } from "@/lib/rotationPivot";

export type SnapPoint = { x: number; y: number; z: number };
export type ScreenPoint = { x: number; y: number };

/** Woran der Punkt haengt - allein fuer die Rueckmeldung an den Benutzer. */
export type SnapKind = "corner" | "edge" | "face";

export type SnapHit = { kind: SnapKind; point: SnapPoint };

/** Wie nah der Zeiger an einer Ecke stehen muss, in Bildpunkten. */
export const SNAP_CORNER_RADIUS_PX = 11;

/** Dasselbe fuer eine Kante. Etwas weiter, denn sie ist nur einen Strich breit. */
export const SNAP_EDGE_RADIUS_PX = 13;

/**
 * Ab wann ein Knick als Kante gilt, und ab wann ein Kantenzug als Ecke.
 *
 * Dieselbe Schwelle fuer beides: Wo der Mantel eines Rohrs zu feinstufig ist,
 * um als gekantet zu gelten, ist auch sein Rand zu feinstufig, um an jeder
 * Naht eine Ecke zu haben.
 */
const FEATURE_ANGLE_DEGREES = 20;
const FEATURE_COS = Math.cos((FEATURE_ANGLE_DEGREES * Math.PI) / 180);

/**
 * Oberhalb dieser Dreieckszahl wird nicht mehr nach Kanten gesucht.
 *
 * Ein eingelesenes Netz kann Hunderttausende Dreiecke haben; jeder Klick
 * mueesste sie alle durchgehen. Dort bleibt die Flaechenmitte, die ohnehin
 * nur den Zusammenhang am Klick verfolgt.
 */
export const SNAP_MAX_TRIANGLES = 120_000;

type Candidates = {
  /** Ecken, nach Weltkoordinate. */
  corners: SnapPoint[];
  /** Kantenstuecke, je zwei Weltpunkte. */
  edges: Array<[SnapPoint, SnapPoint]>;
};

function at(positions: ArrayLike<number>, triangle: number, corner: number): SnapPoint {
  const base = triangle * 9 + corner * 3;
  return { x: positions[base], y: positions[base + 1], z: positions[base + 2] };
}

/**
 * Die Ecken und Kanten des Netzes, an die man sich haengen kann.
 *
 * Getrennt herausgeloest, weil sich beides einzeln pruefen laesst: An einem
 * Kasten kommen acht Ecken und zwoelf Kanten heraus, an einem Rohr keine Ecke
 * am Mantel und zwei Ringe an den Enden.
 */
export function meshSnapFeatures(positions: ArrayLike<number>): Candidates {
  const triangleCount = Math.floor(positions.length / 9);
  if (triangleCount === 0 || triangleCount > SNAP_MAX_TRIANGLES) return { corners: [], edges: [] };

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  const normals = new Float64Array(triangleCount * 3);
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const base = triangle * 9;
    const ux = positions[base + 3] - positions[base];
    const uy = positions[base + 4] - positions[base + 1];
    const uz = positions[base + 5] - positions[base + 2];
    const vx = positions[base + 6] - positions[base];
    const vy = positions[base + 7] - positions[base + 1];
    const vz = positions[base + 8] - positions[base + 2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const length = Math.hypot(nx, ny, nz);
    if (length > 0) {
      normals[triangle * 3] = nx / length;
      normals[triangle * 3 + 1] = ny / length;
      normals[triangle * 3 + 2] = nz / length;
    }
    for (let corner = 0; corner < 9; corner += 3) {
      minX = Math.min(minX, positions[base + corner]);
      maxX = Math.max(maxX, positions[base + corner]);
      minY = Math.min(minY, positions[base + corner + 1]);
      maxY = Math.max(maxY, positions[base + corner + 1]);
      minZ = Math.min(minZ, positions[base + corner + 2]);
      maxZ = Math.max(maxZ, positions[base + corner + 2]);
    }
  }

  const extent = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1);
  // Wie in `rotationPivot`: Das Netz haelt seine Punkte in einfacher
  // Genauigkeit, eine Naht liegt darum einen Rundungsfehler auseinander.
  const weld = extent * 1e-6;
  const key = (point: SnapPoint) => `${Math.round(point.x / weld)},${Math.round(point.y / weld)},${Math.round(point.z / weld)}`;

  type Edge = { a: SnapPoint; b: SnapPoint; keyA: string; keyB: string; triangles: number[] };
  const edges = new Map<string, Edge>();
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    for (let corner = 0; corner < 3; corner += 1) {
      const a = at(positions, triangle, corner);
      const b = at(positions, triangle, (corner + 1) % 3);
      const keyA = key(a);
      const keyB = key(b);
      if (keyA === keyB) continue;
      const pairKey = keyA < keyB ? `${keyA}|${keyB}` : `${keyB}|${keyA}`;
      const found = edges.get(pairKey);
      if (found) found.triangles.push(triangle);
      else edges.set(pairKey, { a, b, keyA, keyB, triangles: [triangle] });
    }
  }

  const featureEdges: Edge[] = [];
  edges.forEach((edge) => {
    if (edge.triangles.length !== 2) {
      // Ein Rand ohne Nachbarn ist immer eine Kante: Ein offenes Netz hoert
      // dort auf, und mehr als zwei Nachbarn heisst, dass sich hier etwas
      // trifft.
      featureEdges.push(edge);
      return;
    }
    const [first, second] = edge.triangles;
    const facing = normals[first * 3] * normals[second * 3]
      + normals[first * 3 + 1] * normals[second * 3 + 1]
      + normals[first * 3 + 2] * normals[second * 3 + 2];
    if (facing < FEATURE_COS) featureEdges.push(edge);
  });

  /*
   * Eine Ecke ist, wo ein Kantenzug knickt.
   *
   * Am Rand eines Rohrs mit vielen Seiten laufen zwei Kanten fast gerade
   * durcheinander - dort liegt keine Ecke, sondern eine Kante, auf der man
   * jede Stelle zeigen darf. An einer Kastenecke stossen drei Kanten im
   * rechten Winkel zusammen. Endet eine Kante allein, ist ihr Ende eine Ecke.
   */
  const directions = new Map<string, Array<{ x: number; y: number; z: number }>>();
  const corner = new Map<string, SnapPoint>();
  const away = (from: SnapPoint, to: SnapPoint) => {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    const length = Math.hypot(dx, dy, dz);
    return length > 0 ? { x: dx / length, y: dy / length, z: dz / length } : null;
  };
  featureEdges.forEach((edge) => {
    corner.set(edge.keyA, edge.a);
    corner.set(edge.keyB, edge.b);
    const fromA = away(edge.a, edge.b);
    const fromB = away(edge.b, edge.a);
    if (fromA) directions.set(edge.keyA, [...(directions.get(edge.keyA) ?? []), fromA]);
    if (fromB) directions.set(edge.keyB, [...(directions.get(edge.keyB) ?? []), fromB]);
  });

  const corners: SnapPoint[] = [];
  directions.forEach((list, vertexKey) => {
    const point = corner.get(vertexKey);
    if (!point) return;
    if (list.length === 1) {
      corners.push(point);
      return;
    }
    // Zwei Richtungen, die vom Punkt wegzeigen, liegen bei gerader
    // Durchfahrt gegenueber: ihr Skalarprodukt ist -1. Ein Knick von
    // FEATURE_ANGLE_DEGREES hebt es auf -cos(FEATURE_ANGLE_DEGREES).
    const bends = list.some((one, index) => list.slice(index + 1).some((other) => (
      one.x * other.x + one.y * other.y + one.z * other.z > -FEATURE_COS
    )));
    if (bends) corners.push(point);
  });

  return { corners, edges: featureEdges.map((edge) => [edge.a, edge.b] as [SnapPoint, SnapPoint]) };
}

function screenDistance(pointer: ScreenPoint, point: ScreenPoint) {
  return Math.hypot(pointer.x - point.x, pointer.y - point.y);
}

/**
 * Der Punkt am Netz, auf den der Zeiger zeigt.
 *
 * `project` bildet einen Weltpunkt auf die Leinwand ab und gibt `null` fuer
 * alles, was hinter der Kamera liegt. Gemessen wird in Bildpunkten und nicht
 * in Millimetern, denn der Abstand, den der Benutzer sieht, ist der auf dem
 * Schirm: naeher heranfahren muss das Zielen leichter machen, nicht enger.
 *
 * `visible` haelt Verdecktes heraus. Ohne diese Frage waere die Rechnung
 * blind fuer die Tiefe: Die hintere obere Kante eines Kastens bildet sich
 * mitten auf seine vordere Wand ab, und ein Klick auf die Wandmitte landete
 * auf einer Kante, die man gar nicht sieht.
 *
 * Die Reihenfolge ist Ecke, Kante, Flaechenmitte. Sie ist auch eine
 * Rangfolge: Eine Ecke ist genauer gemeint als eine Kante, und wer mitten auf
 * eine Flaeche klickt, meint deren Mitte - am runden Ende eines Rohrs ist das
 * seine Achse. Die Flaechenmitte wird nicht auf Sicht geprueft: Der Strahl
 * hat diese Flaeche getroffen, also ist sie gemeint, auch wenn ihre Mitte
 * hinter etwas anderem liegt.
 */
export function snapPointOnMesh(
  positions: ArrayLike<number>,
  hitTriangle: number,
  pointer: ScreenPoint,
  project: (point: SnapPoint) => ScreenPoint | null,
  visible: (point: SnapPoint) => boolean = () => true,
): SnapHit | null {
  const triangleCount = Math.floor(positions.length / 9);
  if (hitTriangle < 0 || hitTriangle >= triangleCount) return null;

  const features = meshSnapFeatures(positions);

  const corners: Array<{ point: SnapPoint; distance: number }> = [];
  for (const point of features.corners) {
    const screen = project(point);
    if (!screen) continue;
    const distance = screenDistance(pointer, screen);
    if (distance <= SNAP_CORNER_RADIUS_PX) corners.push({ point, distance });
  }
  const corner = nearestVisible(corners, visible);
  if (corner) return { kind: "corner", point: corner };

  const onEdges: Array<{ point: SnapPoint; distance: number }> = [];
  for (const [a, b] of features.edges) {
    const screenA = project(a);
    const screenB = project(b);
    if (!screenA || !screenB) continue;
    const dx = screenB.x - screenA.x;
    const dy = screenB.y - screenA.y;
    const lengthSq = dx * dx + dy * dy;
    const amount = lengthSq > 1e-9
      ? Math.min(1, Math.max(0, ((pointer.x - screenA.x) * dx + (pointer.y - screenA.y) * dy) / lengthSq))
      : 0;
    const distance = screenDistance(pointer, { x: screenA.x + dx * amount, y: screenA.y + dy * amount });
    if (distance > SNAP_EDGE_RADIUS_PX) continue;
    /*
     * Der Anteil ist auf dem Schirm gemessen und wird in der Welt angewandt.
     * Bei einer Zentralprojektion stimmt das nicht genau; ueber ein
     * Kantenstueck von wenigen Bildpunkten ist der Fehler kleiner als das
     * Zielen selbst.
     */
    onEdges.push({
      point: { x: a.x + (b.x - a.x) * amount, y: a.y + (b.y - a.y) * amount, z: a.z + (b.z - a.z) * amount },
      distance,
    });
  }
  const onEdge = nearestVisible(onEdges, visible);
  if (onEdge) return { kind: "edge", point: onEdge };

  const centre = planarFaceCentroid(positions, hitTriangle);
  return centre ? { kind: "face", point: centre } : null;
}

/**
 * Wie viele Bewerber hoechstens auf Sicht geprueft werden.
 *
 * Jede Frage kostet einen Strahl durch die Szene. An einem feinen Netz
 * liegen leicht ein Dutzend Nahtpunkte im Zielkreis; sind die naechsten acht
 * alle verdeckt, ist ohnehin nicht die Ecke gemeint, auf die gezeigt wurde.
 */
const SNAP_VISIBILITY_TRIES = 8;

function nearestVisible(
  candidates: Array<{ point: SnapPoint; distance: number }>,
  visible: (point: SnapPoint) => boolean,
): SnapPoint | null {
  return candidates
    .sort((one, other) => one.distance - other.distance)
    .slice(0, SNAP_VISIBILITY_TRIES)
    .find((candidate) => visible(candidate.point))?.point ?? null;
}

/** Die Verschiebung, die `from` auf `to` legt. */
export function snapTranslation(from: SnapPoint, to: SnapPoint): SnapPoint {
  return { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z };
}

/**
 * Welche Koerper mitgehen.
 *
 * Bewegt wird der Koerper, auf dem der erste Punkt sitzt. Gehoert er zur
 * Auswahl, wandert die ganze Auswahl mit - wer eine Baugruppe ausgewaehlt hat
 * und sie an einer ihrer Ecken ansetzt, will sie geschlossen versetzen.
 * Festgestellte Koerper bleiben stehen, auch der angesetzte selbst; dann
 * bewegt sich nichts.
 */
export function snapMoveIds(
  anchorShapeId: string,
  selectedIds: ReadonlyArray<string>,
  shapes: ReadonlyArray<{ id: string; locked?: boolean }>,
): string[] {
  const anchor = shapes.find((shape) => shape.id === anchorShapeId);
  if (!anchor || anchor.locked) return [];
  const wanted = selectedIds.includes(anchorShapeId) ? selectedIds : [anchorShapeId];
  return shapes.filter((shape) => wanted.includes(shape.id) && !shape.locked).map((shape) => shape.id);
}

/** Welche der beiden Ansetzarten laeuft. */
export type SnapMode = "point" | "workplane";

/** Ein gezeigter Punkt samt dem Koerper, an dem er haengt. */
export type SnapPick = { shapeId: string; kind: SnapKind; point: SnapPoint };
