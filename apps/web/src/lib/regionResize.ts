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

/**
 * Die Grenzen, zwischen denen die Regler des Teilbereichs laufen - dieselben
 * wie der volle Bereich, damit Regler und Kasten nie auseinanderlaufen
 * koennen.
 *
 * Gerechnet wird gegen den Koerper, **in dessen Netz der Kasten lebt**. Die
 * Eigenschaftsleiste bekommt den Koerper sonst mit seiner Urform darin - fuer
 * die Bauwerte richtig, fuer den Kasten falsch: Ein liegendes Rohr ist als
 * Netz 94 mm breit und 14 mm hoch, seine Urform aber 14 mm breit und 94 mm
 * hoch. Der Breitenregler lief dann bis 7, waehrend der Kasten bei 47 stand -
 * das Zahlenfeld zeigte die 47, und der erste Griff an den Schieber warf sie
 * weg.
 */
export function regionSliderBounds(shape: Pick<WorkplaneShape, "width" | "depth" | "size" | "height">) {
  const full = fullShapeRegion(shape);
  return [
    { axis: "length" as const, lo: "minZ" as const, hi: "maxZ" as const, min: full.minZ, max: full.maxZ },
    { axis: "width" as const, lo: "minX" as const, hi: "maxX" as const, min: full.minX, max: full.maxX },
    { axis: "height" as const, lo: "minY" as const, hi: "maxY" as const, min: full.minY, max: full.maxY },
  ];
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

// Vertices are matched by position, rounded to a ten-millionth of a
// millimetre: duplicates a rounding error apart (a tessellated cylinder's
// seam column) count as one, while anything a CAD model distinguishes stays
// distinct.
const KEY_SCALE = 1e7;
function vertexKey(positions: number[], i: number) {
  return `${Math.round(positions[i] * KEY_SCALE)},${Math.round(positions[i + 1] * KEY_SCALE)},${Math.round(positions[i + 2] * KEY_SCALE)}`;
}

function lexicallyBefore(p: number[], q: number[]) {
  return p[0] !== q[0] ? p[0] < q[0] : p[1] !== q[1] ? p[1] < q[1] : p[2] < q[2];
}
const near = (a: number, b: number) => Math.abs(a - b) <= EDGE_EPSILON;

/**
 * Splits every triangle that crosses the plane `axis = at` into pieces that
 * lie on one side only. The intersection point of an edge is computed once
 * and used by both sides, so the two halves share bit-identical vertices
 * and the seam stays watertight.
 */
function cutAlongPlane(positions: number[], axis: Axis, at: number): number[] {
  const offset = AXIS_OFFSET[axis];
  const out: number[] = [];
  const side = [0, 0, 0];
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
    // Every triangle the plane crosses is cut, not just those near the box:
    // cutting one triangle but not its neighbour across an edge would leave
    // a T-junction, and the mesh would no longer be manifold - which the
    // boolean operations downstream (grouping) insist on. The extra
    // triangles are coplanar splits and invisible.
    if (positive === 0 || negative === 0) {
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
        // The neighbouring triangle walks this edge the other way round.
        // Interpolating from a fixed end - the lexically smaller one - makes
        // both produce the same bits, which is what lets the seam between
        // them be found again later.
        const forward = lexicallyBefore(tri[i], tri[j]);
        const p = forward ? tri[i] : tri[j];
        const q = forward ? tri[j] : tri[i];
        const dp = forward ? side[i] : side[j];
        const dq = forward ? side[j] : side[i];
        const t = dp / (dp - dq);
        const point = [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
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

/**
 * Der Schluessel, unter dem die Vorbereitung liegen bleibt.
 *
 * Er muss alles nennen, woran sie haengt - und dazu gehoert die **Richtung**:
 * Wandern beide Flaechen einer Achse (der Kasten wird verschoben), dann fuehrt
 * die eine und die andere folgt, und daran entscheidet sich, welches Material
 * ausserhalb mitgenommen wird. Stand hier nur, *welche* Flaechen wandern,
 * wurde beim Umkehren der Bewegung die alte Vorbereitung weiterbenutzt: Das
 * Mitgenommene gehoerte zur alten Richtung, und wer weiter zog, als es
 * Material gab, schob den Teilbereich durch den Rest des Koerpers hindurch.
 */
function faceKey(maps: Record<Axis, AxisMap>) {
  return AXES.map((axis) => {
    const map = maps[axis];
    const min = map.minMoved ? (map.to[0] < map.from[0] ? "-" : "+") : "0";
    const max = map.maxMoved ? (map.to[1] > map.from[1] ? "+" : "-") : "0";
    return `${min}${max}`;
  }).join("");
}

function prepare(positions: number[], from: ResizeRegion, maps: Record<Axis, AxisMap>): Prepared {
  const faces = faceKey(maps);
  if (lastPrepared && lastPrepared.positions === positions && lastPrepared.faces === faces && regionsEqual(lastPrepared.from, from)) {
    return lastPrepared.result;
  }

  let cut = positions;
  for (const axis of AXES) {
    cut = cutAlongPlane(cut, axis, from[`min${axis}`]);
    cut = cutAlongPlane(cut, axis, from[`max${axis}`]);
  }
  const triCount = Math.floor(cut.length / 9);
  const lo = [from.minX, from.minY, from.minZ];
  const hi = [from.maxX, from.maxY, from.maxZ];
  const key = (i: number) => vertexKey(cut, i);
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

  // Riding: outside material in the path of a moved face. Seeded by the
  // outside triangles across seam edges lying in the face's plane whose solid
  // side sits in the face's path - probed a hair inside the surface, it has to
  // lie in front of the face and within the face's footprint. That takes a
  // block stacked on the box, or a lid resting on it, and leaves out what
  // merely touches the seam from beside or below: the pyramid's base under a
  // box around its tip, the bottle's shoulder beside its neck. From the seeds
  // the ride floods through the outside mesh. A face that moves inwards while
  // its opposite moves too (the box being shifted) is trailing, and nothing
  // behind it rides; a face moving on its own drags its material either way.
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
  const probeDepth = Math.max(1e-4, 1e-3 * Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]));
  const probeTolerance = probeDepth * 1e-3;
  const solidInPath = (t: number, ia: number, ib: number, face: number) => {
    const i = t * 9;
    const ux = cut[i + 3] - cut[i];
    const uy = cut[i + 4] - cut[i + 1];
    const uz = cut[i + 5] - cut[i + 2];
    const vx = cut[i + 6] - cut[i];
    const vy = cut[i + 7] - cut[i + 1];
    const vz = cut[i + 8] - cut[i + 2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const length = Math.hypot(nx, ny, nz);
    if (length < 1e-12) return false;
    const probe = [
      (cut[ia] + cut[ib]) / 2 - (nx / length) * probeDepth,
      (cut[ia + 1] + cut[ib + 1]) / 2 - (ny / length) * probeDepth,
      (cut[ia + 2] + cut[ib + 2]) / 2 - (nz / length) * probeDepth,
    ];
    const axis = face >> 1;
    if (face & 1 ? probe[axis] < hi[axis] - probeTolerance : probe[axis] > lo[axis] + probeTolerance) return false;
    for (let c = 0; c < 3; c += 1) {
      if (c !== axis && (probe[c] < lo[c] - probeTolerance || probe[c] > hi[c] + probeTolerance)) return false;
    }
    return true;
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
      if (solidInPath(across, ia, ib, face)) seeds.push(across);
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
  const key = (i: number) => vertexKey(cut, i);

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
        // face and the material goes in at the middle. Vertices on the
        // middle plane all go with the upper half - meshes carry duplicate
        // vertices a rounding error apart there (a cylinder's seam column
        // at x = 0 and x = -2e-16), and splitting them would tear the mesh.
        return value + (value < (lo[c] + hi[c]) / 2 - EDGE_EPSILON ? shiftLo[c] : shiftHi[c]);
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

  return assembleDeformedMesh(
    cut,
    inside,
    seams,
    riding,
    anyRiding,
    lo,
    hi,
    [...lo, ...hi, ...lo2, ...hi2],
    insideMap,
    outsideShift,
  );
}

/**
 * Aus dem geschnittenen Netz das verformte machen: innen die uebergebene
 * Abbildung, aussen das mitgenommene Material, und dazwischen die Baender,
 * die die entstandene Luecke schliessen.
 *
 * Die Abbildung kommt von aussen, weil zweierlei damit gemacht wird: das
 * Aendern des Kastens verschiebt und streckt achsenweise, das Verjuengen
 * neigt die Seiten ueber die Hoehe. Schneiden, Nahtsuche und Baender sind in
 * beiden Faellen dieselbe Arbeit - und die heikelste im ganzen Programm,
 * also gibt es sie nur einmal.
 *
 * `insideMap` bekommt die Achse, den Wert und den Punktindex im
 * geschnittenen Netz; ueber den Index kommt sie an alle drei
 * Ausgangskoordinaten heran, wenn ihre Abbildung sie braucht.
 */
function assembleDeformedMesh(
  cut: number[],
  inside: Uint8Array,
  seams: number[],
  riding: Uint8Array,
  anyRiding: boolean,
  lo: number[],
  hi: number[],
  planeValues: number[],
  insideMap: (axis: number, value: number, index: number) => number,
  outsideShift: (triangle: number, axis: number) => number,
): number[] {
  const aIn = [0, 0, 0];
  const bIn = [0, 0, 0];
  const cIn = [0, 0, 0];
  const aOut = [0, 0, 0];
  const bOut = [0, 0, 0];
  const same = (p: number[], q: number[]) => near(p[0], q[0]) && near(p[1], q[1]) && near(p[2], q[2]);
  const mapInside = (i: number, target: number[]) => {
    for (let c = 0; c < 3; c += 1) target[c] = insideMap(c, cut[i + c], i);
  };
  const mapOutside = (i: number, across: number, target: number[]) => {
    for (let c = 0; c < 3; c += 1) target[c] = cut[i + c] + (anyRiding ? outsideShift(across, c) : 0);
  };

  // A seam whose inside face grows within its own plane out past the
  // outside edge (a ledge left by an earlier drag, stretched further) must
  // not get a band: the band would lie in that plane and double the face.
  // The outside edge follows the inside edge instead - every outside copy
  // of those two vertices moves onto the inside position, and the outside
  // face adjoining them stretches to keep up.
  const outsideOverride = new Map<string, number[]>();
  for (let e = 0; e + 2 < seams.length; e += 3) {
    const ia = seams[e];
    const ib = seams[e + 1];
    mapInside(ia, aIn);
    mapInside(ib, bIn);
    mapOutside(ia, seams[e + 2], aOut);
    mapOutside(ib, seams[e + 2], bOut);
    if (same(aIn, aOut) && same(bIn, bOut)) continue;
    const triangle = Math.floor(ia / 9) * 9;
    mapInside(triangle + (((ia - triangle) / 3 + 2) % 3) * 3, cIn);
    if (growsPastEdge(aIn, bIn, cIn, aOut, bOut)) {
      outsideOverride.set(vertexKey(cut, ia), aIn.slice());
      outsideOverride.set(vertexKey(cut, ib), bIn.slice());
    }
  }
  const overridden = (i: number) => {
    if (outsideOverride.size === 0) return null;
    // Only a hull vertex can be one of the overridden ones.
    for (let c = 0; c < 3; c += 1) {
      if (cut[i + c] < lo[c] - EDGE_EPSILON || cut[i + c] > hi[c] + EDGE_EPSILON) return null;
    }
    return outsideOverride.get(vertexKey(cut, i)) ?? null;
  };

  const out = cut.slice();
  for (let t = 0; t < inside.length; t += 1) {
    const i = t * 9;
    if (inside[t]) {
      for (let v = i; v < i + 9; v += 3) {
        for (let c = 0; c < 3; c += 1) out[v + c] = insideMap(c, cut[v + c], v);
      }
      continue;
    }
    if (anyRiding && riding[t]) {
      for (let c = 0; c < 3; c += 1) {
        const shift = outsideShift(t, c);
        if (shift) for (let v = i; v < i + 9; v += 3) out[v + c] += shift;
      }
    }
    for (let v = i; v < i + 9; v += 3) {
      const override = overridden(v);
      if (override) for (let c = 0; c < 3; c += 1) out[v + c] = override[c];
    }
  }

  // Seams: where the inside parted from outside that did not follow, a band
  // sweeps the edge from its outside position to its inside one. The edge is
  // walked the way its inside triangle walks it, which keeps the band facing
  // outwards as long as the inside moved away from the outside.
  let slid = false;
  for (let e = 0; e + 2 < seams.length; e += 3) {
    const ia = seams[e];
    const ib = seams[e + 1];
    const across = seams[e + 2];
    mapInside(ia, aIn);
    mapInside(ib, bIn);
    mapOutside(ia, across, aOut);
    mapOutside(ib, across, bOut);
    const aOverride = overridden(ia);
    const bOverride = overridden(ib);
    if (aOverride) for (let c = 0; c < 3; c += 1) aOut[c] = aOverride[c];
    if (bOverride) for (let c = 0; c < 3; c += 1) bOut[c] = bOverride[c];
    const aMoved = !same(aIn, aOut);
    const bMoved = !same(bIn, bOut);
    if (!aMoved && !bMoved) continue;
    // An edge that slid along its own line (the box shrinking along the
    // edge) spans no area. Its neighbour across is then left with an edge
    // the inside only partly walks, which the stitch below repairs; a band
    // with area needs no such thing.
    if (bMoved) {
      if (collinear(aOut, bOut, bIn)) slid = true;
      else out.push(...aOut, ...bOut, ...bIn);
    }
    if (aMoved) {
      if (collinear(aOut, bIn, aIn)) slid = true;
      else out.push(...aOut, ...bIn, ...aIn);
    }
  }
  const planes = planeValues.map((value, index) => ({ axis: index % 3, at: value }));
  // The stitch only ever repairs what a seam sliding along its own line
  // leaves behind. Run more widely it would split band edges at vertices of
  // neighbouring bands that merely happen to lie on them - where a rigid
  // in-plane shift folds the bands at the points the old and new outline
  // cross - and tear open what was closed.
  return stitchPlaneSeams(weldNearPlanes(out, planes).positions, planes, slid);
}

export type RegionSideValues = { left: number; right: number; front: number; back: number };

/**
 * Die Verjuengung auf den Kasten legen - und nur auf ihn.
 *
 * `edges` sind die vier Kanten der Deckflaeche des Kastens, in mm von dessen
 * Mitte aus; `heights` ist der Anteil der Kastenhoehe, den er an jeder Seite
 * noch stehen laesst. Innerhalb des Kastens waechst die Neigung von null an
 * seiner Unterkante auf ihr volles Mass an seiner Oberkante; ausserhalb
 * bleibt alles, wo es ist, und die Luecke dazwischen schliessen dieselben
 * Baender wie beim Aendern des Kastens.
 *
 * Es zaehlt also der ganze Kasten und nicht nur seine Hoehe: Wer nur ein
 * Stueck der Laenge verjuengt, bekommt an dessen Ende eine senkrechte Wand -
 * und genau die soll dort ja stehen.
 */
export function taperPositionsInRegion(
  positions: number[],
  region: ResizeRegion,
  edges: RegionSideValues,
  heights: RegionSideValues,
): number[] {
  // Dem Schnitt wird gesagt, dass alle sechs Flaechen betroffen sind, damit
  // ueberall getrennt wird; bewegt wird dabei keine - Kasten hin, Kasten her.
  const maps = axisMaps(region, region);
  for (const axis of AXES) {
    maps[axis].minMoved = true;
    maps[axis].maxMoved = true;
  }
  const { cut, inside, seams, riding, anyRiding } = prepare(positions, region, maps);
  const lo = [region.minX, region.minY, region.minZ];
  const hi = [region.maxX, region.maxY, region.maxZ];
  const centre = [(lo[0] + hi[0]) / 2, 0, (lo[2] + hi[2]) / 2];
  const span = [
    Math.max(MIN_REGION_SIZE, hi[0] - lo[0]),
    Math.max(MIN_REGION_SIZE, hi[1] - lo[1]),
    Math.max(MIN_REGION_SIZE, hi[2] - lo[2]),
  ];
  const topSpan = [Math.max(0, edges.right - edges.left), 0, Math.max(0, edges.back - edges.front)];
  const topShift = [(edges.left + edges.right) / 2, 0, (edges.front + edges.back) / 2];
  const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

  const insideMap = (axis: number, value: number, index: number) => {
    const t = clamp01((cut[index + 1] - lo[1]) / span[1]);
    if (axis === 1) {
      const u = clamp01((cut[index] - lo[0]) / span[0]);
      const v = clamp01((cut[index + 2] - lo[2]) / span[2]);
      const alongWidth = heights.left + (heights.right - heights.left) * u;
      const alongDepth = heights.front + (heights.back - heights.front) * v;
      return lo[1] + (value - lo[1]) * Math.max(0, alongWidth + alongDepth - 1);
    }
    const scale = 1 + (topSpan[axis] / span[axis] - 1) * t;
    return centre[axis] + (value - centre[axis]) * scale + topShift[axis] * t;
  };

  return assembleDeformedMesh(cut, inside, seams, riding, anyRiding, lo, hi, [...lo, ...hi, ...lo, ...hi], insideMap, () => 0);
}

/**
 * Snaps vertices that lie within a hair of each other onto one position -
 * but only around the box planes, where cuts made in different drags meet:
 * the same corner point reached along different edges comes out a few
 * hundred-thousandths apart, which is far more than the seam matching
 * tolerates and far less than anything a model distinguishes. Triangles
 * that collapse in the process are dropped.
 */
function weldNearPlanes(positions: number[], planes: Array<{ axis: number; at: number }>, tolerance = 1e-4): { positions: number[]; changed: boolean } {
  const planeValues: number[][] = [[], [], []];
  planes.forEach((plane) => planeValues[plane.axis].push(plane.at));
  const nearPlane = (i: number) => {
    for (let axis = 0; axis < 3; axis += 1) {
      const values = planeValues[axis];
      const v = positions[i + axis];
      for (let k = 0; k < values.length; k += 1) {
        if (v >= values[k] - tolerance && v <= values[k] + tolerance) return true;
      }
    }
    return false;
  };
  // Cells of one tolerance; a vertex is compared with the cells on the side
  // of its own it is closest to, which covers everything within tolerance.
  const cells = new Map<number, number[][]>();
  const cellHash = (x: number, y: number, z: number) => (x * 73856093) ^ (y * 19349663) ^ (z * 83492791);
  const out = positions.slice();
  const touched = new Set<number>();
  for (let i = 0; i + 2 < positions.length; i += 3) {
    if (!nearPlane(i)) continue;
    const px = positions[i];
    const py = positions[i + 1];
    const pz = positions[i + 2];
    const fx = px / tolerance;
    const fy = py / tolerance;
    const fz = pz / tolerance;
    const cx = Math.floor(fx);
    const cy = Math.floor(fy);
    const cz = Math.floor(fz);
    const sx = fx - cx < 0.5 ? -1 : 1;
    const sy = fy - cy < 0.5 ? -1 : 1;
    const sz = fz - cz < 0.5 ? -1 : 1;
    let representative: number[] | null = null;
    for (let dx = 0; dx <= 1 && !representative; dx += 1) {
      for (let dy = 0; dy <= 1 && !representative; dy += 1) {
        for (let dz = 0; dz <= 1 && !representative; dz += 1) {
          const bucket = cells.get(cellHash(cx + dx * sx, cy + dy * sy, cz + dz * sz));
          if (!bucket) continue;
          for (const candidate of bucket) {
            if (Math.abs(candidate[0] - px) <= tolerance && Math.abs(candidate[1] - py) <= tolerance && Math.abs(candidate[2] - pz) <= tolerance) {
              representative = candidate;
              break;
            }
          }
        }
      }
    }
    if (representative) {
      if (representative[0] !== px || representative[1] !== py || representative[2] !== pz) {
        out[i] = representative[0];
        out[i + 1] = representative[1];
        out[i + 2] = representative[2];
        touched.add(Math.floor(i / 9));
      }
      continue;
    }
    const hash = cellHash(cx, cy, cz);
    const bucket = cells.get(hash);
    const point = [px, py, pz];
    if (bucket) bucket.push(point);
    else cells.set(hash, [point]);
  }
  if (touched.size === 0) return { positions: out, changed: false };
  // A triangle that lost a corner to the weld may have collapsed.
  const dropped = new Set<number>();
  touched.forEach((t) => {
    const i = t * 9;
    if (collinear(out.slice(i, i + 3), out.slice(i + 3, i + 6), out.slice(i + 6, i + 9))) dropped.add(t);
  });
  if (dropped.size === 0) return { positions: out, changed: true };
  const kept: number[] = [];
  for (let i = 0; i + 8 < out.length; i += 9) {
    if (dropped.has(i / 9)) continue;
    for (let k = 0; k < 9; k += 1) kept.push(out[i + k]);
  }
  return { positions: kept, changed: true };
}

/**
 * Whether the inside triangle (a, b, c), with a-b the seam edge, has grown
 * within its own plane out past where the edge used to be: the displacement
 * of the edge lies in the triangle's plane and points away from c.
 */
function growsPastEdge(a: number[], b: number[], c: number[], aOld: number[], bOld: number[]) {
  const ex = b[0] - a[0];
  const ey = b[1] - a[1];
  const ez = b[2] - a[2];
  const nx = ey * (c[2] - a[2]) - ez * (c[1] - a[1]);
  const ny = ez * (c[0] - a[0]) - ex * (c[2] - a[2]);
  const nz = ex * (c[1] - a[1]) - ey * (c[0] - a[0]);
  const normalLength = Math.hypot(nx, ny, nz);
  if (normalLength < 1e-12) return false;
  let outward = false;
  for (const [p, old] of [[a, aOld], [b, bOld]] as const) {
    const dx = p[0] - old[0];
    const dy = p[1] - old[1];
    const dz = p[2] - old[2];
    const length = Math.hypot(dx, dy, dz);
    if (length <= EDGE_EPSILON) continue;
    // In the plane?
    if (Math.abs(dx * nx + dy * ny + dz * nz) > EDGE_EPSILON * length * normalLength) return false;
    // Away from c: the edge swept by the displacement faces the other way
    // than the triangle does.
    const sx = ey * dz - ez * dy;
    const sy = ez * dx - ex * dz;
    const sz = ex * dy - ey * dx;
    if (sx * nx + sy * ny + sz * nz < 0) outward = true;
    else return false;
  }
  return outward;
}

function collinear(a: number[], b: number[], c: number[]) {
  const ux = b[0] - a[0];
  const uy = b[1] - a[1];
  const uz = b[2] - a[2];
  const vx = c[0] - a[0];
  const vy = c[1] - a[1];
  const vz = c[2] - a[2];
  const cross = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
  return cross <= EDGE_EPSILON * Math.max(1, Math.hypot(ux, uy, uz));
}

/**
 * Splits triangle edges at vertices that lie on them. A seam edge that
 * shrinks along its own line leaves the outside neighbour with an edge that
 * the inside now only partly walks - a T-junction, which is closed
 * geometrically but not topologically, and the booleans downstream reject.
 * Seams lie in the planes of the old and new box, so only edges and
 * vertices in those planes are examined, plane by plane.
 */
function stitchPlaneSeams(positions: number[], planes: Array<{ axis: number; at: number }>, needed: boolean): number[] {
  if (!needed) return positions;
  type Vertex = { x: number; y: number; z: number };
  const triangleCount = Math.floor(positions.length / 9);
  const unique = planes.filter((plane, index) => planes.findIndex((other) => other.axis === plane.axis && near(other.at, plane.at)) === index);
  const planeValues: number[][] = [[], [], []];
  unique.forEach((plane) => planeValues[plane.axis].push(plane.at));

  // One pass over the mesh: which planes each vertex lies in (a bit per
  // plane), from which follows which triangles have an edge in one. Only
  // those can need a split; the rest is passed through untouched.
  const vertexPlanes = new Uint16Array(positions.length / 3);
  for (let v = 0, i = 0; i + 2 < positions.length; v += 1, i += 3) {
    let bits = 0;
    for (let axis = 0; axis < 3; axis += 1) {
      const values = planeValues[axis];
      for (let k = 0; k < values.length; k += 1) {
        if (near(positions[i + axis], values[k])) bits |= 1 << unique.findIndex((plane) => plane.axis === axis && plane.at === values[k]);
      }
    }
    vertexPlanes[v] = bits;
  }
  const out: number[] = [];
  let triangles: number[][] = [];
  for (let t = 0; t < triangleCount; t += 1) {
    const a = vertexPlanes[t * 3];
    const b = vertexPlanes[t * 3 + 1];
    const c = vertexPlanes[t * 3 + 2];
    if ((a & b) || (b & c) || (c & a)) triangles.push(positions.slice(t * 9, t * 9 + 9));
    else for (let k = t * 9; k < t * 9 + 9; k += 1) out.push(positions[k]);
  }
  if (triangles.length === 0) return positions;

  for (const plane of unique) {
    const u = (plane.axis + 1) % 3;
    const v = (plane.axis + 2) % 3;
    // Vertices in this plane, sorted along u so an edge only looks at the
    // vertices within its own u-range.
    const bit = 1 << unique.indexOf(plane);
    const vertexKeys = new Set<string>();
    const vertices: Vertex[] = [];
    for (let v = 0, t = 0; t + 2 < positions.length; v += 1, t += 3) {
      if (!(vertexPlanes[v] & bit)) continue;
      const key = vertexKey(positions, t);
      if (vertexKeys.has(key)) continue;
      vertexKeys.add(key);
      vertices.push({ x: positions[t], y: positions[t + 1], z: positions[t + 2] });
    }
    if (vertices.length < 3) continue;
    const coord = (vertex: Vertex, axis: number) => (axis === 0 ? vertex.x : axis === 1 ? vertex.y : vertex.z);
    vertices.sort((p, q) => coord(p, u) - coord(q, u));
    const us = vertices.map((vertex) => coord(vertex, u));
    const lowerBound = (value: number) => {
      let low = 0;
      let high = us.length;
      while (low < high) {
        const mid = (low + high) >> 1;
        if (us[mid] < value) low = mid + 1;
        else high = mid;
      }
      return low;
    };

    const next: number[][] = [];
    const queue = triangles;
    while (queue.length > 0) {
      const tri = queue.pop()!;
      let split = false;
      for (let e = 0; e < 3 && !split; e += 1) {
        const ia = e * 3;
        const ib = ((e + 1) % 3) * 3;
        const ic = ((e + 2) % 3) * 3;
        if (!near(tri[ia + plane.axis], plane.at) || !near(tri[ib + plane.axis], plane.at)) continue;
        const au = tri[ia + u];
        const av = tri[ia + v];
        const bu = tri[ib + u];
        const bv = tri[ib + v];
        const du = bu - au;
        const dv = bv - av;
        const length2 = du * du + dv * dv;
        if (length2 <= EDGE_EPSILON * EDGE_EPSILON) continue;
        const uMin = Math.min(au, bu);
        const uMax = Math.max(au, bu);
        // The interior vertex nearest to a, so the split is done one at a
        // time in order along the edge; the pieces are queued again.
        let bestT = Number.POSITIVE_INFINITY;
        let best: Vertex | null = null;
        for (let k = lowerBound(uMin - EDGE_EPSILON); k < vertices.length && us[k] <= uMax + EDGE_EPSILON; k += 1) {
          const pu = coord(vertices[k], u);
          const pv = coord(vertices[k], v);
          const cross = Math.abs(du * (pv - av) - dv * (pu - au));
          if (cross > EDGE_EPSILON * Math.sqrt(length2)) continue;
          const t = (du * (pu - au) + dv * (pv - av)) / length2;
          if (t <= 1e-9 || t >= 1 - 1e-9) continue;
          if (t < bestT) {
            bestT = t;
            best = vertices[k];
          }
        }
        if (!best) continue;
        const p = [best.x, best.y, best.z];
        const a = tri.slice(ia, ia + 3);
        const b = tri.slice(ib, ib + 3);
        const c = tri.slice(ic, ic + 3);
        queue.push([...a, ...p, ...c], [...p, ...b, ...c]);
        split = true;
      }
      if (!split) next.push(tri);
    }
    triangles = next;
  }

  for (const tri of triangles) {
    if (collinear(tri.slice(0, 3), tri.slice(3, 6), tri.slice(6, 9))) continue;
    for (let i = 0; i < 9; i += 1) out.push(tri[i]);
  }
  return out;
}

// The start shape of a drag is one object for the whole drag, so its display
// positions - and with them the prepared cut, which is keyed on this array -
// are computed once per drag rather than once per pointer move.
let lastDisplay: { shape: WorkplaneShape; positions: number[] } | null = null;

export function displayPositions(shape: WorkplaneShape) {
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
    cut = cutAlongPlane(cut, axis, region[`min${axis}`]);
    cut = cutAlongPlane(cut, axis, region[`max${axis}`]);
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
      /*
       * Der parametrische Ursprung beschreibt diesen Koerper nicht mehr.
       * Er wird beim Umwandeln in ein Netz festgehalten, damit sich eine
       * Drehung spaeter wieder aufheben laesst - sobald aber das Netz selbst
       * umgebaut ist, wuerde ein Neubau daraus die ganze Arbeit am
       * Teilbereich stillschweigend wegwerfen, sobald jemand irgendeinen
       * Bauwert anfasst.
       */
      parametricSource: undefined,
    },
    region,
  };
}
