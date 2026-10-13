import type { OcctKernel, ShapeHandle } from "occt-wasm";
import { planarMeshFaces, type PlanarLoop, type PlanarMeshFacesOptions } from "@/lib/meshPlanarFaces";

/**
 * cadPlanarSolid.ts
 *
 * Aus den flachen Flaechen eines Netzes (siehe `meshPlanarFaces.ts`) einen
 * Koerper im Kern bauen: je Bereich eine Flaeche mit geraden Kanten, dann
 * zusammennaehen.
 *
 * Der Weg daneben - das Netz als STL in den Kern geben - bleibt und nimmt
 * jedes Netz. Dieser hier ist der bessere, wo er geht: Was aus ihm kommt, hat
 * so viele Flaechen und Kanten, wie der Koerper Seiten und Kanten hat, und
 * darauf laeuft eine Verrundung. Gemessen an der schraeg abgeschnittenen
 * Haelfte eines gebohrten Kastens: ueber STL 103 Flaechen, 207 Kanten und
 * **keine** Verrundung, auch nicht auf einer einzelnen Kante; hierueber 102
 * Flaechen, 300 Kanten und eine Verrundung von 0,5 mm auf allen 204 scharfen.
 *
 * Und die Kante, auf die es ankommt: die vier Kanten des Schnitts, die Fuge,
 * die man entgratet oder verklebt. Ueber STL nimmt keine von ihnen eine
 * Verrundung an, auch nicht 0,3 mm; hierueber nehmen sie 0,3, 0,5 und 1 mm.
 *
 * Geht er nicht, gibt er `null` zurueck und sagt damit "nimm den anderen Weg".
 * Das kostet wenig: Das Zusammenlegen braucht fuer die geteilte Haelfte 8 ms,
 * und eine Kugel, fuer die es nichts bringt, laesst es nach 14 ms (2048
 * Dreiecke) bzw. 105 ms (32768) wieder liegen.
 */

/** Wie weit der genaue Koerper vom Rauminhalt des Netzes abweichen darf. */
const VOLUME_TOLERANCE = 0.002;

function wireFromLoop(cad: OcctKernel, loop: PlanarLoop) {
  const count = loop.length / 3;
  const point = (index: number) => ({
    x: loop[(index % count) * 3],
    y: loop[(index % count) * 3 + 1],
    z: loop[(index % count) * 3 + 2],
  });
  const edges: ShapeHandle[] = [];
  for (let index = 0; index < count; index += 1) {
    edges.push(cad.makeLineEdge(point(index), point(index + 1)));
  }
  return cad.makeWire(edges);
}

/** Der Rauminhalt des Netzes selbst - das Mass, an dem der Koerper gemessen wird. */
export function meshSignedVolume(positions: ArrayLike<number>, indices: ArrayLike<number>) {
  let total = 0;
  for (let offset = 0; offset + 2 < indices.length; offset += 3) {
    const a = indices[offset] * 3;
    const b = indices[offset + 1] * 3;
    const c = indices[offset + 2] * 3;
    const ax = positions[a], ay = positions[a + 1], az = positions[a + 2];
    const bx = positions[b], by = positions[b + 1], bz = positions[b + 2];
    const cx = positions[c], cy = positions[c + 1], cz = positions[c + 2];
    total += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  }
  return total;
}

export type PlanarMeshSolid = {
  solid: ShapeHandle;
  faces: number;
  /** Wie weit die Ecken beim Einrasten gewandert sind, groesster Wert in mm. */
  snapped: number;
};

/**
 * Der genaue Koerper zu einem Netz aus flachen Flaechen - oder `null`.
 *
 * `null` heisst immer dasselbe: Dieses Netz taugt nicht fuer diesen Weg. Das
 * ist kein Fehler, sondern die Weiche zum STL-Weg. Geprueft wird am Ende der
 * Rauminhalt gegen den des Netzes; weicht er ab, war irgendwo ein Ring falsch
 * herum oder ein Loch keines, und auch dann ist `null` die Antwort - ein
 * stiller Verzug waere das Schlimmste von allem.
 */
export function buildPlanarMeshSolid(
  cad: OcctKernel,
  positions: ArrayLike<number>,
  indices: ArrayLike<number>,
  options: PlanarMeshFacesOptions = {},
): PlanarMeshSolid | null {
  const planar = planarMeshFaces(positions, indices, options);
  if (!planar) return null;

  let faces: ShapeHandle[];
  try {
    faces = planar.faces.map((face) => {
      const plane = cad.makeFace(wireFromLoop(cad, face.outline));
      if (face.holes.length === 0) return plane;
      return cad.addHolesInFace(plane, face.holes.map((hole) => wireFromLoop(cad, hole)));
    });
  } catch {
    return null;
  }

  const target = Math.abs(meshSignedVolume(positions, indices));
  for (const tolerance of [1e-6, 1e-5, 1e-4]) {
    try {
      let candidate = cad.sewAndSolidify(faces, tolerance);
      candidate = cad.fixShape(candidate);
      if (!cad.isSolid(candidate)) continue;
      candidate = cad.healSolid(candidate, tolerance);
      candidate = cad.fixFaceOrientations(candidate);
      candidate = cad.removeDegenerateEdges(candidate);
      candidate = cad.unifySameDomain(candidate);
      if (!cad.isSolid(candidate) || !cad.isValid(candidate)) continue;
      const volume = Math.abs(cad.getVolume(candidate));
      if (target > 0 && Math.abs(volume - target) > target * VOLUME_TOLERANCE) continue;
      return { solid: candidate, faces: cad.getSubShapes(candidate, "face").length, snapped: planar.snapped };
    } catch {
      // Die naechste Toleranz probieren, danach den anderen Weg.
    }
  }
  return null;
}
