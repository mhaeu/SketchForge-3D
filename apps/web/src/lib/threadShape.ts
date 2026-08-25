/**
 * threadShape.ts
 *
 * Bridge between threadGenerator.ts and SketchForge's shape model.
 *
 * Core idea: a thread is not a new ShapeKind. With kind: "mesh" + importedMesh
 * SketchForge already has a complete path for arbitrary triangle meshes (that's
 * what STL import uses). We hook into it - so rendering, grouping, hole boolean,
 * persistence and export all work without further changes.
 *
 * Two conventions from the project that are respected here:
 *
 *   1. Axes: the generator lays the thread out along +Z. SketchForge
 *      uses Y as height -> positions are rotated while being filled.
 *
 *   2. Origin: `resizedImportedCoordinates()` scales purely multiplicatively
 *      about the origin. So X/Z must be centered on the axis and Y must start
 *      at 0 (same convention as putGeometryOnBase() in the viewport).
 *      Otherwise the mesh drifts when scaled.
 *
 *   3. Triangles: `importedMeshForShape()` reads positions as unfolded
 *      triplets (faces = [i, i+1, i+2]). The index buffer is therefore
 *      expanded here.
 *
 * Lizenz: MIT
 */

import { generateThread, THREAD_TABLES, type ThreadParams } from "@/lib/threadGenerator";
import type { WorkplaneShape } from "@/types/sketchforge";

export type ThreadShapeOptions = {
  /** ISO designation, e.g. "M8". Or set diameter + pitch directly. */
  designation?: string;
  diameter?: number;
  pitch?: number;
  length: number;
  kind: "external" | "internal";
  clearance?: number;
  segments?: number;
  taperTurns?: number;
};

/** Startwerte je Toolbar-Eintrag. */
export const THREAD_ASSET_PRESETS: Record<string, ThreadShapeOptions> = {
  "thread-external": {
    designation: "M8",
    length: 20,
    kind: "external",
    clearance: 0.2,
    segments: 48,
    taperTurns: 1,
  },
  "thread-internal": {
    designation: "M8",
    length: 20,
    kind: "internal",
    clearance: 0.3,
    segments: 48,
    taperTurns: 1,
  },
};

export function isThreadAssetId(id: string): id is keyof typeof THREAD_ASSET_PRESETS {
  return Object.prototype.hasOwnProperty.call(THREAD_ASSET_PRESETS, id);
}

/** Loest designation bzw. diameter/pitch zu konkreten Generator-Parametern auf. */
function resolveParams(options: ThreadShapeOptions): ThreadParams {
  const spec = options.designation ? THREAD_TABLES[options.designation] : undefined;
  const diameter = options.diameter ?? spec?.diameter;
  const pitch = options.pitch ?? spec?.pitch;

  if (diameter === undefined || pitch === undefined) {
    throw new Error(
      'createThreadShapeFields: entweder designation (z.B. "M8") oder diameter + pitch angeben.',
    );
  }

  return {
    diameter,
    pitch,
    length: options.length,
    kind: options.kind,
    clearance: options.clearance ?? (options.kind === "internal" ? 0.3 : 0.2),
    segments: options.segments ?? 48,
    taperTurns: options.taperTurns ?? 1,
  };
}

/**
 * Builds the geometry-related fields of a thread shape.
 *
 * Intentionally without id/name/color/position: the caller sets those so the
 * function works both when inserting from the toolbar and when rebuilding
 * later (parameter change in the inspector).
 */
export function createThreadShapeFields(
  options: ThreadShapeOptions,
): Pick<
  WorkplaneShape,
  "kind" | "size" | "width" | "depth" | "height" | "importedMesh" | "threadParams"
> {
  const params = resolveParams(options);
  const mesh = generateThread(params);

  // Expand the index buffer, rotate axes (generator Z-up -> SketchForge Y-up).
  //
  //   Generator          SketchForge
  //   x  ->  x
  //   y  ->  z
  //   z  ->  y   (Hoehe, beginnt bei 0)
  //
  // Rotating y -> z without a sign flip would mirror the triangle winding;
  // z is negated so the normals keep pointing outward.
  const positions: number[] = [];
  const v = mesh.vertices;
  const idx = mesh.indices;
  for (let i = 0; i < idx.length; i++) {
    const p = idx[i] * 3;
    positions.push(v[p], v[p + 2], -v[p + 1]);
  }

  const outerDiameter = mesh.info.majorDiameter;

  return {
    kind: "mesh",
    size: outerDiameter,
    width: outerDiameter,
    depth: outerDiameter,
    height: params.length,
    importedMesh: {
      positions,
      baseWidth: outerDiameter,
      baseDepth: outerDiameter,
      baseHeight: params.length,
      triangleCount: Math.floor(positions.length / 9),
      sourceFormat: "json",
    },
    // Carry the parameters so the thread can be rebuilt later instead of
    // only scaled (the pitch must not grow when lengthening).
    threadParams: {
      diameter: params.diameter,
      pitch: params.pitch,
      length: params.length,
      kind: params.kind,
      clearance: params.clearance ?? 0,
      segments: params.segments ?? 48,
      taperTurns: params.taperTurns ?? 1,
    },
  };
}

/** Rebuilds an existing thread with changed parameters. */
export function rebuildThreadShape(
  shape: WorkplaneShape,
  changes: Partial<ThreadShapeOptions>,
): WorkplaneShape {
  if (!shape.threadParams) return shape;
  const next = { ...shape.threadParams, ...changes };
  return { ...shape, ...createThreadShapeFields(next) };
}

/**
 * Finds a matching standard designation for a diameter/pitch pair.
 * Returns null if the combination matches no table (custom input).
 */
export function findDesignation(diameter: number, pitch: number): string | null {
  for (const [name, spec] of Object.entries(THREAD_TABLES)) {
    if (Math.abs(spec.diameter - diameter) < 0.005 && Math.abs(spec.pitch - pitch) < 0.005) {
      return name;
    }
  }
  return null;
}
