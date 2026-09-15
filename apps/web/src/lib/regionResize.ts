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
 * Either way, nothing outside the box moves: the mesh is cut along the box
 * faces the change ends at, so the change stops exactly there.
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
};

function axisMaps(from: ResizeRegion, to: ResizeRegion): Record<Axis, AxisMap> {
  const maps = {} as Record<Axis, AxisMap>;
  for (const axis of AXES) {
    const a = from[`min${axis}`];
    const b = from[`max${axis}`];
    const a2 = to[`min${axis}`];
    const b2 = to[`max${axis}`];
    maps[axis] = {
      from: [a, b],
      to: [a2, b2],
      minMoved: Math.abs(a2 - a) > EDGE_EPSILON,
      maxMoved: Math.abs(b2 - b) > EDGE_EPSILON,
    };
  }
  return maps;
}

/**
 * Whether a coordinate counts as inside the box for the purpose of moving.
 * A face that stayed put is where the deformation ends, so a row lying
 * exactly on it belongs to the outside; a face that moved carries its row
 * along. On axes that did not change the interval is closed - the box may
 * sit exactly on the surface there (a box around a neck), and that surface
 * has to move.
 */
function movesAlong(value: number, map: AxisMap) {
  const [a, b] = map.from;
  const changed = map.minMoved || map.maxMoved;
  const aboveMin = !changed || map.minMoved ? value >= a - EDGE_EPSILON : value > a + EDGE_EPSILON;
  const belowMax = !changed || map.maxMoved ? value <= b + EDGE_EPSILON : value < b - EDGE_EPSILON;
  return aboveMin && belowMax;
}

/** Strictly beyond a face the mesh was cut along - i.e. outside for good. */
function beyondCutFace(value: number, map: AxisMap) {
  const [a, b] = map.from;
  return (!map.minMoved && value < a - EDGE_EPSILON) || (!map.maxMoved && value > b + EDGE_EPSILON);
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

const AXIS_OFFSET: Record<Axis, number> = { X: 0, Y: 1, Z: 2 };

/**
 * Splits every triangle that crosses the plane `axis = at` into pieces that
 * lie on one side only. The intersection point of an edge is computed once
 * and used by both sides, so the two halves share bit-identical vertices
 * and the seam stays watertight.
 */
function cutAlongPlane(positions: number[], axis: Axis, at: number, box: ResizeRegion): number[] {
  const offset = AXIS_OFFSET[axis];
  const out: number[] = [];
  const side = [0, 0, 0];
  const lo = [box.minX, box.minY, box.minZ];
  const hi = [box.maxX, box.maxY, box.maxZ];
  const pushPolygon = (polygon: number[][]) => {
    for (let i = 1; i + 1 < polygon.length; i += 1) {
      out.push(polygon[0][0], polygon[0][1], polygon[0][2], polygon[i][0], polygon[i][1], polygon[i][2], polygon[i + 1][0], polygon[i + 1][1], polygon[i + 1][2]);
    }
  };
  for (let index = 0; index + 8 < positions.length; index += 9) {
    let positive = 0;
    let negative = 0;
    for (let i = 0; i < 3; i += 1) {
      const d = positions[index + i * 3 + offset] - at;
      side[i] = Math.abs(d) <= EDGE_EPSILON ? 0 : d;
      if (side[i] > 0) positive += 1;
      if (side[i] < 0) negative += 1;
    }
    // A triangle that never reaches the box has nothing inside it to part
    // from, so the plane is left to run through it uncut - fewer triangles,
    // and the same surface.
    let touchesBox = positive > 0 && negative > 0;
    for (let c = 0; c < 3 && touchesBox; c += 1) {
      const v0 = positions[index + c];
      const v1 = positions[index + 3 + c];
      const v2 = positions[index + 6 + c];
      touchesBox = Math.max(v0, v1, v2) >= lo[c] - EDGE_EPSILON && Math.min(v0, v1, v2) <= hi[c] + EDGE_EPSILON;
    }
    if (!touchesBox) {
      for (let i = 0; i < 9; i += 1) out.push(positions[index + i]);
      continue;
    }
    // Sutherland-Hodgman against both half-spaces at once, keeping the
    // triangle's winding.
    const tri = [positions.slice(index, index + 3), positions.slice(index + 3, index + 6), positions.slice(index + 6, index + 9)];
    const above: number[][] = [];
    const below: number[][] = [];
    for (let i = 0; i < 3; i += 1) {
      const j = (i + 1) % 3;
      if (side[i] >= 0) above.push(tri[i]);
      if (side[i] <= 0) below.push(tri[i]);
      if ((side[i] > 0 && side[j] < 0) || (side[i] < 0 && side[j] > 0)) {
        const t = side[i] / (side[i] - side[j]);
        const point = [
          tri[i][0] + (tri[j][0] - tri[i][0]) * t,
          tri[i][1] + (tri[j][1] - tri[i][1]) * t,
          tri[i][2] + (tri[j][2] - tri[i][2]) * t,
        ];
        point[offset] = at;
        above.push(point);
        below.push(point);
      }
    }
    pushPolygon(above);
    pushPolygon(below);
  }
  return out;
}

// The cut depends only on the start region and on which faces are moving,
// both constant for the length of a drag, while the deformation runs on every
// pointer move. One remembered result turns the six passes over the mesh into
// a lookup for all but the first move.
let lastCut: { positions: number[]; from: ResizeRegion; faces: string; result: number[] } | null = null;

function cutForRegion(positions: number[], from: ResizeRegion, maps: Record<Axis, AxisMap>): number[] {
  const faces = AXES.map((axis) => `${maps[axis].minMoved ? 1 : 0}${maps[axis].maxMoved ? 1 : 0}`).join("");
  if (lastCut && lastCut.positions === positions && lastCut.faces === faces && regionsEqual(lastCut.from, from)) {
    return lastCut.result;
  }
  let cut = positions;
  for (const axis of AXES) {
    const map = maps[axis];
    if (!map.minMoved) cut = cutAlongPlane(cut, axis, map.from[0], from);
    if (!map.maxMoved) cut = cutAlongPlane(cut, axis, map.from[1], from);
  }
  lastCut = { positions, from, faces, result: cut };
  return cut;
}

/**
 * Moves the material inside `from` so that it fills `to`, leaving everything
 * outside exactly as it was. Positions are a flat triangle soup in the
 * shape's display frame; the result is a new soup in the same frame, with
 * more triangles than before where the box cut through faces.
 *
 * The mesh is first cut along every box face the deformation ends at - the
 * faces that stayed put, and both faces of an axis that did not change - so
 * the change stops exactly at the box instead of running on to the next
 * vertex beyond it. A face that moved is not cut: whatever lies beyond it
 * stays attached through the triangles that cross it, which stretch.
 *
 * A vertex on the box hull that is shared with a triangle outside the box is
 * pinned, so the outside triangle keeps its shape; the inside triangle next
 * to it stretches instead. A hull vertex with no outside neighbour - the box
 * sits on the surface there - moves with the inside.
 */
export function deformPositionsInRegion(positions: number[], from: ResizeRegion, to: ResizeRegion, mode: RegionResizeMode): number[] {
  const maps = axisMaps(from, to);
  const cut = cutForRegion(positions, from, maps);

  // Only a vertex that could move needs a pin, and only an outside triangle
  // can pin one - so keys are built for the hull vertices of outside
  // triangles alone, not for the whole mesh.
  const candidate = (i: number) => movesAlong(cut[i], maps.X) && movesAlong(cut[i + 1], maps.Y) && movesAlong(cut[i + 2], maps.Z);
  const pinned = new Set<string>();
  const key = (i: number) => `${cut[i]},${cut[i + 1]},${cut[i + 2]}`;
  for (let index = 0; index + 8 < cut.length; index += 9) {
    let outside = false;
    for (let corner = index; corner < index + 9 && !outside; corner += 3) {
      outside = beyondCutFace(cut[corner], maps.X) || beyondCutFace(cut[corner + 1], maps.Y) || beyondCutFace(cut[corner + 2], maps.Z);
    }
    if (!outside) continue;
    for (let corner = index; corner < index + 9; corner += 3) {
      if (candidate(corner)) pinned.add(key(corner));
    }
  }

  const next = cut.slice();
  for (let index = 0; index + 2 < cut.length; index += 3) {
    if (!candidate(index) || (pinned.size > 0 && pinned.has(key(index)))) continue;
    next[index] = mapped(cut[index], maps.X, mode);
    next[index + 1] = mapped(cut[index + 1], maps.Y, mode);
    next[index + 2] = mapped(cut[index + 2], maps.Z, mode);
  }
  return next;
}

// The start shape of a drag is one object for the whole drag, so its display
// positions - and with them the cut, which is keyed on this array - are
// computed once per drag rather than once per pointer move.
let lastDisplay: { shape: WorkplaneShape; positions: number[] } | null = null;

function displayPositions(shape: WorkplaneShape) {
  if (lastDisplay?.shape !== shape) {
    lastDisplay = { shape, positions: resizedImportedMeshPositions(shape) };
  }
  return lastDisplay.positions;
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

  const positions = deformPositionsInRegion(displayPositions(shape), from, to, mode);
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
