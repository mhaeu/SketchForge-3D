import { weldOnGrid } from "@/lib/gridWeld";

/**
 * meshPartCount.ts
 *
 * Aus wie vielen getrennten Teilen ein Netz besteht: Dreiecke mit einer
 * gemeinsamen Ecke gehoeren zu einem Teil, und zwei Ecken zaehlen als eine,
 * wenn sie auf denselben Punkt eines Gitters mit Abstand `tolerance` fallen.
 * Dieselbe Zahl, die "Teile trennen" ergibt (meshFaceComponents im Editor),
 * nur ohne Textschluessel je Ecke: Der Editor fragt sie bei jeder Auswahl, um
 * den Knopf freizugeben, und bei einer Kugel aus 141.512 Dreiecken kostete
 * das im Editor gemessen 528 ms. Aus layerling 1.105.0.
 */
export function meshPartCount(mesh: { vertices: ReadonlyArray<ArrayLike<number>>; faces: ReadonlyArray<ArrayLike<number>> }, tolerance: number): number {
  const { faces, vertices } = mesh;
  if (faces.length === 0) return 0;
  const { ids, count: cornerCount } = weldOnGrid(vertices, tolerance);

  // Dreiecke mit gemeinsamer Ecke werden verbunden (Union-Find mit Pfadhalbierung).
  const parent = new Int32Array(cornerCount);
  for (let corner = 0; corner < cornerCount; corner += 1) parent[corner] = corner;
  const find = (start: number) => {
    let current = start;
    while (parent[current] !== current) {
      parent[current] = parent[parent[current]];
      current = parent[current];
    }
    return current;
  };
  for (let index = 0; index < faces.length; index += 1) {
    const face = faces[index];
    const a = find(ids[face[0]]);
    const b = find(ids[face[1]]);
    if (a !== b) parent[b] = a;
    const c = find(ids[face[2]]);
    if (c !== a) parent[c] = a;
  }

  let count = 0;
  const counted = new Uint8Array(cornerCount);
  for (let index = 0; index < faces.length; index += 1) {
    const root = find(ids[faces[index][0]]);
    if (!counted[root]) {
      counted[root] = 1;
      count += 1;
    }
  }
  return count;
}
