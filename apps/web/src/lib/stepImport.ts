import type { WorkplaneShape } from "@/types/sketchforge";
import { importedShapeFromTriangleSoup } from "@/lib/stlImport";
import { loadBrepWithOcct } from "@/lib/brepKernel";
import { stepMeshOffThread } from "@/lib/stepWorkerClient";
import { stepMeshFromBuffer, type StepMesh } from "@/lib/stepMesh";

export { StepReadError, stepMeshFromBuffer, type StepMesh } from "@/lib/stepMesh";

const STEP_EXTENSIONS = new Set(["step", "stp"]);

export function isStepFile(fileName: string): boolean {
  return STEP_EXTENSIONS.has(fileName.split(".").pop()?.toLowerCase() ?? "");
}

export function importedShapeFromStepMesh(fileName: string, mesh: StepMesh): WorkplaneShape {
  const shape = importedShapeFromTriangleSoup(fileName, Array.from(mesh.positions), mesh.normals ? Array.from(mesh.normals) : undefined, "step");
  if (shape.importedMesh && mesh.stepText) {
    shape.importedMesh.brepStep = mesh.stepText;
  }
  return shape;
}

/**
 * Liest eine STEP-Datei. Zuerst im STEP-Worker, damit der Editor nicht steht
 * (eine 3,3-MB-Datei hielt die Seite gemessen 6,6 s fest) und die Seite den
 * 22-MB-Kern fuer einen Import gar nicht erst laedt. Laeuft kein Worker, liest
 * die Seite die Datei wie bisher selbst.
 */
export async function importedShapeFromStep(fileName: string, buffer: ArrayBuffer): Promise<WorkplaneShape> {
  const offThread = await stepMeshOffThread(buffer);
  const mesh = offThread ?? await stepMeshFromBuffer(await loadBrepWithOcct(), buffer);
  return importedShapeFromStepMesh(fileName, mesh);
}
