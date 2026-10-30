import type { OcctKernel, ShapeHandle } from "occt-wasm";
import { cadTriangleFaces } from "@/lib/cadFacePick";
import { isCadModifierWasmMemoryFault } from "@/lib/cadModifierRuntime";

/**
 * cadDeleteFaces.ts
 *
 * Flaechen eines genauen Koerpers loeschen: Die Flaechen rundherum wachsen,
 * bis die Luecke zu ist. So kommt eine Verrundung, eine Bohrung oder ein
 * Zapfen wieder weg, auch an einem eingelesenen STEP-Teil. Steht ausserhalb
 * des Arbeiters, damit die e2e-Tests es gegen den echten Kern pruefen.
 *
 * Nach layerling 1.86.0 (#451).
 */

/** Wenn die Flaechen rundherum die Luecke nicht schliessen. Der Editor uebersetzt den Satz. */
export const DELETE_FACES_UNCHANGED_MESSAGE = "These faces cannot be deleted: the faces around them do not close the gap.";

const DEFEATURE_TOLERANCE = 1e-4;
/** Die Grenze, mit der der Kern seine Flaechengruppen hasht (meshShape); die Flaechen werden ebenso gehasht. */
const HASH_UPPER_BOUND = 2_147_483_647;

function releaseAll(cad: OcctKernel, handles: ShapeHandle[]) {
  handles.forEach((handle) => {
    try {
      cad.release(handle);
    } catch {
      // schon weg
    }
  });
}

function shapeIsValid(cad: OcctKernel, shape: ShapeHandle) {
  try {
    return Boolean(cad.isValid(shape));
  } catch {
    return false;
  }
}

/** Art, Inhalt, Mitte und Rahmen einer Flaeche: woran man dieselbe Flaeche wiedererkennt. */
function faceShape(cad: OcctKernel, face: ShapeHandle) {
  const { x, y, z } = cad.getSurfaceCenterOfMass(face);
  const box = cad.getBoundingBox(face);
  return { kind: cad.surfaceType(face), area: cad.getSurfaceArea(face), center: { x, y, z }, box: [box.xmin, box.ymin, box.zmin, box.xmax, box.ymax, box.zmax] };
}

// Der Rahmen trennt Flaechen, die nur Art, Inhalt und Mitte teilen, etwa Bohrung und Nabe einer Spule.
function sameFaceShape(a: ReturnType<typeof faceShape>, b: ReturnType<typeof faceShape>) {
  return a.kind === b.kind && Math.abs(a.area - b.area) <= 1e-6 * Math.max(1, a.area) &&
    Math.hypot(a.center.x - b.center.x, a.center.y - b.center.y, a.center.z - b.center.z) <= 1e-4 &&
    a.box.every((value, index) => Math.abs(value - b.box[index]) <= 1e-4);
}

/**
 * Der Koerper ohne die genannten Flaechen. Wo die Flaechen rundherum die
 * Luecke nicht schliessen koennen, sagt der Kern das nicht: Er gibt den
 * Koerper unveraendert zurueck oder nimmt weg, was geht, und baut den Rest
 * an derselben Stelle neu. Darum zaehlt das Ergebnis nur, wenn es ein heiler
 * Koerper ist und keine der gewaehlten Flaechen mehr darin steckt, weder sie
 * selbst noch eine gleiche an derselben Stelle; sonst kommt der Satz oben,
 * und nichts aendert sich.
 */
export function deleteFacesSolid(cad: OcctKernel, solid: ShapeHandle, faces: ShapeHandle[]) {
  if (faces.length === 0) throw new Error(DELETE_FACES_UNCHANGED_MESSAGE);
  const picked = faces.map((face) => faceShape(cad, face));
  let result: ShapeHandle;
  try {
    result = cad.defeature(solid, faces, DEFEATURE_TOLERANCE);
  } catch (error) {
    // Ein Speicherfehler muss zum Arbeiter durch, der den Kern neu startet.
    if (error instanceof Error && isCadModifierWasmMemoryFault(error.message, error.name)) throw error;
    throw new Error(DELETE_FACES_UNCHANGED_MESSAGE);
  }
  const solids: ShapeHandle[] = [];
  let remaining: ShapeHandle[] = [];
  try {
    if (!cad.isSolid(result)) solids.push(...cad.getSubShapes(result, "solid"));
    const body = cad.isSolid(result) ? result : solids.length === 1 ? solids[0] : null;
    if (body === null || !shapeIsValid(cad, body)) throw new Error(DELETE_FACES_UNCHANGED_MESSAGE);
    remaining = cad.getSubShapes(body, "face");
    const left = remaining.map((face) => faceShape(cad, face));
    if (picked.some((face) => left.some((other) => sameFaceShape(face, other)))) throw new Error(DELETE_FACES_UNCHANGED_MESSAGE);
    releaseAll(cad, [...remaining, ...(body === result ? [] : [result]), ...solids.filter((other) => other !== body)]);
    return body;
  } catch (error) {
    releaseAll(cad, [...remaining, result, ...solids]);
    throw error;
  }
}

/**
 * Die Flaechen mehrerer Koerper, durchnummeriert: erst alle des ersten, dann
 * die des zweiten. Dieselbe Nummer meint im Netz zum Waehlen und beim Loeschen
 * dieselbe Flaeche. Der Aufrufer gibt die Griffe wieder frei.
 */
export function cadFacesBySolid(cad: OcctKernel, solids: ShapeHandle[]) {
  return solids.map((solid) => cad.getSubShapes(solid, "face"));
}

/** Das Netz der Koerper zum Waehlen, mit der Flaechennummer jedes Dreiecks. */
export function cadFaceTessellation(cad: OcctKernel, solids: ShapeHandle[], options: { linearDeflection: number; angularDeflection: number }) {
  const facesBySolid = cadFacesBySolid(cad, solids);
  try {
    const positions: number[] = [];
    const indices: number[] = [];
    const triangleFaces: number[] = [];
    let faceOffset = 0;
    solids.forEach((solid, index) => {
      const mesh = cad.meshShape(solid, options);
      const hashes = facesBySolid[index].map((face) => cad.hashCode(face, HASH_UPPER_BOUND));
      const vertexOffset = positions.length / 3;
      for (const value of mesh.positions) positions.push(value);
      for (const value of mesh.indices) indices.push(value + vertexOffset);
      for (const face of cadTriangleFaces(mesh.faceGroups ?? [], hashes, mesh.triangleCount, faceOffset)) triangleFaces.push(face);
      faceOffset += hashes.length;
    });
    return { positions: new Float32Array(positions), indices: new Uint32Array(indices), triangleFaces: new Int32Array(triangleFaces) };
  } finally {
    facesBySolid.forEach((faces) => releaseAll(cad, faces));
  }
}

/**
 * Loescht die gewaehlten Flaechen (Nummern wie in cadFaceTessellation) aus
 * den Koerpern; ein Koerper ohne gewaehlte Flaeche bleibt, wie er ist.
 * Zurueck kommen die neuen Koerper, in derselben Reihenfolge.
 */
export function deleteFacesFromSolids(cad: OcctKernel, solids: ShapeHandle[], faceIds: readonly number[]) {
  const wanted = new Set(faceIds);
  if (wanted.size === 0) throw new Error(DELETE_FACES_UNCHANGED_MESSAGE);
  const facesBySolid = cadFacesBySolid(cad, solids);
  const results: ShapeHandle[] = [];
  try {
    let faceOffset = 0;
    solids.forEach((solid, index) => {
      const faces = facesBySolid[index];
      const chosen = faces.filter((_, faceIndex) => wanted.has(faceOffset + faceIndex));
      faceOffset += faces.length;
      results.push(chosen.length ? deleteFacesSolid(cad, solid, chosen) : cad.copy(solid));
    });
    return results;
  } catch (error) {
    releaseAll(cad, results);
    throw error;
  } finally {
    facesBySolid.forEach((faces) => releaseAll(cad, faces));
  }
}
