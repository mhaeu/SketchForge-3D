/**
 * cadFacePick.ts
 *
 * Ganze CAD-Flaechen anklicken, fuer "Flaeche loeschen": Jedes Dreieck des
 * vorbereiteten Koerpers weiss, aus welcher Flaeche es stammt. Ein Klick auf
 * ein Dreieck waehlt die Flaeche, und eine gewoelbte Flaeche leuchtet als ein
 * Stueck auf. Nach layerling 1.86.0 (#451).
 */

/** Was die Ansicht zum Waehlen braucht: das Netz in der Szene, die Flaeche je Dreieck, die gewaehlten Flaechen. */
export type CadFacePick = {
  shapeId: string;
  positions: Float32Array;
  indices: Uint32Array;
  triangleFaces: Int32Array;
  selectedFaceIds: number[];
};

/**
 * Die Flaechennummer jedes Dreiecks. Die Flaechengruppen des Kerns sind
 * Dreiergruppen [Anfang, Anzahl, Hash], Anfang und Anzahl in Indexeintraegen
 * (drei je Dreieck), und nicht in der Reihenfolge der Flaechenliste: Eine
 * Flaeche wird an ihrem Hash erkannt. Flaechen mit gleichem Hash werden der
 * Liste nach vergeben, der eigene Platz der Gruppe zuerst. Ein Dreieck ohne
 * bekannte Flaeche bekommt -1. `offset` zaehlt die Flaechen davor mit, wenn
 * mehrere Koerper hintereinander stehen.
 */
export function cadTriangleFaces(groups: ArrayLike<number>, faceHashes: number[], triangleCount: number, offset = 0) {
  const triangleFaces = new Int32Array(triangleCount).fill(-1);
  const taken = new Set<number>();
  for (let group = 0; group * 3 < groups.length; group += 1) {
    const start = groups[group * 3];
    const count = groups[group * 3 + 1];
    const hash = groups[group * 3 + 2];
    const face = faceHashes[group] === hash && !taken.has(group)
      ? group
      : faceHashes.findIndex((other, id) => other === hash && !taken.has(id));
    if (face < 0) continue;
    taken.add(face);
    const first = Math.floor(start / 3);
    const end = Math.min(triangleCount, first + Math.floor(count / 3));
    triangleFaces.fill(face + offset, first, end);
  }
  return triangleFaces;
}

/** Die Ecken aller Dreiecke der genannten Flaechen, drei je Dreieck, fuer ein Hervorhebungsnetz ohne Index. */
export function cadFaceHighlightPositions(positions: ArrayLike<number>, indices: ArrayLike<number>, triangleFaces: ArrayLike<number>, faceIds: readonly number[]) {
  const wanted = new Set(faceIds);
  const triangles: number[] = [];
  for (let triangle = 0; triangle < triangleFaces.length; triangle += 1) {
    if (wanted.has(triangleFaces[triangle])) triangles.push(triangle);
  }
  const corners = new Float32Array(triangles.length * 9);
  triangles.forEach((triangle, slot) => {
    for (let corner = 0; corner < 3; corner += 1) {
      const vertex = indices[triangle * 3 + corner];
      corners.set([positions[vertex * 3], positions[vertex * 3 + 1], positions[vertex * 3 + 2]], slot * 9 + corner * 3);
    }
  });
  return corners;
}

/** Eine Flaeche dazu oder, wenn sie schon gewaehlt ist, wieder heraus. */
export function toggleCadFace(selected: readonly number[], faceId: number) {
  return selected.includes(faceId) ? selected.filter((id) => id !== faceId) : [...selected, faceId].sort((a, b) => a - b);
}
