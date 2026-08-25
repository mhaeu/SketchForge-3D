/**
 * threadGenerator.ts
 *
 * Parametric thread mesh generator (ISO metric, 60° flank angle).
 *
 * Produces a watertight (manifold) triangle mesh by a helical sweep of a
 * thread profile. Intentionally dependency-free - neither Three.js nor Manifold -
 * so the module is testable in isolation and fits into any pipeline.
 *
 * Used as a solid -> screw / bolt (external thread)
 * Used as a "hole" -> nut / tapped hole (internal thread), then cut from the
 *                       target body via boolean difference.
 *
 * Lizenz: MIT
 */

// ---------------------------------------------------------------------------
// Typen
// ---------------------------------------------------------------------------

export type ThreadKind = 'external' | 'internal';

export interface ThreadParams {
  /** Nominal diameter d in mm (e.g. 8 for M8). */
  diameter: number;
  /** Pitch P in mm (e.g. 1.25 for M8 coarse thread). */
  pitch: number;
  /** Thread length in mm (Z axis). */
  length: number;
  /**
   * 'external' = bolt/screw (material outside the core).
   * 'internal' = tapped hole/nut - produces the CUTTER BODY,
   *              that is subtracted from a solid.
   */
  kind: ThreadKind;
  /**
   * Manufacturing clearance in mm (diameter-based, applied at half the value
   * radially). For FDM printing typically 0.2-0.4. Default 0.
   * external: shrinks the thread. internal: enlarges the cutter.
   */
  clearance?: number;
  /** Circumferential segments per turn. Default 48. More = smoother, costlier. */
  segments?: number;
  /**
   * Number of turns over which the profile fades out at the ends (lead-in),
   * so the screw threads in easily. Default 1.
   * 0 = harte Kante am Ende.
   */
  taperTurns?: number;
  /**
   * external only: also generate the core cylinder so a complete bolt
   * results. Default true.
   */
  includeCore?: boolean;
  /** Resolution of the profile cross-section (points per turn). Default 8. */
  profilePoints?: number;
}

export interface ThreadMesh {
  /** Flat array [x,y,z, x,y,z, ...] in mm. */
  vertices: Float32Array;
  /** Flat array of triangle indices, CCW as seen from outside. */
  indices: Uint32Array;
  /** Diagnostic info for UI/tests. */
  info: {
    triangleCount: number;
    vertexCount: number;
    majorDiameter: number;
    minorDiameter: number;
    pitchDiameter: number;
    turns: number;
  };
}

// ---------------------------------------------------------------------------
// ISO 68-1 / ISO 261 Geometrie
// ---------------------------------------------------------------------------

/**
 * Basic profile per ISO 68-1: equilateral triangle, 60 deg flank angle.
 * H = height of the theoretical sharp-V triangle = P * sqrt(3)/2.
 *
 * Actually truncated:
 *   Major diameter (major) = d
 *   Minor diameter (minor) = d - 2 * (5/8) * H   [bolt]
 *   Pitch diameter (pitch) = d - 2 * (3/8) * H
 */
function isoGeometry(diameter: number, pitch: number) {
  const H = (pitch * Math.sqrt(3)) / 2;
  return {
    H,
    majorR: diameter / 2,
    minorR: diameter / 2 - (5 / 8) * H,
    pitchR: diameter / 2 - (3 / 8) * H,
  };
}

/**
 * Thread tables for the UI.
 *
 * ISO_COARSE  - metric coarse thread (ISO 261), M1 to M64
 * ISO_FINE    - metric fine thread, common combinations
 * UNIFIED     - Unified inch thread UNC/UNF (ASME B1.1), pitch derived from TPI
 *
 * All values in millimeters. For inch threads, pitch = 25.4 / TPI.
 */
export type ThreadSpec = { diameter: number; pitch: number };

export const ISO_COARSE: Record<string, ThreadSpec> = {
  M1: { diameter: 1, pitch: 0.25 },
  "M1.2": { diameter: 1.2, pitch: 0.25 },
  "M1.6": { diameter: 1.6, pitch: 0.35 },
  M2: { diameter: 2, pitch: 0.4 },
  "M2.5": { diameter: 2.5, pitch: 0.45 },
  M3: { diameter: 3, pitch: 0.5 },
  "M3.5": { diameter: 3.5, pitch: 0.6 },
  M4: { diameter: 4, pitch: 0.7 },
  M5: { diameter: 5, pitch: 0.8 },
  M6: { diameter: 6, pitch: 1.0 },
  M7: { diameter: 7, pitch: 1.0 },
  M8: { diameter: 8, pitch: 1.25 },
  M10: { diameter: 10, pitch: 1.5 },
  M12: { diameter: 12, pitch: 1.75 },
  M14: { diameter: 14, pitch: 2.0 },
  M16: { diameter: 16, pitch: 2.0 },
  M18: { diameter: 18, pitch: 2.5 },
  M20: { diameter: 20, pitch: 2.5 },
  M22: { diameter: 22, pitch: 2.5 },
  M24: { diameter: 24, pitch: 3.0 },
  M27: { diameter: 27, pitch: 3.0 },
  M30: { diameter: 30, pitch: 3.5 },
  M33: { diameter: 33, pitch: 3.5 },
  M36: { diameter: 36, pitch: 4.0 },
  M39: { diameter: 39, pitch: 4.0 },
  M42: { diameter: 42, pitch: 4.5 },
  M45: { diameter: 45, pitch: 4.5 },
  M48: { diameter: 48, pitch: 5.0 },
  M52: { diameter: 52, pitch: 5.0 },
  M56: { diameter: 56, pitch: 5.5 },
  M60: { diameter: 60, pitch: 5.5 },
  M64: { diameter: 64, pitch: 6.0 },
};

export const ISO_FINE: Record<string, ThreadSpec> = {
  "M4x0.5": { diameter: 4, pitch: 0.5 },
  "M5x0.5": { diameter: 5, pitch: 0.5 },
  "M6x0.75": { diameter: 6, pitch: 0.75 },
  "M8x1": { diameter: 8, pitch: 1.0 },
  "M8x0.75": { diameter: 8, pitch: 0.75 },
  "M10x1.25": { diameter: 10, pitch: 1.25 },
  "M10x1": { diameter: 10, pitch: 1.0 },
  "M12x1.5": { diameter: 12, pitch: 1.5 },
  "M12x1.25": { diameter: 12, pitch: 1.25 },
  "M14x1.5": { diameter: 14, pitch: 1.5 },
  "M16x1.5": { diameter: 16, pitch: 1.5 },
  "M18x1.5": { diameter: 18, pitch: 1.5 },
  "M20x1.5": { diameter: 20, pitch: 1.5 },
  "M22x1.5": { diameter: 22, pitch: 1.5 },
  "M24x2": { diameter: 24, pitch: 2.0 },
  "M27x2": { diameter: 27, pitch: 2.0 },
  "M30x2": { diameter: 30, pitch: 2.0 },
  "M33x2": { diameter: 33, pitch: 2.0 },
  "M36x3": { diameter: 36, pitch: 3.0 },
  "M42x3": { diameter: 42, pitch: 3.0 },
  "M48x3": { diameter: 48, pitch: 3.0 },
  "M56x4": { diameter: 56, pitch: 4.0 },
  "M64x4": { diameter: 64, pitch: 4.0 },
};

/** inch -> mm for diameter, TPI -> mm for pitch. */
const inch = (value: number) => value * 25.4;
const tpi = (count: number) => 25.4 / count;

export const UNIFIED: Record<string, ThreadSpec> = {
  // UNC - Unified Coarse
  "#4-40 UNC": { diameter: inch(0.112), pitch: tpi(40) },
  "#6-32 UNC": { diameter: inch(0.138), pitch: tpi(32) },
  "#8-32 UNC": { diameter: inch(0.164), pitch: tpi(32) },
  "#10-24 UNC": { diameter: inch(0.19), pitch: tpi(24) },
  "1/4-20 UNC": { diameter: inch(0.25), pitch: tpi(20) },
  "5/16-18 UNC": { diameter: inch(0.3125), pitch: tpi(18) },
  "3/8-16 UNC": { diameter: inch(0.375), pitch: tpi(16) },
  "7/16-14 UNC": { diameter: inch(0.4375), pitch: tpi(14) },
  "1/2-13 UNC": { diameter: inch(0.5), pitch: tpi(13) },
  "9/16-12 UNC": { diameter: inch(0.5625), pitch: tpi(12) },
  "5/8-11 UNC": { diameter: inch(0.625), pitch: tpi(11) },
  "3/4-10 UNC": { diameter: inch(0.75), pitch: tpi(10) },
  "7/8-9 UNC": { diameter: inch(0.875), pitch: tpi(9) },
  "1-8 UNC": { diameter: inch(1.0), pitch: tpi(8) },
  "1 1/4-7 UNC": { diameter: inch(1.25), pitch: tpi(7) },
  "1 1/2-6 UNC": { diameter: inch(1.5), pitch: tpi(6) },
  // UNF - Unified Fine
  "#6-40 UNF": { diameter: inch(0.138), pitch: tpi(40) },
  "#8-36 UNF": { diameter: inch(0.164), pitch: tpi(36) },
  "#10-32 UNF": { diameter: inch(0.19), pitch: tpi(32) },
  "1/4-28 UNF": { diameter: inch(0.25), pitch: tpi(28) },
  "5/16-24 UNF": { diameter: inch(0.3125), pitch: tpi(24) },
  "3/8-24 UNF": { diameter: inch(0.375), pitch: tpi(24) },
  "7/16-20 UNF": { diameter: inch(0.4375), pitch: tpi(20) },
  "1/2-20 UNF": { diameter: inch(0.5), pitch: tpi(20) },
  "9/16-18 UNF": { diameter: inch(0.5625), pitch: tpi(18) },
  "5/8-18 UNF": { diameter: inch(0.625), pitch: tpi(18) },
  "3/4-16 UNF": { diameter: inch(0.75), pitch: tpi(16) },
  "7/8-14 UNF": { diameter: inch(0.875), pitch: tpi(14) },
  "1-12 UNF": { diameter: inch(1.0), pitch: tpi(12) },
};

/** All tables combined - for looking up a designation. */
export const THREAD_TABLES: Record<string, ThreadSpec> = {
  ...ISO_COARSE,
  ...ISO_FINE,
  ...UNIFIED,
};

/** Grouped designations for select menus. */
export const THREAD_GROUPS = [
  { label: "Metric coarse", items: Object.keys(ISO_COARSE) },
  { label: "Metric fine", items: Object.keys(ISO_FINE) },
  { label: "Unified UNC/UNF", items: Object.keys(UNIFIED) },
] as const;

// ---------------------------------------------------------------------------
// Validierung
// ---------------------------------------------------------------------------

export class ThreadParamError extends Error {}

function validate(p: ThreadParams) {
  const fail = (m: string) => {
    throw new ThreadParamError(m);
  };
  if (!(p.diameter > 0)) fail('diameter must be > 0.');
  if (!(p.pitch > 0)) fail('pitch must be > 0.');
  if (!(p.length > 0)) fail('length must be > 0.');
  if (p.pitch >= p.diameter)
    fail('pitch must be smaller than diameter - otherwise the profile degenerates.');

  const { minorR } = isoGeometry(p.diameter, p.pitch);
  const clr = p.clearance ?? 0;
  if (minorR - (p.kind === 'external' ? clr / 2 : 0) <= 0.05)
    fail(
      'Minor diameter becomes <= 0. Pitch is too large relative to the diameter.',
    );

  const segs = p.segments ?? 48;
  if (segs < 8) fail('segments must be >= 8.');
  if (segs > 512) fail('segments > 512 is needlessly expensive.');

  const pp = p.profilePoints ?? 8;
  if (pp < 4) fail('profilePoints must be >= 4.');

  if ((p.taperTurns ?? 1) < 0) fail('taperTurns must not be negative.');
  if (clr < 0) fail('clearance must not be negative.');

  // No artificial upper bound on diameter or length - but a guard against
  // meshes that would freeze the browser. Triangle count grows with turns *
  // segments: an M2x0.4 at 500 mm length would be >1M triangles. Anyone who
  // really needs that reduces segments.
  const estimatedTriangles = (p.length / p.pitch) * (p.profilePoints ?? 8) * segs * 2;
  if (estimatedTriangles > 2_000_000)
    fail(
      `This combination would produce about ${Math.round(estimatedTriangles / 1000)}k triangles ` +
        `and would freeze the browser. Reduce the length or the segment count.`,
    );
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

/**
 * Returns the radial offset profile over one turn, normalized to t in [0,1).
 * Return value: radius delta relative to the core radius.
 *
 * Profile shape (unrolled over the turn height P):
 *
 *   r
 *   ^        ____              <- crest flat (P/8 wide)
 *   |       /    \
 *   |      /      \            <- 60 deg flanks
 *   |_____/        \______     <- root flat (P/4 wide)
 *         0        1  (t)
 */
function profileRadius(
  t: number,
  crestHeight: number,
): number {
  // Normalized trapezoid over t in [0,1):
  //   0.000 - 0.125 : root (flat, 0)
  //   0.125 - 0.4375: rise
  //   0.4375- 0.5625: crest (flat, 1)
  //   0.5625- 0.875 : fall
  //   0.875 - 1.000 : root (flat, 0)
  const u = t - Math.floor(t);
  let h: number;
  if (u < 0.125) h = 0;
  else if (u < 0.4375) h = (u - 0.125) / 0.3125;
  else if (u < 0.5625) h = 1;
  else if (u < 0.875) h = 1 - (u - 0.5625) / 0.3125;
  else h = 0;
  return h * crestHeight;
}

/** Lead-in/out: linearly fades the profile height at the ends. */
function taperFactor(
  z: number,
  length: number,
  taperLen: number,
): number {
  if (taperLen <= 0) return 1;
  if (z < taperLen) return Math.max(0, z / taperLen);
  if (z > length - taperLen) return Math.max(0, (length - z) / taperLen);
  return 1;
}

// ---------------------------------------------------------------------------
// Mesh assembly
// ---------------------------------------------------------------------------

class MeshBuilder {
  private verts: number[] = [];
  private tris: number[] = [];

  addVertex(x: number, y: number, z: number): number {
    this.verts.push(x, y, z);
    return this.verts.length / 3 - 1;
  }

  addTriangle(a: number, b: number, c: number) {
    if (a === b || b === c || a === c) return; // degenerate -> discard
    this.tris.push(a, b, c);
  }

  /** Quad as two triangles, order a-b-c-d counter-clockwise. */
  addQuad(a: number, b: number, c: number, d: number) {
    this.addTriangle(a, b, c);
    this.addTriangle(a, c, d);
  }

  build(info: ThreadMesh['info']): ThreadMesh {
    return {
      vertices: new Float32Array(this.verts),
      indices: new Uint32Array(this.tris),
      info: {
        ...info,
        vertexCount: this.verts.length / 3,
        triangleCount: this.tris.length / 3,
      },
    };
  }
}

/**
 * Builds the thread mesh.
 *
 * Structure: a regular grid in (angle x height). For each grid point the radius
 * is computed from profile + helix phase. The lateral surface is built as quad
 * strips, top/bottom caps as fans to the center point. This makes the mesh
 * closed by construction (no holes, no open edges) - a prerequisite for robust
 * boolean operations.
 */
export function generateThread(params: ThreadParams): ThreadMesh {
  validate(params);

  const {
    diameter,
    pitch,
    length,
    kind,
    clearance = 0,
    segments = 48,
    taperTurns = 1,
    profilePoints = 8,
  } = params;

  const geo = isoGeometry(diameter, pitch);

  // Apply clearance: shrink externally, grow internally (cutter).
  const sign = kind === 'external' ? -1 : +1;
  const radialOffset = (sign * clearance) / 2;

  const majorR = geo.majorR + radialOffset;
  const minorR = geo.minorR + radialOffset;
  const crestHeight = majorR - minorR;

  const turns = length / pitch;
  const taperLen = taperTurns * pitch;

  // Height resolution: profilePoints steps per turn, at least 2 total.
  const rows = Math.max(2, Math.ceil(turns * profilePoints));
  const cols = segments;

  const mb = new MeshBuilder();

  // --- Lateral surface -----------------------------------------------------
  // grid[row][col] -> Vertex-Index
  const grid: number[][] = [];

  for (let i = 0; i <= rows; i++) {
    const z = (i / rows) * length;
    const taper = taperFactor(z, length, taperLen);
    const row: number[] = [];

    for (let j = 0; j < cols; j++) {
      const theta = (j / cols) * Math.PI * 2;

      // Helix phase: the point on the helix at this angle and height. The
      // profile advances along with the height.
      const phase = z / pitch - theta / (Math.PI * 2);
      const r = minorR + profileRadius(phase, crestHeight) * taper;

      row.push(mb.addVertex(r * Math.cos(theta), r * Math.sin(theta), z));
    }
    grid.push(row);
  }

  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const jn = (j + 1) % cols;
      // CCW as seen from outside
      mb.addQuad(grid[i][j], grid[i][jn], grid[i + 1][jn], grid[i + 1][j]);
    }
  }

  // --- Caps ----------------------------------------------------------------
  // Fan triangulation to the axis center. Since the boundary curve is exactly
  // the grid edge, no gaps appear.
  const bottomCenter = mb.addVertex(0, 0, 0);
  for (let j = 0; j < cols; j++) {
    const jn = (j + 1) % cols;
    // Normal points toward -Z: reverse the winding
    mb.addTriangle(bottomCenter, grid[0][jn], grid[0][j]);
  }

  const topCenter = mb.addVertex(0, 0, length);
  for (let j = 0; j < cols; j++) {
    const jn = (j + 1) % cols;
    mb.addTriangle(topCenter, grid[rows][j], grid[rows][jn]);
  }

  return mb.build({
    majorDiameter: majorR * 2,
    minorDiameter: minorR * 2,
    pitchDiameter: (geo.pitchR + radialOffset) * 2,
    turns,
    vertexCount: 0,
    triangleCount: 0,
  });
}

// ---------------------------------------------------------------------------
// Convenience helpers
// ---------------------------------------------------------------------------

/**
 * Builds the cutter body for a tapped hole from an ISO designation.
 * Mark the result as a "hole" and group it with the target body.
 */
export function generateTappedHole(
  designation: keyof typeof ISO_COARSE | string,
  length: number,
  clearance = 0.3,
  overrides: Partial<ThreadParams> = {},
): ThreadMesh {
  const spec = ISO_COARSE[designation];
  if (!spec)
    throw new ThreadParamError(
      `Unknown thread designation "${designation}". Available: ${Object.keys(
        ISO_COARSE,
      ).join(', ')}`,
    );
  return generateThread({
    ...spec,
    length,
    kind: 'internal',
    clearance,
    ...overrides,
  });
}

/** Builds a threaded bolt from an ISO designation. */
export function generateBolt(
  designation: keyof typeof ISO_COARSE | string,
  length: number,
  clearance = 0.2,
  overrides: Partial<ThreadParams> = {},
): ThreadMesh {
  const spec = ISO_COARSE[designation];
  if (!spec)
    throw new ThreadParamError(
      `Unknown thread designation "${designation}". Available: ${Object.keys(
        ISO_COARSE,
      ).join(', ')}`,
    );
  return generateThread({
    ...spec,
    length,
    kind: 'external',
    clearance,
    ...overrides,
  });
}

/** Exports a ThreadMesh as ASCII STL (test/debug). */
export function toSTL(mesh: ThreadMesh, name = 'thread'): string {
  const v = mesh.vertices;
  const idx = mesh.indices;
  const out: string[] = [`solid ${name}`];

  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3,
      b = idx[i + 1] * 3,
      c = idx[i + 2] * 3;
    const ux = v[b] - v[a],
      uy = v[b + 1] - v[a + 1],
      uz = v[b + 2] - v[a + 2];
    const wx = v[c] - v[a],
      wy = v[c + 1] - v[a + 1],
      wz = v[c + 2] - v[a + 2];
    let nx = uy * wz - uz * wy,
      ny = uz * wx - ux * wz,
      nz = ux * wy - uy * wx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;

    out.push(`  facet normal ${nx} ${ny} ${nz}`);
    out.push('    outer loop');
    out.push(`      vertex ${v[a]} ${v[a + 1]} ${v[a + 2]}`);
    out.push(`      vertex ${v[b]} ${v[b + 1]} ${v[b + 2]}`);
    out.push(`      vertex ${v[c]} ${v[c + 1]} ${v[c + 2]}`);
    out.push('    endloop');
    out.push('  endfacet');
  }
  out.push(`endsolid ${name}`);
  return out.join('\n');
}
