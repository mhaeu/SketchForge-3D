import * as THREE from "three";
import type { WorkplaneShape } from "@/types/sketchforge";
import { meshYawDegrees, resizedImportedMeshPositions, shapeDepth, shapeWidth } from "@/lib/workplaneShapes";

/**
 * A box inside a shape, in the shape's own display frame: x and z centred on
 * the shape, y from its underside, all in millimetres at the shape's current
 * size. The resize handles act on this box instead of on the whole shape.
 */
export type ResizeRegion = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
};

/**
 * What happens to the material inside the region when the box changes size.
 * - stretch: the inside scales with the box, so its features distort.
 * - push: the inside moves rigidly with the face being dragged, and the
 *   triangles crossing the opposite face are extruded to fill the gap - the
 *   part gets longer without changing shape.
 * Either way, nothing outside the box moves.
 */
export type RegionResizeMode = "stretch" | "push";

export const MIN_REGION_SIZE = 0.05;
const EDGE_EPSILON = 1e-6;

type Axis = "X" | "Y" | "Z";
const AXES: Axis[] = ["X", "Y", "Z"];

/** The region that covers the whole shape - the starting point for editing. */
export function fullShapeRegion(shape: Pick<WorkplaneShape, "width" | "depth" | "size" | "height">): ResizeRegion {
  const width = shapeWidth(shape as WorkplaneShape);
  const depth = shapeDepth(shape as WorkplaneShape);
  return { minX: -width / 2, maxX: width / 2, minY: 0, maxY: shape.height, minZ: -depth / 2, maxZ: depth / 2 };
}

/** Orders each pair, keeps a minimum thickness, and stays inside the shape. */
export function clampRegionToShape(region: ResizeRegion, shape: Pick<WorkplaneShape, "width" | "depth" | "size" | "height">): ResizeRegion {
  const bounds = fullShapeRegion(shape);
  const next = { ...region };
  for (const axis of AXES) {
    const lo = `min${axis}` as const;
    const hi = `max${axis}` as const;
    let min = Math.min(next[lo], next[hi]);
    let max = Math.max(next[lo], next[hi]);
    min = Math.max(bounds[lo], Math.min(min, bounds[hi] - MIN_REGION_SIZE));
    max = Math.min(bounds[hi], Math.max(max, min + MIN_REGION_SIZE));
    next[lo] = min;
    next[hi] = max;
  }
  return next;
}

export function regionsEqual(a: ResizeRegion | null | undefined, b: ResizeRegion | null | undefined) {
  if (!a || !b) return a === b;
  return AXES.every((axis) => a[`min${axis}`] === b[`min${axis}`] && a[`max${axis}`] === b[`max${axis}`]);
}

type AxisMap = {
  from: [number, number];
  to: [number, number];
  minMoved: boolean;
  maxMoved: boolean;
  // A face that stayed put is the one material gets inserted at, so a vertex
  // row lying exactly on it belongs to the outside and stays as well - that
  // is what makes a push a clean extrusion when the box is snapped to an
  // edge. Faces that moved, and axes that did not change, keep their rows.
  minInclusive: boolean;
  maxInclusive: boolean;
};

function axisMaps(from: ResizeRegion, to: ResizeRegion): Record<Axis, AxisMap> {
  const maps = {} as Record<Axis, AxisMap>;
  for (const axis of AXES) {
    const a = from[`min${axis}`];
    const b = from[`max${axis}`];
    const a2 = to[`min${axis}`];
    const b2 = to[`max${axis}`];
    const minMoved = Math.abs(a2 - a) > EDGE_EPSILON;
    const maxMoved = Math.abs(b2 - b) > EDGE_EPSILON;
    const changed = minMoved || maxMoved;
    maps[axis] = {
      from: [a, b],
      to: [a2, b2],
      minMoved,
      maxMoved,
      minInclusive: !changed || minMoved,
      maxInclusive: !changed || maxMoved,
    };
  }
  return maps;
}

function inside(value: number, map: AxisMap) {
  const [a, b] = map.from;
  const aboveMin = map.minInclusive ? value >= a - EDGE_EPSILON : value > a + EDGE_EPSILON;
  const belowMax = map.maxInclusive ? value <= b + EDGE_EPSILON : value < b - EDGE_EPSILON;
  return aboveMin && belowMax;
}

function mapped(value: number, map: AxisMap, mode: RegionResizeMode) {
  const [a, b] = map.from;
  const [a2, b2] = map.to;
  if (mode === "push") {
    // Rigid: the inside follows the face that moved. When both faces moved
    // (a centred resize) there is no fixed face to insert material at, so
    // each half follows its own face and the material goes in at the middle.
    if (map.minMoved && map.maxMoved) {
      return value + (value < (a + b) / 2 ? a2 - a : b2 - b);
    }
    return value + (a2 - a) + (b2 - b);
  }
  const size = Math.max(EDGE_EPSILON, b - a);
  return a2 + (value - a) * ((b2 - a2) / size);
}

/**
 * Moves the vertices that lie inside `from` so that they fill `to`, leaving
 * every other vertex where it is. Positions are a flat triangle soup in the
 * shape's display frame; the result is a new array in the same frame.
 */
export function deformPositionsInRegion(positions: number[], from: ResizeRegion, to: ResizeRegion, mode: RegionResizeMode): number[] {
  const maps = axisMaps(from, to);
  const next = new Array<number>(positions.length);
  for (let index = 0; index + 2 < positions.length; index += 3) {
    const x = positions[index];
    const y = positions[index + 1];
    const z = positions[index + 2];
    if (inside(x, maps.X) && inside(y, maps.Y) && inside(z, maps.Z)) {
      next[index] = mapped(x, maps.X, mode);
      next[index + 1] = mapped(y, maps.Y, mode);
      next[index + 2] = mapped(z, maps.Z, mode);
    } else {
      next[index] = x;
      next[index + 1] = y;
      next[index + 2] = z;
    }
  }
  return next;
}

export type RegionResizeResult = {
  patch: Partial<WorkplaneShape>;
  /** The region expressed in the patched shape's frame. */
  region: ResizeRegion;
};

/**
 * Applies a region change to a mesh shape and rebuilds the shape around the
 * result: the deformed vertices become the new base mesh at scale 1, the
 * shape's size and position follow the new bounds, and everything that
 * described the old surface analytically (B-rep, edge treatments, thread
 * parameters) is dropped, because it no longer matches.
 */
export function regionResizedShape(shape: WorkplaneShape, from: ResizeRegion, to: ResizeRegion, mode: RegionResizeMode): RegionResizeResult | null {
  const mesh = shape.importedMesh;
  if (!mesh || mesh.positions.length < 9) return null;

  const positions = deformPositionsInRegion(resizedImportedMeshPositions(shape), from, to, mode);
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (let index = 0; index + 2 < positions.length; index += 3) {
    minX = Math.min(minX, positions[index]);
    maxX = Math.max(maxX, positions[index]);
    minY = Math.min(minY, positions[index + 1]);
    maxY = Math.max(maxY, positions[index + 1]);
    minZ = Math.min(minZ, positions[index + 2]);
    maxZ = Math.max(maxZ, positions[index + 2]);
  }
  if (![minX, minY, minZ, maxX, maxY, maxZ].every(Number.isFinite)) return null;

  // Re-centre so the mesh keeps the frame every other mesh shape uses: x and
  // z around zero, y from zero.
  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;
  for (let index = 0; index + 2 < positions.length; index += 3) {
    positions[index] -= centerX;
    positions[index + 1] -= minY;
    positions[index + 2] -= centerZ;
  }
  const width = Math.max(MIN_REGION_SIZE, maxX - minX);
  const height = Math.max(MIN_REGION_SIZE, maxY - minY);
  const depth = Math.max(MIN_REGION_SIZE, maxZ - minZ);

  // The shape's centre moved by the re-centring offset, expressed in the
  // shape's rotated frame. The old centre sat at local (0, height/2, 0).
  const offset = new THREE.Vector3(centerX, minY + height / 2 - shape.height / 2, centerZ).applyEuler(
    new THREE.Euler(
      THREE.MathUtils.degToRad(shape.rotationX ?? 0),
      THREE.MathUtils.degToRad(meshYawDegrees(shape)),
      THREE.MathUtils.degToRad(shape.rotationZ ?? 0),
      "XYZ",
    ),
  );
  const elevation = (shape.elevation ?? 0) + shape.height / 2 + offset.y - height / 2;

  const region: ResizeRegion = {
    minX: to.minX - centerX,
    maxX: to.maxX - centerX,
    minY: to.minY - minY,
    maxY: to.maxY - minY,
    minZ: to.minZ - centerZ,
    maxZ: to.maxZ - centerZ,
  };

  return {
    patch: {
      x: shape.x + offset.x,
      z: shape.z + offset.z,
      elevation,
      width,
      depth,
      height,
      size: Math.max(width, depth),
      importedMesh: {
        ...mesh,
        positions,
        normals: undefined,
        baseWidth: width,
        baseDepth: depth,
        baseHeight: height,
        triangleCount: Math.floor(positions.length / 9),
        // The stored B-rep described the surface before the deformation.
        brepStep: undefined,
      },
      edgeTreatments: undefined,
      edgeTreatmentHistory: undefined,
      edgeResizeMode: undefined,
      cadDisplayEdges: undefined,
      cadDisplayEdgesVersion: undefined,
      cadBrep: undefined,
      cadBrepFrame: undefined,
      cadPrimitiveFrame: undefined,
      threadParams: undefined,
    },
    region,
  };
}
