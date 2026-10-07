/**
 * manifoldSplit.ts
 *
 * Was ein Koerper vor und nach dem Teilen braucht.
 *
 * Zwei Dinge gehen beim Schneiden schief, wenn man sie nicht behandelt: Eine
 * Auswahl aus mehreren sich durchdringenden Koerpern muss erst zu einem
 * werden, und ein Schnitt genau auf einer Flaeche laesst eine Haut ohne Dicke
 * zurueck.
 *
 * Nach Layerling 1.40.0.
 */

import type { ManifoldToplevel } from "manifold-3d";

export type ManifoldSolid = ReturnType<ManifoldToplevel["Manifold"]["cube"]>;

/** Dieselbe Oberflaeche andersherum: aus einem Hohlraum der Koerper, der ihn fuellt. */
function invertedManifold(runtime: ManifoldToplevel, source: ManifoldSolid) {
  const mesh = source.getMesh();
  const triVerts = Uint32Array.from(mesh.triVerts);
  for (let index = 0; index < triVerts.length; index += 3) {
    const second = triVerts[index + 1];
    triVerts[index + 1] = triVerts[index + 2];
    triVerts[index + 2] = second;
  }
  const inverted = new runtime.Mesh({ numProp: mesh.numProp, vertProperties: mesh.vertProperties, triVerts });
  try {
    return runtime.Manifold.ofMesh(inverted);
  } finally {
    (mesh as { delete?: () => void }).delete?.();
    (inverted as { delete?: () => void }).delete?.();
  }
}

/**
 * Macht aus sich durchdringenden Koerpern einen, bevor geschnitten wird.
 *
 * Ein rundum geschlossener Hohlkoerper faellt dabei in zwei Teile auseinander:
 * seine Aussenhaut und den nach innen gewendeten Hohlraum. Eine Vereinigung
 * wuerde den Hohlraum zuschuetten - darum werden nur die nach aussen
 * gewendeten Teile vereinigt und die Hohlraeume danach wieder herausgeschnitten.
 */
export function unionSplitManifoldComponents(runtime: ManifoldToplevel, source: ManifoldSolid) {
  const components = source.decompose();
  const bodies = components.filter((component) => component.volume() > 0);
  const cavities = components.filter((component) => component.volume() < 0);
  if (bodies.length <= 1) {
    return { solid: source, created: components };
  }

  const created: ManifoldSolid[] = [...components];
  let solid = runtime.Manifold.union(bodies);
  created.push(solid);
  if (cavities.length > 0) {
    const filled = cavities.map((cavity) => invertedManifold(runtime, cavity));
    created.push(...filled);
    const cavitySolid = filled.length === 1 ? filled[0] : runtime.Manifold.union(filled);
    created.push(cavitySolid);
    solid = solid.subtract(cavitySolid);
    created.push(solid);
  }
  return {
    solid: solid.status() === "NoError" && solid.numTri() > 0 ? solid : null,
    created,
  };
}

/** Duenner als das (in mm, grob Volumen durch halbe Oberflaeche) ist ein Teil eine Haut und kein Koerper. */
const SLIVER_THICKNESS = 1e-5;

/**
 * Wirft die Haeute ohne Dicke weg, die ein Schnitt hinterlaesst.
 *
 * Eine Ebene, die genau auf einer Flaeche liegt - wie eine, die auf eine
 * angeklickte Flaeche gelegt wurde -, gibt diese Flaeche einer Haelfte als
 * flaches Blatt mit. Hohlraeume zaehlen nach ihrer Groesse mit, damit eine
 * ausgehoehlte Haelfte sie behaelt.
 */
export function dropSplitSlivers(runtime: ManifoldToplevel, half: ManifoldSolid) {
  const components = half.decompose();
  const kept = components.filter((component) => Math.abs(component.volume()) * 2 > component.surfaceArea() * SLIVER_THICKNESS);
  if (kept.length === components.length) {
    return { solid: half, created: components };
  }
  if (kept.length === 0) {
    return { solid: null, created: components };
  }
  const solid = runtime.Manifold.compose(kept);
  return { solid, created: [...components, solid] };
}
