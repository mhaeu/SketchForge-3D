/**
 * meshVolume.ts
 *
 * Wie viel Raum ein geschlossenes Netz umschliesst - gleichgueltig, wie seine
 * Dreiecke gewickelt sind.
 *
 * Das ist noetig, weil unsere Anzeigenetze nicht einheitlich gewickelt sind:
 * Bei der Mondsichel laufen die Deckel anders herum als die Waende. Eine
 * Summe der vorzeichenbehafteten Dreiecksvolumen gaebe dort Unsinn. Darum
 * werden die Dreiecke erst mit ihren Nachbarn in Einklang gebracht (ueber die
 * geteilten Kanten, Eckpunkte nach Lage zusammengefasst) und dann jedes
 * zusammenhaengende Stueck so gedreht, dass es einen positiven Raum
 * umschliesst.
 *
 * Grenze: Zusammenhaengende Stuecke werden einzeln genommen und ihre Betraege
 * addiert. Ein Hohlkoerper mit *getrennter* Innenhaut (rundum zu, kein
 * Durchgang) kommt darum zu gross heraus - gezaehlt wird dann Aussen- plus
 * Innenraum statt der Differenz. Ein ausgehoehlter Koerper mit Oeffnung haengt
 * ueber den Rand zusammen und stimmt.
 *
 * Aus Layerling uebernommen (cadProfileExtrusion.ts).
 */

export type MeshVolumeVertex = readonly [number, number, number];
export type MeshVolumeFace = readonly [number, number, number];

/**
 * Welche Richtung jedes Dreieck eines geschlossenen Netzes braucht, um nach
 * aussen zu zeigen.
 *
 * `flip[i]` ist -1, wo Dreieck i so, wie es gespeichert ist, nach innen zeigt,
 * und `pieceVolume` haelt den Raum jedes zusammenhaengenden Stuecks.
 */
export function closedMeshFaceOrientation(
  vertices: ReadonlyArray<MeshVolumeVertex>,
  faces: ReadonlyArray<MeshVolumeFace>,
) {
  let extent = 0;
  vertices.forEach(([x, y, z]) => {
    extent = Math.max(extent, Math.abs(x), Math.abs(y), Math.abs(z));
  });
  // Das Raster haengt an der Ausdehnung: Ein grosses Teil darf groeber
  // zusammengefasst werden als ein kleines, sonst finden zwei Ecken, die
  // dieselbe sein sollen, nicht zueinander.
  const quantum = Math.max(1e-9, extent * 1e-7);
  const welded = new Map<string, number>();
  const ids = vertices.map(([x, y, z]) => {
    const key = `${Math.round(x / quantum)},${Math.round(y / quantum)},${Math.round(z / quantum)}`;
    let id = welded.get(key);
    if (id === undefined) {
      id = welded.size;
      welded.set(key, id);
    }
    return id;
  });
  const edgeFaces = new Map<string, number[]>();
  const edgeKey = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);
  faces.forEach((face, index) => {
    for (let corner = 0; corner < 3; corner += 1) {
      const key = edgeKey(ids[face[corner]], ids[face[(corner + 1) % 3]]);
      const list = edgeFaces.get(key);
      if (list) list.push(index);
      else edgeFaces.set(key, [index]);
    }
  });
  /** +1, wenn das Dreieck eine seiner Kanten a -> b laeuft, -1 bei b -> a, 0 ohne solche Kante. */
  const runs = (faceIndex: number, a: number, b: number) => {
    const face = faces[faceIndex];
    for (let corner = 0; corner < 3; corner += 1) {
      const from = ids[face[corner]];
      const to = ids[face[(corner + 1) % 3]];
      if (from === a && to === b) return 1;
      if (from === b && to === a) return -1;
    }
    return 0;
  };
  const signedVolume = (faceIndex: number) => {
    const [ax, ay, az] = vertices[faces[faceIndex][0]];
    const [bx, by, bz] = vertices[faces[faceIndex][1]];
    const [cx, cy, cz] = vertices[faces[faceIndex][2]];
    return (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  };
  const orientation = new Array<number>(faces.length).fill(0);
  const pieceOf = new Array<number>(faces.length).fill(-1);
  const pieceVolume: number[] = [];
  for (let seed = 0; seed < faces.length; seed += 1) {
    if (orientation[seed] !== 0) continue;
    const pieceIndex = pieceVolume.length;
    orientation[seed] = 1;
    pieceOf[seed] = pieceIndex;
    const queue = [seed];
    let piece = 0;
    while (queue.length) {
      const current = queue.pop() as number;
      piece += orientation[current] * signedVolume(current);
      const face = faces[current];
      for (let corner = 0; corner < 3; corner += 1) {
        const a = ids[face[corner]];
        const b = ids[face[(corner + 1) % 3]];
        if (a === b) continue;
        (edgeFaces.get(edgeKey(a, b)) ?? []).forEach((neighbour) => {
          if (orientation[neighbour] !== 0) return;
          // Einige Nachbarn laufen ihre geteilte Kante in die Gegenrichtung.
          const direction = runs(neighbour, a, b);
          if (direction === 0) return;
          orientation[neighbour] = -direction * orientation[current];
          pieceOf[neighbour] = pieceIndex;
          queue.push(neighbour);
        });
      }
    }
    pieceVolume.push(piece);
  }
  const flip = orientation.map((value, index) => (pieceVolume[pieceOf[index]] < 0 ? -value : value));
  return { flip, pieceVolume: pieceVolume.map(Math.abs) };
}

/** Der Raum, den ein geschlossenes Netz umschliesst, in Kubikmillimetern. */
export function closedMeshVolume(
  vertices: ReadonlyArray<MeshVolumeVertex>,
  faces: ReadonlyArray<MeshVolumeFace>,
) {
  return closedMeshFaceOrientation(vertices, faces).pieceVolume.reduce((sum, volume) => sum + volume, 0);
}
