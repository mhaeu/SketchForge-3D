import type { Brep } from "@/lib/brepKernel";

/** Was der CAD-Kern aus einer STEP-Datei macht: das Netz und der ausgerichtete Koerper als STEP-Text. */
export type StepMesh = {
  positions: Float32Array;
  normals?: Float32Array;
  stepText?: string;
};

/**
 * Die Datei selbst taugt nicht (kein Koerper, nicht lesbar). Ein solcher Fehler
 * kommt aus dem Worker unveraendert zurueck; nur wenn der Worker gar nicht
 * laeuft, liest die Seite die Datei noch einmal selbst.
 */
export class StepReadError extends Error {}

export type StepWorkerRequest = { requestId: number; buffer: ArrayBuffer };

export type StepWorkerResponse =
  | { requestId: number; ok: true; mesh: StepMesh }
  /** readError: die Datei taugt nicht; sonst lief der Kern nicht, und die Seite liest selbst. */
  | { requestId: number; ok: false; readError: boolean; message: string };

/**
 * Der Teil, der den CAD-Kern braucht. Er laeuft im STEP-Worker
 * (workers/step.worker.ts) und, wo der nicht laeuft, auf der Seite - mit
 * demselben Code, damit beide Wege dasselbe Netz liefern.
 */
export async function stepMeshFromBuffer(brep: Brep, buffer: ArrayBuffer): Promise<StepMesh> {
  const imported = await brep.importSTEP(new Blob([buffer]));
  if (!imported.ok) {
    throw new StepReadError(`Could not read STEP: ${String(imported.error.message ?? imported.error)}`);
  }

  // STEP/CAD space is Z-up; SketchForge is Y-up. Rotating −90° about X maps CAD
  // +Z (up) to SketchForge +Y — the inverse of the exporter's +90°·X. Rigid
  // kernel ops (rotate/translate) are used throughout normalization because they
  // preserve the exact geometry; a matrix transform here corrupts later export.
  const flipped = brep.rotate(imported.value, -90, { axis: [1, 0, 0] });
  const tess = brep.mesh(flipped);
  if (tess.vertices.length < 9) {
    throw new StepReadError("STEP file has no solid geometry to import");
  }

  const hasNormals = tess.normals.length === tess.vertices.length;
  const positions = new Float32Array(tess.triangles.length * 3);
  const normals = hasNormals ? new Float32Array(tess.triangles.length * 3) : undefined;
  for (let i = 0; i < tess.triangles.length; i += 1) {
    const v = tess.triangles[i] * 3;
    positions[i * 3] = tess.vertices[v];
    positions[i * 3 + 1] = tess.vertices[v + 1];
    positions[i * 3 + 2] = tess.vertices[v + 2];
    if (normals) {
      normals[i * 3] = tess.normals[v];
      normals[i * 3 + 1] = tess.normals[v + 1];
      normals[i * 3 + 2] = tess.normals[v + 2];
    }
  }

  // importedShapeFromTriangleSoup recenters the mesh to x/z-centered, bottom at
  // y=0. Recenter the stored B-Rep by the same offset so the exact geometry and
  // the displayed mesh share one local frame, and the editor's transforms apply
  // identically to both.
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    minX = Math.min(minX, positions[i]);
    maxX = Math.max(maxX, positions[i]);
    minY = Math.min(minY, positions[i + 1]);
    minZ = Math.min(minZ, positions[i + 2]);
    maxZ = Math.max(maxZ, positions[i + 2]);
  }
  const normalized = brep.translate(flipped, [-(minX + maxX) / 2, -minY, -(minZ + maxZ) / 2]);
  const exported = brep.exportSTEP(normalized);
  const stepText = exported.ok ? await exported.value.text() : undefined;
  return { positions, ...(normals ? { normals } : {}), ...(stepText ? { stepText } : {}) };
}
