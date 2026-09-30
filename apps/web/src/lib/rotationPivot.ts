/**
 * Der Punkt, um den gedreht wird.
 *
 * Normalerweise dreht ein Koerper um seine eigene Mitte. Das ist falsch,
 * sobald es auf eine bestimmte Stelle ankommt: Ein Rohrbogen, der aus der
 * Ebene gekippt wird, soll sein Ende dort behalten, wo es war - also muss er
 * um die Mitte dieses Endes drehen, nicht um seine Koerpermitte.
 *
 * Nach Layerling 1.18.4. Die Rechnung, die den Koerper danach richtig stellt,
 * gab es bei uns schon: `rotatedGeometryShapePatch` nimmt einen Drehpunkt und
 * setzt die Mitte auf `Drehpunkt + Drehung * (Mitte - Drehpunkt)`.
 */

export type PivotPoint = { x: number; y: number; z: number };

/**
 * Die Mitte der ebenen Flaeche, auf die geklickt wurde.
 *
 * `positions` sind Dreiecke in Weltkoordinaten, neun Zahlen je Dreieck, und
 * `hitTriangle` ist das getroffene. Zur Flaeche gehoert jedes Dreieck, das in
 * derselben Ebene liegt **und** ueber gemeinsame Ecken mit dem getroffenen
 * zusammenhaengt; zurueck kommt die nach Flaeche gewichtete Mitte.
 *
 * Auf dem runden Ende eines Rohrs ist das die Rohrachse. Der Zusammenhang ist
 * dabei nicht zu entbehren: Bei einem U-Bogen liegen **beide** Enden in einer
 * Ebene, und ihr Mittel laege in der Luft zwischen den Rohren.
 *
 * Auf einer gewoelbten Flaeche gehoert nur die eine Facette dazu, es kommt
 * also schlicht ein Punkt neben dem Klick heraus. `null`, wenn das getroffene
 * Dreieck entartet ist.
 */
export function planarFaceCentroid(positions: ArrayLike<number>, hitTriangle: number): PivotPoint | null {
  return planarFace(positions, hitTriangle)?.centre ?? null;
}

/**
 * Dieselbe Flaeche, samt ihrer Richtung.
 *
 * Die Normale ist die des getroffenen Dreiecks, und weil zur Flaeche nur
 * zaehlt, was in derselben Ebene liegt, ist sie die Normale der ganzen
 * Flaeche. Sie zeigt nach aussen, denn so liegen die Dreiecke im Netz.
 *
 * Gebraucht wird sie zum Flachlegen: Der Koerper dreht sich so, dass diese
 * Richtung nach unten zeigt.
 */
export function planarFace(positions: ArrayLike<number>, hitTriangle: number): { centre: PivotPoint; normal: PivotPoint } | null {
  const triangleCount = Math.floor(positions.length / 9);
  if (hitTriangle < 0 || hitTriangle >= triangleCount) return null;

  const normals = new Float64Array(triangleCount * 3);
  const areas = new Float64Array(triangleCount);
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const at = triangle * 9;
    const ux = positions[at + 3] - positions[at];
    const uy = positions[at + 4] - positions[at + 1];
    const uz = positions[at + 5] - positions[at + 2];
    const vx = positions[at + 6] - positions[at];
    const vy = positions[at + 7] - positions[at + 1];
    const vz = positions[at + 8] - positions[at + 2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const length = Math.hypot(nx, ny, nz);
    areas[triangle] = length / 2;
    if (length > 0) {
      normals[triangle * 3] = nx / length;
      normals[triangle * 3 + 1] = ny / length;
      normals[triangle * 3 + 2] = nz / length;
    }
    for (let corner = 0; corner < 9; corner += 3) {
      minX = Math.min(minX, positions[at + corner]);
      maxX = Math.max(maxX, positions[at + corner]);
      minY = Math.min(minY, positions[at + corner + 1]);
      maxY = Math.max(maxY, positions[at + corner + 1]);
      minZ = Math.min(minZ, positions[at + corner + 2]);
      maxZ = Math.max(maxZ, positions[at + corner + 2]);
    }
  }
  if (!(areas[hitTriangle] > 0)) return null;

  const extent = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1);
  const planeTolerance = extent * 1e-5;
  // Ecken, die naeher beieinander liegen, gelten als eine: Das Netz haelt
  // seine Punkte in einfacher Genauigkeit, und eine Naht liegt dann ein
  // Rundungsfehler auseinander.
  const weld = extent * 1e-6;
  const hx = normals[hitTriangle * 3];
  const hy = normals[hitTriangle * 3 + 1];
  const hz = normals[hitTriangle * 3 + 2];
  const hitOffset = hx * positions[hitTriangle * 9] + hy * positions[hitTriangle * 9 + 1] + hz * positions[hitTriangle * 9 + 2];

  /*
   * Gleiche Richtung **und** gleicher Abstand zur Ebene. Die Abstandspruefung
   * ist dabei ein Guertel zum Hosentraeger: Wer eine Ecke mit dem getroffenen
   * Dreieck teilt, liegt dadurch schon in seiner Ebene. Erreichen liesse sie
   * sich nur, wenn zwei Ecken ueber die Schweisstoleranz zusammenfielen, ihre
   * Ebenen aber weiter auseinanderlaegen als die Ebenentoleranz - und die ist
   * zehnmal groesser. Sie bleibt stehen, damit die Flaeche auch dann haelt,
   * wenn die Suche einmal anders laeuft als ueber gemeinsame Ecken; ein Test
   * dafuer gibt es nicht, weil es keinen gibt, der sie treffen koennte.
   */
  const coplanar = (triangle: number) => {
    if (!(areas[triangle] > 0)) return false;
    const facing = normals[triangle * 3] * hx + normals[triangle * 3 + 1] * hy + normals[triangle * 3 + 2] * hz;
    if (facing < 0.9999) return false;
    const at = triangle * 9;
    for (let corner = 0; corner < 9; corner += 3) {
      const distance = hx * positions[at + corner] + hy * positions[at + corner + 1] + hz * positions[at + corner + 2] - hitOffset;
      if (Math.abs(distance) > planeTolerance) return false;
    }
    return true;
  };

  const cornerKey = (triangle: number, corner: number) => {
    const at = triangle * 9 + corner * 3;
    return `${Math.round(positions[at] / weld)},${Math.round(positions[at + 1] / weld)},${Math.round(positions[at + 2] / weld)}`;
  };

  const trianglesAtCorner = new Map<string, number[]>();
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    if (!coplanar(triangle)) continue;
    for (let corner = 0; corner < 3; corner += 1) {
      const key = cornerKey(triangle, corner);
      const list = trianglesAtCorner.get(key);
      if (list) list.push(triangle);
      else trianglesAtCorner.set(key, [triangle]);
    }
  }

  const visited = new Set<number>([hitTriangle]);
  const queue = [hitTriangle];
  let weight = 0;
  let cx = 0;
  let cy = 0;
  let cz = 0;
  while (queue.length > 0) {
    const triangle = queue.pop() as number;
    const at = triangle * 9;
    const area = areas[triangle];
    weight += area;
    cx += (area * (positions[at] + positions[at + 3] + positions[at + 6])) / 3;
    cy += (area * (positions[at + 1] + positions[at + 4] + positions[at + 7])) / 3;
    cz += (area * (positions[at + 2] + positions[at + 5] + positions[at + 8])) / 3;
    for (let corner = 0; corner < 3; corner += 1) {
      trianglesAtCorner.get(cornerKey(triangle, corner))?.forEach((neighbour) => {
        if (!visited.has(neighbour)) {
          visited.add(neighbour);
          queue.push(neighbour);
        }
      });
    }
  }

  return {
    centre: { x: cx / weight, y: cy / weight, z: cz / weight },
    normal: { x: hx, y: hy, z: hz },
  };
}
