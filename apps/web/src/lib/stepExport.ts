import type { WorkplaneShape } from "@/types/sketchforge";
import { loadBrepWithOcct } from "@/lib/brepKernel";
import { exportShapesWithBrep, type StepExportResult } from "@/lib/stepExportCore";
import { stepExportOffThread } from "@/lib/stepWorkerClient";

export * from "@/lib/stepExportCore";

/**
 * Schreibt die Formen als STEP. Zuerst im STEP-Worker, damit der Editor nicht
 * steht (drei eingelesene Teile mit zusammen 88.000 Dreiecken hielten die
 * Seite gemessen 4,6 s fest). Laeuft kein Worker, schreibt die Seite wie bisher.
 */
export async function exportShapesToStep(shapes: WorkplaneShape[]): Promise<StepExportResult> {
  return (await stepExportOffThread(shapes)) ?? exportShapesWithBrep(await loadBrepWithOcct(), shapes);
}
