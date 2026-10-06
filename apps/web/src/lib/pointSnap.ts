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
 */

import { planarFaceCentroid } from "@/lib/rotationPivot";

export type SnapPoint = { x: number; y: number; z: number };
export type ScreenPoint = { x: number; y: number };

/** Woran der Punkt haengt. */
export type SnapKind = "corner" | "edge" | "edgeMiddle" | "face" | "surface";

/**
 * Was gefasst werden soll.
 *
 * "auto" entscheidet nach der Naehe: Ecke, sonst Kante, sonst Flaechenmitte.
 * Alle anderen sind eine Ansage, und dann gilt sie auch ueber den Zielkreis
 * hinaus - wer "Eckpunkt" sagt, meint die naechste Ecke und nicht erst die,
 * die naeher als elf Bildpunkte liegt.
 */
export type SnapTarget = "auto" | "corner" | "edge" | "edgeMiddle" | "face" | "surface";

/** In der Reihenfolge, in der sie im Bedienfeld stehen. */
export const SNAP_TARGETS: readonly SnapTarget[] = ["auto", "corner", "edge", "edgeMiddle", "face", "surface"];

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

/**
 * Ein Kantenzug: die Kante als Ganzes, aus Netzstuecken zusammengesetzt.
 *
 * `closed` heisst, dass er in sich zuruecklaeuft - der Rand eines runden
 * Rohrendes. Der letzte Punkt ist dann nicht noch einmal der erste.
 */
export type SnapChain = { points: SnapPoint[]; closed: boolean };

export type SnapFeatures = {
  /** Ecken, nach Weltkoordinate. */
  corners: SnapPoint[];
  /** Kantenstuecke, je zwei Weltpunkte. */
  edges: Array<[SnapPoint, SnapPoint]>;
  /** Dieselben Stuecke, zu ganzen Kanten zusammengefasst. */
  chains: SnapChain[];
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
export function meshSnapFeatures(positions: ArrayLike<number>): SnapFeatures {
  const triangleCount = Math.floor(positions.length / 9);
  if (triangleCount === 0 || triangleCount > SNAP_MAX_TRIANGLES) return { corners: [], edges: [], chains: [] };

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
  const cornerKeys = new Set<string>();
  directions.forEach((list, vertexKey) => {
    const point = corner.get(vertexKey);
    if (!point) return;
    if (list.length === 1) {
      corners.push(point);
      cornerKeys.add(vertexKey);
      return;
    }
    // Zwei Richtungen, die vom Punkt wegzeigen, liegen bei gerader
    // Durchfahrt gegenueber: ihr Skalarprodukt ist -1. Ein Knick von
    // FEATURE_ANGLE_DEGREES hebt es auf -cos(FEATURE_ANGLE_DEGREES).
    const bends = list.some((one, index) => list.slice(index + 1).some((other) => (
      one.x * other.x + one.y * other.y + one.z * other.z > -FEATURE_COS
    )));
    if (bends) {
      corners.push(point);
      cornerKeys.add(vertexKey);
    }
  });

  /*
   * Die Netzstuecke zu ganzen Kanten zusammenlegen.
   *
   * Ein Kasten hat zwoelf Kanten, jede aus einem Stueck; der Rand eines
   * Rohrendes ist ein Ring aus zweiunddreissig. Fuer "Mitte der Kante" muss
   * klar sein, was die Kante ist - die Mitte eines einzelnen Netzstuecks waere
   * beliebig.
   *
   * Weitergegangen wird nur durch Punkte, die keine Ecke sind und an denen
   * genau zwei Kanten zusammenkommen. An einer Ecke hoert der Zug auf, denn
   * dort knickt er, und wo drei zusammenlaufen, ist nicht entschieden, welche
   * gemeint ist.
   */
  const edgesAtVertex = new Map<string, number[]>();
  featureEdges.forEach((edge, index) => {
    edgesAtVertex.set(edge.keyA, [...(edgesAtVertex.get(edge.keyA) ?? []), index]);
    edgesAtVertex.set(edge.keyB, [...(edgesAtVertex.get(edge.keyB) ?? []), index]);
  });
  const used = new Set<number>();
  const onwards = (vertexKey: string, from: number) => {
    if (cornerKeys.has(vertexKey)) return null;
    const list = edgesAtVertex.get(vertexKey) ?? [];
    if (list.length !== 2) return null;
    const other = list.find((index) => index !== from);
    return other !== undefined && !used.has(other) ? other : null;
  };
  const chains: SnapChain[] = [];
  featureEdges.forEach((edge, index) => {
    if (used.has(index)) return;
    used.add(index);
    const points = [edge.a, edge.b];
    let headKey = edge.keyB;
    let head = index;
    for (;;) {
      const step = onwards(headKey, head);
      if (step === null) break;
      used.add(step);
      const next = featureEdges[step];
      const forward = next.keyA === headKey;
      points.push(forward ? next.b : next.a);
      headKey = forward ? next.keyB : next.keyA;
      head = step;
    }
    // Zurueck am Anfang angekommen: Der letzte Punkt ist wieder der erste und
    // kommt weg, `closed` sagt den Rest.
    const closed = headKey === edge.keyA && points.length > 2;
    if (closed) points.pop();
    else {
      let tailKey = edge.keyA;
      let tail = index;
      for (;;) {
        const step = onwards(tailKey, tail);
        if (step === null) break;
        used.add(step);
        const next = featureEdges[step];
        const forward = next.keyA === tailKey;
        points.unshift(forward ? next.b : next.a);
        tailKey = forward ? next.keyB : next.keyA;
        tail = step;
      }
    }
    chains.push({ points, closed });
  });

  return {
    corners,
    edges: featureEdges.map((edge) => [edge.a, edge.b] as [SnapPoint, SnapPoint]),
    chains,
  };
}

/** Die Stuecke eines Kantenzugs, beim geschlossenen mit dem Rueckweg. */
function chainSegments(chain: SnapChain): Array<[SnapPoint, SnapPoint]> {
  const segments: Array<[SnapPoint, SnapPoint]> = [];
  for (let index = 0; index + 1 < chain.points.length; index += 1) {
    segments.push([chain.points[index], chain.points[index + 1]]);
  }
  if (chain.closed && chain.points.length > 2) {
    segments.push([chain.points[chain.points.length - 1], chain.points[0]]);
  }
  return segments;
}

function distanceBetween(a: SnapPoint, b: SnapPoint) {
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}

/**
 * Die Mitte einer Kante.
 *
 * Beim offenen Zug ist das die Stelle auf halber Laenge - bei einer geraden
 * Kante genau ihre Mitte, bei einem Bogen die Stelle, die gleich weit von
 * beiden Enden entfernt ist.
 *
 * Beim geschlossenen Ring gibt es keine halbe Laenge, die etwas bedeutet.
 * Dort ist die Mitte die nach Laenge gewichtete Mitte aller Stuecke, und das
 * ist beim runden Rohrende genau seine Achse - dieselbe Stelle, die ein Klick
 * auf das Ende selbst liefert, nur eben vom Rand aus gezeigt.
 */
export function chainMiddle(chain: SnapChain): SnapPoint | null {
  if (chain.points.length === 0) return null;
  if (chain.points.length === 1) return chain.points[0];
  const segments = chainSegments(chain);
  const total = segments.reduce((sum, [a, b]) => sum + distanceBetween(a, b), 0);
  if (!(total > 0)) return chain.points[0];

  if (chain.closed) {
    let x = 0;
    let y = 0;
    let z = 0;
    segments.forEach(([a, b]) => {
      const length = distanceBetween(a, b);
      x += ((a.x + b.x) / 2) * length;
      y += ((a.y + b.y) / 2) * length;
      z += ((a.z + b.z) / 2) * length;
    });
    return { x: x / total, y: y / total, z: z / total };
  }

  let travelled = 0;
  for (const [a, b] of segments) {
    const length = distanceBetween(a, b);
    if (travelled + length >= total / 2 && length > 0) {
      const amount = (total / 2 - travelled) / length;
      return { x: a.x + (b.x - a.x) * amount, y: a.y + (b.y - a.y) * amount, z: a.z + (b.z - a.z) * amount };
    }
    travelled += length;
  }
  return chain.points[chain.points.length - 1];
}

function screenDistance(pointer: ScreenPoint, point: ScreenPoint) {
  return Math.hypot(pointer.x - point.x, pointer.y - point.y);
}

/**
 * Wie viele Bewerber hoechstens auf Sicht geprueft werden.
 *
 * Jede Frage kostet einen Strahl durch die Szene. An einem feinen Netz
 * liegen leicht ein Dutzend Nahtpunkte im Zielkreis; sind die naechsten acht
 * alle verdeckt, ist ohnehin nicht die Ecke gemeint, auf die gezeigt wurde.
 */
const SNAP_VISIBILITY_TRIES = 8;

/**
 * Ein Bewerber.
 *
 * `probe` ist die Stelle, an der nach Sicht gefragt wird, und nicht immer der
 * Punkt selbst: Die Mitte eines Rings liegt in seinem Loch, die Sicht auf sie
 * sagt also nichts darueber, ob der Benutzer diesen Ring gemeint hat.
 * Gefragt wird dann an der Stelle des Rings, auf die gezeigt wurde.
 */
type Candidate = { point: SnapPoint; probe: SnapPoint; distance: number };

/** Der naechste sichtbare Bewerber. */
function nearestVisible(candidates: Candidate[], visible: (point: SnapPoint) => boolean): SnapPoint | null {
  return candidates
    .sort((one, other) => one.distance - other.distance)
    .slice(0, SNAP_VISIBILITY_TRIES)
    .find((candidate) => visible(candidate.probe))?.point ?? null;
}

/**
 * Derselbe Vorzug, aber ohne Absage: Ist keiner der naechsten sichtbar,
 * bleibt der naechste. Das ist die Antwort auf eine Ansage - wer "Eckpunkt"
 * gewaehlt hat, soll eine Ecke bekommen und nicht eine Absage, nur weil sie
 * hinter dem Koerper liegt.
 */
function nearestPreferablyVisible(candidates: Candidate[], visible: (point: SnapPoint) => boolean): SnapPoint | null {
  const sorted = candidates.sort((one, other) => one.distance - other.distance);
  return nearestVisible(sorted, visible) ?? sorted[0]?.point ?? null;
}

/** Die Ecken als Bewerber, hoechstens `limit` Bildpunkte vom Zeiger entfernt. */
function cornerCandidates(features: SnapFeatures, pointer: ScreenPoint, project: Project, limit: number) {
  const candidates: Candidate[] = [];
  for (const point of features.corners) {
    const screen = project(point);
    if (!screen) continue;
    const distance = screenDistance(pointer, screen);
    if (distance <= limit) candidates.push({ point, probe: point, distance });
  }
  return candidates;
}

/**
 * Die naechste Stelle auf einem Kantenstueck, auf dem Schirm gemessen.
 *
 * Der Anteil wird in der Welt angewandt. Bei einer Zentralprojektion stimmt
 * das nicht genau; ueber ein Kantenstueck von wenigen Bildpunkten ist der
 * Fehler kleiner als das Zielen selbst.
 */
function onSegment(a: SnapPoint, b: SnapPoint, pointer: ScreenPoint, project: Project): Candidate | null {
  const screenA = project(a);
  const screenB = project(b);
  if (!screenA || !screenB) return null;
  const dx = screenB.x - screenA.x;
  const dy = screenB.y - screenA.y;
  const lengthSq = dx * dx + dy * dy;
  const amount = lengthSq > 1e-9
    ? Math.min(1, Math.max(0, ((pointer.x - screenA.x) * dx + (pointer.y - screenA.y) * dy) / lengthSq))
    : 0;
  const point = {
    x: a.x + (b.x - a.x) * amount,
    y: a.y + (b.y - a.y) * amount,
    z: a.z + (b.z - a.z) * amount,
  };
  return { point, probe: point, distance: screenDistance(pointer, { x: screenA.x + dx * amount, y: screenA.y + dy * amount }) };
}

function edgeCandidates(features: SnapFeatures, pointer: ScreenPoint, project: Project, limit: number) {
  const candidates: Candidate[] = [];
  for (const [a, b] of features.edges) {
    const candidate = onSegment(a, b, pointer, project);
    if (candidate && candidate.distance <= limit) candidates.push(candidate);
  }
  return candidates;
}

/** Je ganze Kante ein Bewerber: ihre Mitte, gemessen an der gezeigten Stelle. */
function middleCandidates(features: SnapFeatures, pointer: ScreenPoint, project: Project) {
  const candidates: Candidate[] = [];
  for (const chain of features.chains) {
    const middle = chainMiddle(chain);
    if (!middle) continue;
    let nearest: Candidate | null = null;
    for (const [a, b] of chainSegments(chain)) {
      const candidate = onSegment(a, b, pointer, project);
      if (candidate && (!nearest || candidate.distance < nearest.distance)) nearest = candidate;
    }
    if (nearest) candidates.push({ point: middle, probe: nearest.point, distance: nearest.distance });
  }
  return candidates;
}

type Project = (point: SnapPoint) => ScreenPoint | null;

export type SnapRequest = {
  /** Das getroffene Netz in Weltkoordinaten, neun Zahlen je Dreieck. */
  positions: ArrayLike<number>;
  /** Die Nummer des getroffenen Dreiecks. */
  triangle: number;
  /** Der Zeiger auf der Leinwand. */
  pointer: ScreenPoint;
  /** Wo der Strahl die Flaeche trifft - die Antwort fuer "frei auf der Flaeche". */
  hitPoint: SnapPoint;
  target: SnapTarget;
  /** Ein Weltpunkt auf die Leinwand; `null` fuer alles hinter der Kamera. */
  project: Project;
  visible?: (point: SnapPoint) => boolean;
  /**
   * Ob es diesen Punkt ueberhaupt zu greifen gibt.
   *
   * Anders als `visible` ist das eine harte Absage und kein Vorzug: Die
   * Schnittansicht *nimmt* die halbe Zeichnung weg, und was sie wegnimmt,
   * nimmt sie auch dem Zeiger weg - sonst griffe man beim Blick ins Innere
   * immer wieder die Wand davor. Verdecktes dagegen ist nur schwer zu sehen;
   * es bleibt greifbar, wenn man es ausdruecklich verlangt.
   */
  available?: (point: SnapPoint) => boolean;
};

/**
 * Der Punkt am Netz, auf den der Zeiger zeigt.
 *
 * Gemessen wird in Bildpunkten und nicht in Millimetern, denn der Abstand,
 * den der Benutzer sieht, ist der auf dem Schirm: naeher heranfahren muss das
 * Zielen leichter machen, nicht enger.
 *
 * `visible` haelt Verdecktes heraus. Ohne diese Frage waere die Rechnung
 * blind fuer die Tiefe: Die hintere obere Kante eines Kastens bildet sich
 * mitten auf seine vordere Wand ab, und ein Klick auf die Wandmitte landete
 * auf einer Kante, die man gar nicht sieht.
 *
 * Bei "auto" ist die Reihenfolge Ecke, Kante, Flaechenmitte, und sie ist auch
 * eine Rangfolge: Eine Ecke ist genauer gemeint als eine Kante, und wer
 * mitten auf eine Flaeche klickt, meint deren Mitte - am runden Ende eines
 * Rohrs ist das seine Achse.
 *
 * Die Flaechenmitte wird nicht auf Sicht geprueft: Der Strahl hat diese
 * Flaeche getroffen, also ist sie gemeint, auch wenn ihre Mitte hinter etwas
 * anderem liegt. Dasselbe gilt fuer die freie Stelle auf der Flaeche.
 *
 * `available` ist die andere Frage und die haertere: Was die Schnittansicht
 * weggenommen hat, gibt es nicht - weder als Ecke noch als Kante noch als
 * Flaechenmitte, und auch dann nicht, wenn man es ausdruecklich verlangt.
 * Gefragt wird am Punkt selbst und nicht an der Stelle, auf die gezeigt wurde:
 * Es geht darum, wohin der Koerper angesetzt wuerde, nicht um die Sichtlinie.
 */
export function snapPointOnMesh(request: SnapRequest): SnapHit | null {
  const { positions, triangle, pointer, hitPoint, target, project } = request;
  const visible = request.visible ?? (() => true);
  const available = request.available ?? (() => true);
  const offered = (candidates: Candidate[]) => candidates.filter((candidate) => available(candidate.point));
  const triangleCount = Math.floor(positions.length / 9);
  if (triangle < 0 || triangle >= triangleCount) return null;

  // Die getroffene Stelle hat der Aufrufer schon geprueft - der Strahl ist
  // dort auf den Koerper gestossen.
  if (target === "surface") return { kind: "surface", point: hitPoint };
  if (target === "face") {
    const centre = planarFaceCentroid(positions, triangle);
    return centre && available(centre) ? { kind: "face", point: centre } : null;
  }

  const features = meshSnapFeatures(positions);

  if (target === "corner") {
    const point = nearestPreferablyVisible(offered(cornerCandidates(features, pointer, project, Infinity)), visible);
    return point ? { kind: "corner", point } : null;
  }
  if (target === "edge") {
    const point = nearestPreferablyVisible(offered(edgeCandidates(features, pointer, project, Infinity)), visible);
    return point ? { kind: "edge", point } : null;
  }
  if (target === "edgeMiddle") {
    const point = nearestPreferablyVisible(offered(middleCandidates(features, pointer, project)), visible);
    return point ? { kind: "edgeMiddle", point } : null;
  }

  const corner = nearestVisible(offered(cornerCandidates(features, pointer, project, SNAP_CORNER_RADIUS_PX)), visible);
  if (corner) return { kind: "corner", point: corner };
  const onEdge = nearestVisible(offered(edgeCandidates(features, pointer, project, SNAP_EDGE_RADIUS_PX)), visible);
  if (onEdge) return { kind: "edge", point: onEdge };
  const centre = planarFaceCentroid(positions, triangle);
  return centre && available(centre) ? { kind: "face", point: centre } : null;
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
