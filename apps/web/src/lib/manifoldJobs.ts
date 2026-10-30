/**
 * manifoldJobs.ts
 *
 * Die Arbeit im Manifold-Kern beim Verschneiden, Vereinigen und Teilen, so
 * beschrieben, dass sie im Geometrie-Worker (workers/manifold.worker.ts) und
 * auf der Seite mit demselben Code laeuft. Die Seite uebersetzt jede Form in
 * einen ManifoldOperand (Grundkoerper mit Matrix, Quader oder Netz); was dabei
 * herauskommt, sind wieder Dreiecke. Pruefen und daraus Formen bauen bleibt
 * auf der Seite.
 *
 * Gemessen mit manifold-3d in Node, ohne die Arbeit des Editors drumherum:
 * eine Kugel aus 202.248 Dreiecken zu verschweissen, zum Koerper zu machen,
 * einen Zylinder abzuziehen und auszulesen dauerte 1,25 s; eine aus 301.088
 * Dreiecken zu teilen 1,8 s. Solange stand der Editor.
 *
 * Nach layerling 1.105.0.
 */

import type { ManifoldToplevel } from "manifold-3d";
import { dropSplitSlivers, unionSplitManifoldComponents, type ManifoldSolid } from "@/lib/manifoldSplit";

export type ManifoldOperand =
  /** Ein Grundkoerper des Kerns, mit einer 4x4-Matrix (spaltenweise, wie three) an seinen Platz gebracht. */
  | { kind: "cube"; matrix: number[] }
  | { kind: "sphere"; segments: number; matrix: number[] }
  | { kind: "cylinder"; topRadiusScale: number; sides: number; matrix: number[] }
  /** Ein achsparalleler Quader aus seinen Grenzen. */
  | { kind: "box"; min: [number, number, number]; max: [number, number, number] }
  /** Ein Netz: Punkte und je drei Punktnummern pro Dreieck. */
  | { kind: "mesh"; vertProperties: Float32Array; triVerts: Uint32Array };

export type ManifoldJob =
  /** Alle solids vereinigt, alle cutters vereinigt abgezogen. */
  | { op: "subtract"; solids: ManifoldOperand[]; cutters: ManifoldOperand[] }
  | { op: "union"; solids: ManifoldOperand[] }
  /** Der Koerper an der Ebene normal . p = position in zwei Haelften. */
  | { op: "split"; solid: ManifoldOperand; normal: [number, number, number]; position: number };

/**
 * Was herauskommt: je Ergebnis die Dreiecke als Punktliste (neun Zahlen pro
 * Dreieck). Beim Teilen zuerst die Haelfte auf der Seite, in die die Normale
 * zeigt. Sonst der Grund, so dass die Seite ihre Meldung dazu waehlen kann.
 */
export type ManifoldJobResult =
  | { ok: true; positions: Float32Array[] }
  | { ok: false; reason: "failed" | "notClosed" | "overlapping" | "emptyHalf"; status?: string }
  /** Der Kern hat eine Ausnahme geworfen; message ist ihr Text. */
  | { ok: false; reason: "error"; message: string };

export function disposeManifold(value: unknown) {
  (value as { delete?: () => void } | null)?.delete?.();
}

function track<T extends ManifoldSolid | null>(created: ManifoldSolid[], value: T): T {
  if (value) created.push(value);
  return value;
}

/**
 * Der Koerper zu einem Operand. Zwischenschritte landen in created; ein aus
 * einem Netz gebauter Koerper nicht, den verwaltet der Aufrufer (so wie bisher
 * im Editor).
 */
export function manifoldFromOperand(runtime: ManifoldToplevel, operand: ManifoldOperand, created: ManifoldSolid[]): ManifoldSolid | null {
  if (operand.kind === "box") {
    const size = [operand.max[0] - operand.min[0], operand.max[1] - operand.min[1], operand.max[2] - operand.min[2]] as [number, number, number];
    if (size.some((value) => value <= 0.0001)) return null;
    const box = track(created, runtime.Manifold.cube(size));
    const moved = box.translate(operand.min);
    if (moved !== box && moved) created.push(moved);
    return moved;
  }
  if (operand.kind === "mesh") {
    const mesh = new runtime.Mesh({ numProp: 3, vertProperties: operand.vertProperties, triVerts: operand.triVerts, tolerance: 0.0001 });
    try {
      mesh.merge();
      return runtime.Manifold.ofMesh(mesh);
    } finally {
      disposeManifold(mesh);
    }
  }
  const primitive = operand.kind === "cube"
    ? runtime.Manifold.cube(1, true)
    : operand.kind === "sphere"
      ? runtime.Manifold.sphere(1, operand.segments)
      : runtime.Manifold.cylinder(1, 1, operand.topRadiusScale, operand.sides, true);
  track(created, primitive);
  return track(created, primitive.transform(operand.matrix as unknown as Parameters<ManifoldSolid["transform"]>[0]));
}

/** Alle Operanden vereinigt, oder null, wenn einer keinen heilen Koerper gibt. */
export function manifoldUnionOfOperands(runtime: ManifoldToplevel, operands: readonly (ManifoldOperand | null)[], created: ManifoldSolid[]) {
  const parts: ManifoldSolid[] = [];
  for (const operand of operands) {
    const part = operand ? manifoldFromOperand(runtime, operand, created) : null;
    if (!part || part.status() !== "NoError" || part.numTri() < 1) {
      if (part && !created.includes(part)) disposeManifold(part);
      return null;
    }
    parts.push(part);
    created.push(part);
  }
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];
  const union = runtime.Manifold.union(parts);
  created.push(union);
  return union.status() === "NoError" && union.numTri() > 0 ? union : null;
}

/** Die Dreiecke eines Koerpers als Punktliste, neun Zahlen pro Dreieck. */
export function manifoldPositions(solid: ManifoldSolid) {
  const mesh = solid.getMesh();
  try {
    const positions = new Float32Array(mesh.triVerts.length * 3);
    const numProp = mesh.numProp;
    for (let i = 0; i < mesh.triVerts.length; i += 1) {
      const offset = mesh.triVerts[i] * numProp;
      positions[i * 3] = mesh.vertProperties[offset];
      positions[i * 3 + 1] = mesh.vertProperties[offset + 1];
      positions[i * 3 + 2] = mesh.vertProperties[offset + 2];
    }
    return positions;
  } finally {
    disposeManifold(mesh);
  }
}

function usable(solid: ManifoldSolid | null): solid is ManifoldSolid {
  return Boolean(solid) && solid!.status() === "NoError" && solid!.numTri() > 0;
}

function closed(solid: ManifoldSolid) {
  return solid.status() === "NoError" && solid.numTri() > 0;
}

export function runManifoldJob(runtime: ManifoldToplevel, job: ManifoldJob): ManifoldJobResult {
  const created: ManifoldSolid[] = [];
  try {
    if (job.op === "union") {
      const union = manifoldUnionOfOperands(runtime, job.solids, created);
      return usable(union) ? { ok: true, positions: [manifoldPositions(union)] } : { ok: false, reason: "failed" };
    }
    if (job.op === "subtract") {
      const solid = manifoldUnionOfOperands(runtime, job.solids, created);
      const cutter = manifoldUnionOfOperands(runtime, job.cutters, created);
      if (!solid || !cutter) return { ok: false, reason: "failed" };
      const result = track(created, solid.subtract(cutter));
      return usable(result) ? { ok: true, positions: [manifoldPositions(result)] } : { ok: false, reason: "failed" };
    }

    const built = manifoldFromOperand(runtime, job.solid, created);
    if (!built || !closed(built)) return { ok: false, reason: "notClosed", status: built?.status() ?? "empty" };
    created.push(built);
    let solid: ManifoldSolid = built;
    const normalized = unionSplitManifoldComponents(runtime, solid);
    created.push(...normalized.created);
    if (!normalized.solid) return { ok: false, reason: "overlapping" };
    solid = normalized.solid;
    const [rawPositive, rawNegative] = solid.splitByPlane(job.normal, job.position);
    created.push(rawPositive, rawNegative);
    const positive = dropSplitSlivers(runtime, rawPositive);
    const negative = dropSplitSlivers(runtime, rawNegative);
    created.push(...positive.created, ...negative.created);
    if (!usable(positive.solid) || !usable(negative.solid)) return { ok: false, reason: "emptyHalf" };
    return { ok: true, positions: [manifoldPositions(positive.solid), manifoldPositions(negative.solid)] };
  } catch (error) {
    return { ok: false, reason: "error", message: error instanceof Error ? error.message : String(error ?? "") };
  } finally {
    Array.from(new Set(created)).forEach(disposeManifold);
  }
}
