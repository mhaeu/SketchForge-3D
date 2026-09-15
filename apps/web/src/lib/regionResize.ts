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
 * - push: the inside moves rigidly with the face being dragged; at the face
 *   that stayed put a band of new material fills the gap, so the part gets
 *   longer without changing shape.
 *
 * In both modes the mesh is first cut along the six box faces, so the change
 * ends exactly at the box. Material outside the box keeps its shape: what
 * lies in front of a dragged face rides along with it, everything else
 * stays where it is, and wherever the moved inside parts from the outside
 * that stayed, a band of new triangles closes the seam.
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

const AXIS_OFFSET: Record<Axis, number> = { X: 0, Y: 1, Z: 2 };
const near = (a: number, b: number) => Math.abs(a - b) <= EDGE_EPSILON;

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

/**
 * Everything about a drag that does not change from one pointer move to the
 * next: the cut mesh, which triangles are inside, the seams, and the material
 * riding along in front of the moved faces. Keyed on the start positions, the
 * start region and which faces are moving - all constant for a drag - so it
 * is built once per drag.
 */
type Prepared = {
  cut: number[];
  inside: Uint8Array;
  /** Seams as triples: two vertex indices into `cut` in the order the inside triangle walks them, and the outside triangle across the edge. */
  seams: number[];
  /** Per face (axis * 2 + side): keys of inside vertices with an inside triangle lying in that face's plane. */
  inPlane: Set<string>[];
  /** Per triangle, a bit per face (1 << (axis * 2 + side)): the triangle rides along with that moved face. */
  riding: Uint8Array;
  anyRiding: boolean;
  faces: string;
};

let lastPrepared: { positions: number[]; from: ResizeRegion; faces: string; result: Prepared } | null = null;

function faceKey(maps: Record<Axis, AxisMap>) {
  return AXES.map((axis) => `${maps[axis].minMoved ? 1 : 0}${maps[axis].maxMoved ? 1 : 0}`).join("");
}

function prepare(positions: number[], from: ResizeRegion, maps: Record<Axis, AxisMap>): Prepared {
  const faces = faceKey(maps);
  if (lastPrepared && lastPrepared.positions === positions && lastPrepared.faces === faces && regionsEqual(lastPrepared.from, from)) {
    return lastPrepared.result;
  }

  let cut = positions;
  for (const axis of AXES) {
    cut = cutAlongPlane(cut, axis, from[`min${axis}`], from);
    cut = cutAlongPlane(cut, axis, from[`max${axis}`], from);
  }
  const triCount = Math.floor(cut.length / 9);
  const lo = [from.minX, from.minY, from.minZ];
  const hi = [from.maxX, from.maxY, from.maxZ];
  const key = (i: number) => `${cut[i]},${cut[i + 1]},${cut[i + 2]}`;
  const edgeKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const insideVertex = (i: number) => {
    for (let c = 0; c < 3; c += 1) {
      if (cut[i + c] < lo[c] - EDGE_EPSILON || cut[i + c] > hi[c] + EDGE_EPSILON) return false;
    }
    return true;
  };
  const onFace = (i: number, face: number) => near(cut[i + (face >> 1)], face & 1 ? hi[face >> 1] : lo[face >> 1]);

  // After the cut every triangle is wholly inside the closed box or not.
  const inside = new Uint8Array(triCount);
  for (let t = 0; t < triCount; t += 1) {
    const i = t * 9;
    inside[t] = insideVertex(i) && insideVertex(i + 3) && insideVertex(i + 6) ? 1 : 0;
  }

  // Seams: edges an inside triangle shares with an outside one. Only an
  // outside edge with both ends on the hull can be one, so those are the
  // only outside edges keyed - the rest of the outside mesh stays untouched
  // and unindexed. An edge the inside piece has to itself (an open mesh's
  // rim) is no seam: there is nothing across it to close a gap to.
  // Inside faces lying in a box plane are noted per face: a push keeps such
  // a face where it is and grows the inside away from it, instead of
  // shifting the face and leaving a step behind.
  const outsideHullEdges = new Map<string, number>();
  const insideEdges = new Map<string, number>();
  const inPlane: Set<string>[] = Array.from({ length: 6 }, () => new Set<string>());
  for (let t = 0; t < triCount; t += 1) {
    const i = t * 9;
    if (!inside[t]) {
      const hull = [insideVertex(i), insideVertex(i + 3), insideVertex(i + 6)];
      for (let e = 0; e < 3; e += 1) {
        const f = (e + 1) % 3;
        if (hull[e] && hull[f]) {
          const edge = edgeKey(key(i + e * 3), key(i + f * 3));
          if (!outsideHullEdges.has(edge)) outsideHullEdges.set(edge, t);
        }
      }
      continue;
    }
    const keys = [key(i), key(i + 3), key(i + 6)];
    for (let e = 0; e < 3; e += 1) {
      const edge = edgeKey(keys[e], keys[(e + 1) % 3]);
      insideEdges.set(edge, (insideEdges.get(edge) ?? 0) + 1);
    }
    for (let face = 0; face < 6; face += 1) {
      if (onFace(i, face) && onFace(i + 3, face) && onFace(i + 6, face)) {
        keys.forEach((k) => inPlane[face].add(k));
      }
    }
  }
  const seams: number[] = [];
  for (let t = 0; t < triCount; t += 1) {
    if (!inside[t]) continue;
    const i = t * 9;
    for (let e = 0; e < 3; e += 1) {
      const ia = i + e * 3;
      const ib = i + ((e + 1) % 3) * 3;
      const edge = edgeKey(key(ia), key(ib));
      if (insideEdges.get(edge) !== 1) continue;
      const across = outsideHullEdges.get(edge);
      if (across !== undefined) seams.push(ia, ib, across);
    }
  }

  // Riding: outside material in front of a moved face. Seeded by the outside
  // triangles across seam edges that lie in the face's plane and reach beyond
  // it - unless the edge also lies in a face that stayed put, where the
  // outside is the fixed neighbour, not something in front - then flooded
  // through the outside mesh. A face that moves inwards while its opposite
  // moves too (the box being shifted) is trailing, and nothing behind it
  // rides; a face moving on its own drags its material either way.
  const riding = new Uint8Array(triCount);
  let anyRiding = false;
  const movedFaces: number[] = [];
  const fixedFaces: number[] = [];
  AXES.forEach((axis, index) => {
    const map = maps[axis];
    const both = map.minMoved && map.maxMoved;
    if (map.minMoved && (!both || map.to[0] < map.from[0])) movedFaces.push(index * 2);
    if (map.maxMoved && (!both || map.to[1] > map.from[1])) movedFaces.push(index * 2 + 1);
    if (map.minMoved !== map.maxMoved) fixedFaces.push(map.minMoved ? index * 2 + 1 : index * 2);
  });
  const beyondFace = (t: number, face: number) => {
    const axis = face >> 1;
    const i = t * 9;
    for (let c = 0; c < 9; c += 3) {
      const v = cut[i + c + axis];
      if (face & 1 ? v > hi[axis] + EDGE_EPSILON : v < lo[axis] - EDGE_EPSILON) return true;
    }
    return false;
  };
  let outsideByKey: Map<string, number[]> | null = null;
  for (const face of movedFaces) {
    const seeds: number[] = [];
    for (let e = 0; e + 2 < seams.length; e += 3) {
      const ia = seams[e];
      const ib = seams[e + 1];
      const across = seams[e + 2];
      if (!onFace(ia, face) || !onFace(ib, face)) continue;
      if (fixedFaces.some((fixed) => onFace(ia, fixed) && onFace(ib, fixed))) continue;
      if (beyondFace(across, face)) seeds.push(across);
    }
    if (seeds.length === 0) continue;
    // The whole outside mesh is only indexed once something actually rides.
    if (!outsideByKey) {
      outsideByKey = new Map<string, number[]>();
      for (let t = 0; t < triCount; t += 1) {
        if (inside[t]) continue;
        const i = t * 9;
        for (let c = 0; c < 9; c += 3) {
          const k = key(i + c);
          const list = outsideByKey.get(k);
          if (list) list.push(t);
          else outsideByKey.set(k, [t]);
        }
      }
    }
    const bit = 1 << face;
    const queue = seeds.filter((t) => !(riding[t] & bit) && (riding[t] |= bit));
    anyRiding = anyRiding || queue.length > 0;
    while (queue.length > 0) {
      const t = queue.pop()!;
      const i = t * 9;
      for (let c = 0; c < 9; c += 3) {
        for (const other of outsideByKey.get(key(i + c)) ?? []) {
          if (!(riding[other] & bit)) {
            riding[other] |= bit;
            queue.push(other);
          }
        }
      }
    }
  }

  const result = { cut, inside, seams, inPlane, riding, anyRiding, faces };
  lastPrepared = { positions, from, faces, result };
  return result;
}

/**
 * Moves the material inside `from` so that it fills `to`. Positions are a
 * flat triangle soup in the shape's display frame; the result is a new soup
 * in the same frame, with more triangles than before where the box cut
 * through faces and where seams had to be closed.
 */
export function deformPositionsInRegion(positions: number[], from: ResizeRegion, to: ResizeRegion, mode: RegionResizeMode): number[] {
  const maps = axisMaps(from, to);
  const { cut, inside, seams, inPlane, riding, anyRiding } = prepare(positions, from, maps);
  const key = (i: number) => `${cut[i]},${cut[i + 1]},${cut[i + 2]}`;

  // Per-axis numbers for the hot loop, so mapping a vertex is arithmetic
  // and a key is only ever built for the few vertices whose fate depends on
  // their neighbours.
  const lo = AXES.map((axis) => maps[axis].from[0]);
  const hi = AXES.map((axis) => maps[axis].from[1]);
  const lo2 = AXES.map((axis) => maps[axis].to[0]);
  const hi2 = AXES.map((axis) => maps[axis].to[1]);
  const minMoved = AXES.map((axis) => maps[axis].minMoved);
  const maxMoved = AXES.map((axis) => maps[axis].maxMoved);
  const changed = AXES.map((_, c) => minMoved[c] || maxMoved[c]);
  // Shrinking has no material to insert, so a push compresses like a stretch.
  const pushes = AXES.map((_, c) => mode === "push" && changed[c] && hi2[c] - lo2[c] >= hi[c] - lo[c] - EDGE_EPSILON);
  const scale = AXES.map((_, c) => (hi2[c] - lo2[c]) / Math.max(EDGE_EPSILON, hi[c] - lo[c]));
  const shiftLo = AXES.map((_, c) => lo2[c] - lo[c]);
  const shiftHi = AXES.map((_, c) => hi2[c] - hi[c]);
  const fixedFace = AXES.map((_, c) => c * 2 + (minMoved[c] ? 1 : 0));
  const fixedAt = AXES.map((_, c) => (minMoved[c] ? hi[c] : lo[c]));

  const insideMap = (c: number, value: number, i: number) => {
    if (!changed[c]) return value;
    if (pushes[c]) {
      if (minMoved[c] && maxMoved[c]) {
        // No fixed face to insert material at: each half follows its own
        // face and the material goes in at the middle.
        return value + (value < (lo[c] + hi[c]) / 2 ? shiftLo[c] : shiftHi[c]);
      }
      if (near(value, fixedAt[c]) && inPlane[fixedFace[c]].has(key(i))) return value;
      return value + shiftLo[c] + shiftHi[c];
    }
    return lo2[c] + (value - lo[c]) * scale[c];
  };
  const outsideShift = (t: number, c: number) => {
    const mask = riding[t];
    return (mask & (1 << (c * 2)) ? shiftLo[c] : 0) + (mask & (1 << (c * 2 + 1)) ? shiftHi[c] : 0);
  };

  const out = cut.slice();
  for (let t = 0; t < inside.length; t += 1) {
    const i = t * 9;
    if (inside[t]) {
      for (let v = i; v < i + 9; v += 3) {
        for (let c = 0; c < 3; c += 1) out[v + c] = insideMap(c, cut[v + c], v);
      }
    } else if (anyRiding && riding[t]) {
      for (let c = 0; c < 3; c += 1) {
        const shift = outsideShift(t, c);
        if (shift) for (let v = i; v < i + 9; v += 3) out[v + c] += shift;
      }
    }
  }

  // Seams: where the inside parted from outside that did not follow, a band
  // sweeps the edge from its outside position to its inside one. The edge is
  // walked the way its inside triangle walks it, which keeps the band facing
  // outwards as long as the inside moved away from the outside.
  const aIn = [0, 0, 0];
  const bIn = [0, 0, 0];
  const aOut = [0, 0, 0];
  const bOut = [0, 0, 0];
  const same = (p: number[], q: number[]) => near(p[0], q[0]) && near(p[1], q[1]) && near(p[2], q[2]);
  for (let e = 0; e + 2 < seams.length; e += 3) {
    const ia = seams[e];
    const ib = seams[e + 1];
    const across = seams[e + 2];
    for (let c = 0; c < 3; c += 1) {
      aIn[c] = insideMap(c, cut[ia + c], ia);
      bIn[c] = insideMap(c, cut[ib + c], ib);
      const shift = anyRiding ? outsideShift(across, c) : 0;
      aOut[c] = cut[ia + c] + shift;
      bOut[c] = cut[ib + c] + shift;
    }
    const aMoved = !same(aIn, aOut);
    const bMoved = !same(bIn, bOut);
    if (!aMoved && !bMoved) continue;
    if (bMoved) out.push(...aOut, ...bOut, ...bIn);
    if (aMoved) out.push(...aOut, ...bIn, ...aIn);
  }
  return out;
}

// The start shape of a drag is one object for the whole drag, so its display
// positions - and with them the prepared cut, which is keyed on this array -
// are computed once per drag rather than once per pointer move.
let lastDisplay: { shape: WorkplaneShape; positions: number[] } | null = null;

function displayPositions(shape: WorkplaneShape) {
  if (lastDisplay?.shape !== shape) {
    lastDisplay = { shape, positions: resizedImportedMeshPositions(shape) };
  }
  return lastDisplay.positions;
}

/**
 * Shrinks a box onto the geometry it actually contains. The user's limits
 * may run past the mesh - a box around the top of a pyramid keeps the
 * shape's full width as its limit, while the pyramid is much narrower up
 * there - and a face floating in empty space would anchor the deformation
 * in the wrong place. Cutting along the limits first puts vertices exactly
 * where the surface meets them, so the tight box never falls short of the
 * surface either.
 */
export function tightenRegionToShape(shape: WorkplaneShape, region: ResizeRegion): ResizeRegion {
  if (!shape.importedMesh || shape.importedMesh.positions.length < 9) return region;
  let cut = resizedImportedMeshPositions(shape);
  for (const axis of AXES) {
    cut = cutAlongPlane(cut, axis, region[`min${axis}`], region);
    cut = cutAlongPlane(cut, axis, region[`max${axis}`], region);
  }
  const lo = [region.minX, region.minY, region.minZ];
  const hi = [region.maxX, region.maxY, region.maxZ];
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i + 2 < cut.length; i += 3) {
    let contained = true;
    for (let c = 0; c < 3 && contained; c += 1) {
      contained = cut[i + c] >= lo[c] - EDGE_EPSILON && cut[i + c] <= hi[c] + EDGE_EPSILON;
    }
    if (!contained) continue;
    for (let c = 0; c < 3; c += 1) {
      min[c] = Math.min(min[c], cut[i + c]);
      max[c] = Math.max(max[c], cut[i + c]);
    }
  }
  if (!min.every(Number.isFinite) || !max.every(Number.isFinite)) return region;
  const tight = {
    minX: Math.max(lo[0], min[0]), maxX: Math.min(hi[0], max[0]),
    minY: Math.max(lo[1], min[1]), maxY: Math.min(hi[1], max[1]),
    minZ: Math.max(lo[2], min[2]), maxZ: Math.min(hi[2], max[2]),
  };
  // A box too thin to hold anything is left as the user set it.
  return AXES.every((axis) => tight[`max${axis}`] - tight[`min${axis}`] >= MIN_REGION_SIZE) ? tight : region;
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
