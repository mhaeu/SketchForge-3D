/**
 * meshPlanarFaces.ts
 *
 * Die flachen Flaechen eines Netzes zurueckgewinnen: Dreiecke, die in einer
 * Ebene liegen, werden zu **einer** Flaeche mit einem sauberen Rand.
 *
 * Warum das noetig ist - gemessen, nicht vermutet. Ein Kasten mit einer
 * Bohrung (96 Ecken), ungeteilt durch unseren Netzweg in den Kern gegeben,
 * kommt mustergueltig heraus: 102 Flaechen, die vier Waende mit je 4 Kanten,
 * Deckel und Boden mit je 100 (4 Rand plus 96 Bohrungsrand). Eine Verrundung
 * auf allen 204 scharfen Kanten laeuft durch.
 *
 * Derselbe Koerper, mit der Ebene schraeg durchgeschnitten, kommt als Scherbe
 * heraus: eine Wand mit **53** Kanten statt 4, eine mit 10, und die
 * Schnittflaeche selbst zerfaellt in mehrere Stuecke (90,03 und 63,87 mm^2 mit
 * je 3 Kanten - grosse Dreiecke, die nicht zueinandergefunden haben). Von 103
 * scharfen Kanten nimmt **keine** eine Verrundung an, auch einzeln nicht: 94
 * von 103 scheitern allein, der Rest in jeder Gruppe.
 *
 * Der Grund steht in den Zahlen: Der Schnitt legt die Eckpunkte auf eine
 * schraege Ebene, und zwar in float32. Die Dreiecke darauf liegen damit nur
 * auf etwa ein Zehnmillionstel Millimeter in einer Ebene. `unifySameDomain`
 * des Kerns vergleicht die Ebenengleichungen gegen `Precision::Confusion`
 * (1e-7) und findet sie teils gleich, teils nicht - darum die Scherbe. Und wo
 * es zwei Dreiecke doch zusammenlegt, bleibt der Rand der neuen Flaeche mit
 * allen Zwischenpunkten der Vernetzung stehen, und die liegen nicht genau auf
 * der Flaeche, die der Kern dafuer gewaehlt hat.
 *
 * Darum wird hier nicht geheilt, sondern neu gebaut: Dreiecke zu Bereichen
 * zusammenfassen, je Bereich eine Ebene ausgleichen, **jede Ecke genau auf den
 * Schnitt ihrer Ebenen setzen** und den Rand als Zug aus geraden Stuecken
 * fuehren, ohne die Punkte, die mitten auf einer Gerade liegen. Was der Kern
 * danach bekommt, sind wenige Flaechen mit wenigen Kanten - und die lassen
 * sich verrunden.
 *
 * Nach Layerling 1.66.1 (dort an #248 gefunden).
 */

/** Ein geschlossener Ring: x-, y- und z-Werte hintereinander, der letzte Punkt schliesst nicht auf den ersten. */
export type PlanarLoop = readonly number[];

export type PlanarMeshFace = {
  /** Die Normale der ausgeglichenen Ebene, nach aussen zeigend. */
  normal: readonly [number, number, number];
  outline: PlanarLoop;
  /** Loecher in dieser Flaeche - der Bohrungsrand in einem Deckel. */
  holes: readonly PlanarLoop[];
};

export type PlanarMeshFacesOptions = {
  /** Wie weit ein Punkt von der Ebene seines Bereichs abweichen darf, in mm. */
  flatness?: number;
  /** Wie weit die Normale eines Dreiecks von der des Bereichs abweichen darf, in Grad. */
  flatAngle?: number;
  /** Ab welchem Abstand von der Verbindung seiner Nachbarn ein Randpunkt eine Ecke ist, in mm. */
  straightness?: number;
  /**
   * Hoechstens so viele Bereiche. Darueber lohnt der Weg nicht: Ein
   * gewachsenes Netz - ein Scan, eine Figur - hat fast so viele Bereiche wie
   * Dreiecke, und daraus so viele Einzelflaechen zu bauen waere langsamer und
   * nicht besser als der Umweg ueber STL.
   */
  maxRegions?: number;
  /**
   * Hoechstens so viele Dreiecke. Bis hierher kostet das Zusammenlegen
   * weniger als das Schreiben einer STL-Datei; darueber wird gar nicht erst
   * angefangen, damit ein dichtes Netz nicht zweimal durchgerechnet wird.
   */
  maxTriangles?: number;
  /**
   * Hoechstens dieser Anteil der Dreiecke darf als Bereich uebrig bleiben.
   * Darueber hat das Zusammenlegen nichts gebracht.
   */
  maxRegionShare?: number;
};

export type PlanarMeshFaces = {
  faces: PlanarMeshFace[];
  /** Wie viele Dreiecke zusammengefasst wurden. */
  triangles: number;
  /** Wie weit die Ecken beim Einrasten gewandert sind, groesster Wert in mm. */
  snapped: number;
};

const DEFAULT_FLATNESS = 0.001;
const DEFAULT_FLAT_ANGLE = 0.5;
const DEFAULT_STRAIGHTNESS = 0.0005;
const DEFAULT_MAX_REGIONS = 4000;
const DEFAULT_MAX_TRIANGLES = 200_000;
const DEFAULT_MAX_REGION_SHARE = 0.6;

/** Punkte, die auf ein Millionstel Millimeter gleich sind, sind derselbe Punkt. */
const WELD_SCALE = 1e6;

type Vec = [number, number, number];

function subtract(a: Vec, b: Vec): Vec {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function cross(a: Vec, b: Vec): Vec {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function dot(a: Vec, b: Vec) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function length(a: Vec) {
  return Math.hypot(a[0], a[1], a[2]);
}

/**
 * Die Punkte verschweissen: Zwei Dreiecke gelten nur als Nachbarn, wenn sie
 * denselben Punkt nennen. Ein Netz aus einer Dreieckssuppe - jedes Dreieck mit
 * eigenen Punkten - haette sonst keine Nachbarn und gar keine Bereiche.
 */
function weldVertices(positions: ArrayLike<number>, indices: ArrayLike<number>) {
  const byKey = new Map<string, number>();
  const points: Vec[] = [];
  const remap = new Int32Array(positions.length / 3);
  for (let vertex = 0; vertex * 3 + 2 < positions.length; vertex += 1) {
    const x = positions[vertex * 3];
    const y = positions[vertex * 3 + 1];
    const z = positions[vertex * 3 + 2];
    const key = `${Math.round(x * WELD_SCALE)},${Math.round(y * WELD_SCALE)},${Math.round(z * WELD_SCALE)}`;
    let found = byKey.get(key);
    if (found === undefined) {
      found = points.length;
      byKey.set(key, found);
      points.push([x, y, z]);
    }
    remap[vertex] = found;
  }
  const triangles: Array<[number, number, number]> = [];
  for (let offset = 0; offset + 2 < indices.length; offset += 3) {
    const a = remap[indices[offset]];
    const b = remap[indices[offset + 1]];
    const c = remap[indices[offset + 2]];
    // Ein Dreieck, dessen Ecken zusammenfallen, hat keine Flaeche und keinen Rand.
    if (a === b || b === c || c === a) continue;
    triangles.push([a, b, c]);
  }
  return { points, triangles };
}

function triangleNormal(points: Vec[], triangle: [number, number, number]): { normal: Vec; area: number } {
  const [a, b, c] = triangle;
  const raw = cross(subtract(points[b], points[a]), subtract(points[c], points[a]));
  const size = length(raw);
  if (size < 1e-20) return { normal: [0, 0, 0], area: 0 };
  return { normal: [raw[0] / size, raw[1] / size, raw[2] / size], area: size / 2 };
}

const edgeKey = (a: number, b: number) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/**
 * Die Dreiecke zu Bereichen zusammenlegen: von einem Dreieck aus ueber die
 * gemeinsamen Kanten weiterwachsen, solange der Nachbar in derselben Ebene
 * liegt.
 *
 * Verglichen wird dabei immer mit der Ebene des **Startdreiecks** und nicht
 * mit der des Nachbarn. Sonst wanderte der Bereich: Auf einem Zylinder aus 96
 * Flaechen weicht jede nur 3,75 Grad von der naechsten ab, und von Nachbar zu
 * Nachbar weitergegeben waere der ganze Mantel ein Bereich.
 */
function growRegions(
  points: Vec[],
  triangles: Array<[number, number, number]>,
  normals: Array<{ normal: Vec; area: number }>,
  flatness: number,
  cosLimit: number,
) {
  const neighbours = new Map<string, number[]>();
  triangles.forEach((triangle, id) => {
    for (let corner = 0; corner < 3; corner += 1) {
      const key = edgeKey(triangle[corner], triangle[(corner + 1) % 3]);
      const list = neighbours.get(key);
      if (list) list.push(id);
      else neighbours.set(key, [id]);
    }
  });

  const regionOf = new Int32Array(triangles.length).fill(-1);
  const regions: number[][] = [];
  for (let seed = 0; seed < triangles.length; seed += 1) {
    if (regionOf[seed] >= 0 || normals[seed].area === 0) continue;
    const planeNormal = normals[seed].normal;
    const planeOffset = dot(planeNormal, points[triangles[seed][0]]);
    const region = [seed];
    regionOf[seed] = regions.length;
    for (let cursor = 0; cursor < region.length; cursor += 1) {
      const current = triangles[region[cursor]];
      for (let corner = 0; corner < 3; corner += 1) {
        const key = edgeKey(current[corner], current[(corner + 1) % 3]);
        for (const candidate of neighbours.get(key) ?? []) {
          if (regionOf[candidate] >= 0 || normals[candidate].area === 0) continue;
          if (dot(normals[candidate].normal, planeNormal) < cosLimit) continue;
          const corners = triangles[candidate];
          const fits = corners.every((vertex) => Math.abs(dot(planeNormal, points[vertex]) - planeOffset) <= flatness);
          if (!fits) continue;
          regionOf[candidate] = regions.length;
          region.push(candidate);
        }
      }
    }
    regions.push(region);
  }
  return { regions, regionOf };
}

/** Die ausgeglichene Ebene eines Bereichs: Normale nach Flaechen gewichtet, durch den Schwerpunkt. */
function fitPlane(points: Vec[], triangles: Array<[number, number, number]>, normals: Array<{ normal: Vec; area: number }>, region: number[]) {
  let nx = 0;
  let ny = 0;
  let nz = 0;
  let cx = 0;
  let cy = 0;
  let cz = 0;
  let weight = 0;
  region.forEach((id) => {
    const { normal, area } = normals[id];
    nx += normal[0] * area;
    ny += normal[1] * area;
    nz += normal[2] * area;
    triangles[id].forEach((vertex) => {
      cx += points[vertex][0] * area;
      cy += points[vertex][1] * area;
      cz += points[vertex][2] * area;
    });
    weight += area * 3;
  });
  const size = Math.hypot(nx, ny, nz);
  if (size < 1e-20 || weight === 0) return null;
  const normal: Vec = [nx / size, ny / size, nz / size];
  const centroid: Vec = [cx / weight, cy / weight, cz / weight];
  return { normal, offset: dot(normal, centroid) };
}

/**
 * Eine Ecke genau auf den Schnitt ihrer Ebenen setzen.
 *
 * Darum geht es bei dieser Datei. Ein Punkt, an dem drei flache Flaechen
 * zusammenkommen, hat genau eine richtige Lage: den Schnittpunkt der drei
 * Ebenen. Liegt er daneben - und sei es nur um ein Zehnmillionstel -, dann
 * liegt der Rand jeder der drei Flaechen nicht ganz auf ihr, und der Kern
 * lehnt die Verrundung ab.
 *
 * Drei Ebenen: ein Gleichungssystem. Zwei: die Schnittgerade, und darauf der
 * Punkt, der dem alten am naechsten liegt. Eine: der Fusspunkt auf ihr. Mehr
 * als drei Ebenen (die Spitze einer Pyramide) haben im Allgemeinen keinen
 * gemeinsamen Punkt; dann werden die drei genommen, die am steilsten
 * zueinander stehen, und die Abweichung der uebrigen wird gemessen.
 */
function snapCorner(point: Vec, planes: Array<{ normal: Vec; offset: number }>) {
  if (planes.length === 0) return { point, residual: 0 };

  // Fast gleich gerichtete Ebenen zaehlen einmal - sonst waere das System entartet.
  const distinct: Array<{ normal: Vec; offset: number }> = [];
  planes.forEach((plane) => {
    if (distinct.some((kept) => dot(kept.normal, plane.normal) > 0.999999)) return;
    distinct.push(plane);
  });

  if (distinct.length === 1) {
    const [plane] = distinct;
    const distance = dot(plane.normal, point) - plane.offset;
    return {
      point: [point[0] - plane.normal[0] * distance, point[1] - plane.normal[1] * distance, point[2] - plane.normal[2] * distance] as Vec,
      residual: 0,
    };
  }

  if (distinct.length === 2) {
    const [first, second] = distinct;
    const direction = cross(first.normal, second.normal);
    const size = length(direction);
    if (size < 1e-9) {
      return snapCorner(point, [first]);
    }
    const unit: Vec = [direction[0] / size, direction[1] / size, direction[2] / size];
    // Ein Punkt auf der Geraden, dann entlang der Geraden zum naechsten am alten Punkt.
    const base = solveThreePlanes(first, second, { normal: unit, offset: dot(unit, point) });
    if (!base) return snapCorner(point, [first]);
    return { point: base, residual: 0 };
  }

  // Drei Ebenen, die am steilsten zueinander stehen.
  let best: { planes: [number, number, number]; scale: number } | null = null;
  for (let a = 0; a < distinct.length; a += 1) {
    for (let b = a + 1; b < distinct.length; b += 1) {
      for (let c = b + 1; c < distinct.length; c += 1) {
        const scale = Math.abs(dot(distinct[a].normal, cross(distinct[b].normal, distinct[c].normal)));
        if (!best || scale > best.scale) best = { planes: [a, b, c], scale };
      }
    }
  }
  if (!best || best.scale < 1e-6) {
    return snapCorner(point, [distinct[0], distinct[1]]);
  }
  const [a, b, c] = best.planes;
  const solved = solveThreePlanes(distinct[a], distinct[b], distinct[c]);
  if (!solved) return snapCorner(point, [distinct[a], distinct[b]]);
  const residual = distinct.reduce(
    (worst, plane) => Math.max(worst, Math.abs(dot(plane.normal, solved) - plane.offset)),
    0,
  );
  return { point: solved, residual };
}

/** Der Schnittpunkt dreier Ebenen, nach Cramer. */
function solveThreePlanes(
  first: { normal: Vec; offset: number },
  second: { normal: Vec; offset: number },
  third: { normal: Vec; offset: number },
): Vec | null {
  const bc = cross(second.normal, third.normal);
  const determinant = dot(first.normal, bc);
  if (Math.abs(determinant) < 1e-12) return null;
  const ca = cross(third.normal, first.normal);
  const ab = cross(first.normal, second.normal);
  return [
    (first.offset * bc[0] + second.offset * ca[0] + third.offset * ab[0]) / determinant,
    (first.offset * bc[1] + second.offset * ca[1] + third.offset * ab[1]) / determinant,
    (first.offset * bc[2] + second.offset * ca[2] + third.offset * ab[2]) / determinant,
  ];
}

/**
 * Der Rand eines Bereichs: die Kanten, die in ihm nur einmal vorkommen. Die
 * Richtung behalten sie aus ihrem Dreieck, darum laufen die Ringe von sich aus
 * rund herum - gegen den Uhrzeigersinn um die Normale.
 */
function boundaryLoops(triangles: Array<[number, number, number]>, region: number[]) {
  const used = new Map<string, number>();
  const directed: Array<[number, number]> = [];
  region.forEach((id) => {
    const triangle = triangles[id];
    for (let corner = 0; corner < 3; corner += 1) {
      const from = triangle[corner];
      const to = triangle[(corner + 1) % 3];
      const key = edgeKey(from, to);
      used.set(key, (used.get(key) ?? 0) + 1);
      directed.push([from, to]);
    }
  });
  const outgoing = new Map<number, number[]>();
  const incoming = new Map<number, number>();
  directed.forEach(([from, to]) => {
    if ((used.get(edgeKey(from, to)) ?? 0) !== 1) return;
    const list = outgoing.get(from);
    if (list) list.push(to);
    else outgoing.set(from, [to]);
    incoming.set(to, (incoming.get(to) ?? 0) + 1);
  });

  /*
   * Jeder Randpunkt hat genau eine Kante hinein und eine heraus. Hat er mehr,
   * ist der Bereich an dieser Stelle eingeschnuert - zwei Teile, die sich nur
   * in einem Punkt beruehren -, und welcher Ring dort weiterlaeuft, ist nicht
   * bestimmt. Dann lieber den anderen Weg als ein erfundener Rand.
   *
   * Ein Punkt mitten auf der Kante des Nachbarn - eine T-Stelle - kann hier
   * nicht hereinkommen: Ohne gemeinsame Kante sind zwei Dreiecke keine
   * Nachbarn, also landen sie in verschiedenen Bereichen. Das kostet
   * Flaechen (gemessen am Verschneiden mit three-bvh-csg, das solche Netze
   * liefert: 77 Flaechen statt 30 an einem gebohrten Kasten), erfindet aber
   * nichts.
   */
  for (const [from, targets] of outgoing) {
    if (targets.length !== 1 || (incoming.get(from) ?? 0) !== 1) return null;
  }

  const loops: number[][] = [];
  const remaining = new Map([...outgoing].map(([from, targets]) => [from, [...targets]]));
  for (const [start] of outgoing) {
    while ((remaining.get(start)?.length ?? 0) > 0) {
      const loop: number[] = [start];
      let current = start;
      for (;;) {
        const targets = remaining.get(current);
        const next = targets?.pop();
        if (next === undefined) return null; // Ein offener Rand - dieses Netz passt nicht hierher.
        if (next === start) break;
        if (loop.includes(next)) return null; // Eine Acht, kein Ring.
        loop.push(next);
        current = next;
      }
      if (loop.length >= 3) loops.push(loop);
    }
  }
  return loops.length > 0 ? loops : null;
}

/**
 * Die Punkte wegnehmen, die mitten auf einer Gerade liegen. Sie stammen aus
 * der Vernetzung: Eine gerade Kante eines Kastens traegt dort jeden Punkt, an
 * dem auf der Nachbarflaeche ein Dreieck endet. Ohne diesen Schritt hat eine
 * Wand 53 Kanten statt 4 - und eine Verrundung muesste 53 Stuecke treffen.
 */
function dropStraightPoints(loop: Vec[], straightness: number) {
  if (loop.length <= 3) return loop;
  let kept = loop;
  for (let pass = 0; pass < 2; pass += 1) {
    const next: Vec[] = [];
    for (let index = 0; index < kept.length; index += 1) {
      const previous = next.length > 0 ? next[next.length - 1] : kept[(index - 1 + kept.length) % kept.length];
      const point = kept[index];
      const following = kept[(index + 1) % kept.length];
      const along = subtract(following, previous);
      const size = length(along);
      if (size < 1e-12) continue;
      const offset = cross(along, subtract(point, previous));
      if (length(offset) / size <= straightness && next.length + (kept.length - index - 1) >= 3) continue;
      next.push(point);
    }
    if (next.length === kept.length) return kept;
    if (next.length < 3) return kept;
    kept = next;
  }
  return kept;
}

/** Der Flaecheninhalt eines Rings, in der Ebene gemessen, mit Vorzeichen zur Normale. */
function loopArea(loop: Vec[], normal: Vec) {
  let x = 0;
  let y = 0;
  let z = 0;
  for (let index = 0; index < loop.length; index += 1) {
    const current = loop[index];
    const next = loop[(index + 1) % loop.length];
    const product = cross(current, next);
    x += product[0];
    y += product[1];
    z += product[2];
  }
  return dot([x / 2, y / 2, z / 2], normal);
}

const flat = (loop: Vec[]): number[] => loop.flatMap((point) => [point[0], point[1], point[2]]);

/**
 * Die flachen Flaechen eines Netzes - oder `null`, wenn dieses Netz dafuer
 * nicht taugt: ein offener Rand, ein gewachsenes Netz ohne flache Stellen,
 * eine Ecke, deren Ebenen sich nicht in einem Punkt treffen.
 *
 * `null` ist kein Fehler, sondern die Aussage "nimm den anderen Weg". Der
 * Aufrufer hat ihn: den Umweg ueber STL, der jedes Netz nimmt.
 */
export function planarMeshFaces(
  positions: ArrayLike<number>,
  indices: ArrayLike<number>,
  options: PlanarMeshFacesOptions = {},
): PlanarMeshFaces | null {
  const flatness = options.flatness ?? DEFAULT_FLATNESS;
  const straightness = options.straightness ?? DEFAULT_STRAIGHTNESS;
  const maxRegions = options.maxRegions ?? DEFAULT_MAX_REGIONS;
  const cosLimit = Math.cos(((options.flatAngle ?? DEFAULT_FLAT_ANGLE) * Math.PI) / 180);

  if (indices.length > (options.maxTriangles ?? DEFAULT_MAX_TRIANGLES) * 3) return null;

  const { points, triangles } = weldVertices(positions, indices);
  if (triangles.length < 4) return null;

  const normals = triangles.map((triangle) => triangleNormal(points, triangle));
  const { regions, regionOf } = growRegions(points, triangles, normals, flatness, cosLimit);
  if (regions.length > maxRegions) return null;
  /*
   * Und die eigentliche Frage: Hat das Zusammenlegen etwas gebracht? Ein
   * gewachsenes Netz hat fast so viele Bereiche wie Dreiecke, und daraus
   * Einzelflaechen zu bauen waere langsamer und nicht besser als der STL-Weg.
   * Ein Netz aus Vierecken - der Mantel eines Zylinders - kommt auf genau die
   * Haelfte; das soll durch.
   */
  if (regions.length > triangles.length * (options.maxRegionShare ?? DEFAULT_MAX_REGION_SHARE)) return null;

  const planes = regions.map((region) => fitPlane(points, triangles, normals, region));
  if (planes.some((plane) => plane === null)) return null;

  // Jeder Punkt kennt die Ebenen, die ihn benutzen - daraus wird seine Ecke.
  const planesByVertex = new Map<number, Array<{ normal: Vec; offset: number }>>();
  triangles.forEach((triangle, id) => {
    const plane = planes[regionOf[id]];
    if (!plane) return;
    triangle.forEach((vertex) => {
      const list = planesByVertex.get(vertex);
      if (list) list.push(plane);
      else planesByVertex.set(vertex, [plane]);
    });
  });

  let snapped = 0;
  const corners = new Map<number, Vec>();
  for (const [vertex, list] of planesByVertex) {
    const { point, residual } = snapCorner(points[vertex], list);
    // Eine Ecke, deren Ebenen sich nicht treffen, waere ein stiller Verzug.
    if (residual > flatness) return null;
    const moved = length(subtract(point, points[vertex]));
    if (moved > flatness) return null;
    snapped = Math.max(snapped, moved);
    corners.set(vertex, point);
  }

  const faces: PlanarMeshFace[] = [];
  for (let index = 0; index < regions.length; index += 1) {
    const plane = planes[index];
    if (!plane) return null;
    const loops = boundaryLoops(triangles, regions[index]);
    if (!loops) return null;
    const rings = loops
      .map((loop) => dropStraightPoints(loop.map((vertex) => corners.get(vertex) ?? points[vertex]), straightness))
      .filter((loop) => loop.length >= 3)
      .map((loop) => ({ loop, area: loopArea(loop, plane.normal) }));
    if (rings.length === 0) return null;
    rings.sort((a, b) => Math.abs(b.area) - Math.abs(a.area));
    const [outer, ...rest] = rings;
    faces.push({
      normal: plane.normal,
      outline: flat(outer.loop),
      holes: rest.map((ring) => flat(ring.loop)),
    });
  }

  return { faces, triangles: triangles.length, snapped };
}
