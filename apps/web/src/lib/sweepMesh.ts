export type SweepPlanePoint = { x: number; z: number };
export type SweepSpacePoint = { x: number; y: number; z: number };

export type SweepMeshRegion = {
  /** Der Umriss der Form, in Zeichenkoordinaten. */
  outer: SweepPlanePoint[];
  /** Loecher darin. */
  holes: SweepPlanePoint[][];
};

/**
 * Gibt zu einem Umriss mit Loechern die Dreiecke - als Tripel von Nummern in
 * die aneinandergehaengte Punktliste (erst der Umriss, dann die Loecher).
 * Wird nur fuer die Deckel eines offenen Weges gebraucht.
 */
export type SweepTriangulate = (outer: SweepPlanePoint[], holes: SweepPlanePoint[][]) => number[][];

export type SweepMesh = {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  triangleCount: number;
};

/**
 * Die Form am Weg entlangfuehren - als Netz, Ring fuer Ring.
 *
 * An jedem Knick des Weges steht ein Ring der Form, und zwar auf Gehrung: in
 * der Ebene, die den Winkel halbiert. Damit stossen die beiden Stuecke
 * lueckenlos aneinander, genau wie an der Ecke eines Bilderrahmens - und das
 * ist es, was beim Folgen erwartet wird.
 *
 * Gerechnet wird hier und nicht im CAD-Kern. Dessen Rohr-Sweep zieht die Form
 * ueber die Ecken eines eckigen Weges hinweg, statt sie abzuwinkeln, und
 * meldet das Ergebnis auch noch als gueltig; keines seiner Verfahren brachte
 * einen rechteckigen Weg zustande. Ein Netz aus Ringen dagegen ist eine
 * Handvoll Vektorrechnung, sie laesst sich pruefen, und sie tut genau das,
 * was die Sache beschreibt.
 */

/** So spitz darf ein Knick hoechstens sein - darunter wuerde die Gehrung unendlich lang. */
export const MIN_SWEEP_CORNER_COSINE = 0.1;

const UP: SweepSpacePoint = { x: 0, y: 0, z: 1 };

function subtract(a: SweepSpacePoint, b: SweepSpacePoint): SweepSpacePoint {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function normalize(v: SweepSpacePoint): SweepSpacePoint | null {
  const length = Math.hypot(v.x, v.y, v.z);
  if (!(length > 1e-9)) return null;
  return { x: v.x / length, y: v.y / length, z: v.z / length };
}

function dot(a: SweepSpacePoint, b: SweepSpacePoint) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: SweepSpacePoint, b: SweepSpacePoint): SweepSpacePoint {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

/** Doppelte Punkte hintereinander werfen die Richtungsrechnung um. */
export function tidySweepPath(path: readonly SweepSpacePoint[], closed: boolean): SweepSpacePoint[] {
  const tidy: SweepSpacePoint[] = [];
  for (const point of path) {
    const last = tidy[tidy.length - 1];
    if (last && Math.hypot(point.x - last.x, point.y - last.y, point.z - last.z) < 1e-9) continue;
    tidy.push({ ...point });
  }
  if (closed && tidy.length > 1) {
    const first = tidy[0];
    const last = tidy[tidy.length - 1];
    if (Math.hypot(first.x - last.x, first.y - last.y, first.z - last.z) < 1e-9) tidy.pop();
  }
  return tidy;
}

type Frame = {
  origin: SweepSpacePoint;
  /** Die Richtung, aus der der Weg kommt - an ihr haengt die Lage der Form. */
  incoming: SweepSpacePoint;
  /** Die Normale der Gehrungsebene. */
  bisector: SweepSpacePoint;
};

function sweepFrames(path: readonly SweepSpacePoint[], closed: boolean): Frame[] | null {
  const count = path.length;
  if (count < 2) return null;
  const direction = (from: number, to: number) => normalize(subtract(path[to], path[from]));
  const outgoing: Array<SweepSpacePoint | null> = [];
  for (let index = 0; index < count; index += 1) {
    outgoing.push(index + 1 < count ? direction(index, index + 1) : closed ? direction(index, 0) : null);
  }
  const frames: Frame[] = [];
  for (let index = 0; index < count; index += 1) {
    const out = outgoing[index] ?? outgoing[index - 1] ?? null;
    const previous = index > 0 ? outgoing[index - 1] : closed ? outgoing[count - 1] : null;
    const incoming = previous ?? out;
    if (!incoming || !out) return null;
    const bisector = normalize({ x: incoming.x + out.x, y: incoming.y + out.y, z: incoming.z + out.z });
    // Kehrt der Weg an dieser Stelle um, gibt es keine Halbierende - und
    // auch keine Gehrung, die sich zeichnen liesse.
    if (!bisector || dot(incoming, bisector) < MIN_SWEEP_CORNER_COSINE) return null;
    frames.push({ origin: path[index], incoming, bisector });
  }
  return frames;
}

/**
 * Ein Punkt der Form, an einen Rahmen gelegt.
 *
 * Erst liegt er in der Ebene quer zur ankommenden Richtung - dort, wo ihn das
 * gerade Stueck davor hinschiebt. Dann wandert er laengs dieser Richtung, bis
 * er auf der Gehrungsebene sitzt. Damit treffen sich das Stueck davor und das
 * danach in genau denselben Punkten.
 */
function framePoint(frame: Frame, point: SweepPlanePoint): SweepSpacePoint {
  const across = cross(frame.incoming, UP);
  const offset = {
    x: across.x * point.x + UP.x * point.z,
    y: across.y * point.x + UP.y * point.z,
    z: across.z * point.x + UP.z * point.z,
  };
  const along = -dot(offset, frame.bisector) / dot(frame.incoming, frame.bisector);
  return {
    x: frame.origin.x + offset.x + frame.incoming.x * along,
    y: frame.origin.y + offset.y + frame.incoming.y * along,
    z: frame.origin.z + offset.z + frame.incoming.z * along,
  };
}

function signedArea(polygon: readonly SweepPlanePoint[]) {
  return polygon.reduce((area, point, index) => {
    const next = polygon[(index + 1) % polygon.length];
    return area + point.x * next.z - next.x * point.z;
  }, 0) / 2;
}

/** Der Umriss gegen den Uhrzeigersinn, die Loecher mit dem Uhrzeigersinn. */
function orientedRegion(region: SweepMeshRegion): SweepMeshRegion {
  const turn = (polygon: SweepPlanePoint[], wanted: number) =>
    Math.sign(signedArea(polygon)) === wanted ? polygon : [...polygon].reverse();
  return {
    outer: turn(region.outer, 1),
    holes: region.holes.map((hole) => turn(hole, -1)),
  };
}

export function buildSweepMesh(
  regions: readonly SweepMeshRegion[],
  path: readonly SweepSpacePoint[],
  closed: boolean,
  triangulate: SweepTriangulate,
): SweepMesh | null {
  const tidy = tidySweepPath(path, closed);
  const frames = sweepFrames(tidy, closed);
  if (!frames || frames.length < 2) return null;
  const usable = regions
    .map(orientedRegion)
    .filter((region) => region.outer.length >= 3 && Math.abs(signedArea(region.outer)) > 1e-9);
  if (usable.length === 0) return null;

  const positions: number[] = [];
  const triangle = (a: SweepSpacePoint, b: SweepSpacePoint, c: SweepSpacePoint) => {
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  };

  for (const region of usable) {
    const loops = [region.outer, ...region.holes];
    // Die Waende: jede Kante der Form, von Ring zu Ring weitergezogen.
    for (const loop of loops) {
      for (let step = 0; step + 1 < frames.length || (closed && step < frames.length); step += 1) {
        const here = frames[step];
        const next = frames[(step + 1) % frames.length];
        for (let edge = 0; edge < loop.length; edge += 1) {
          const a = loop[edge];
          const b = loop[(edge + 1) % loop.length];
          const a0 = framePoint(here, a);
          const b0 = framePoint(here, b);
          const a1 = framePoint(next, a);
          const b1 = framePoint(next, b);
          triangle(a0, b1, b0);
          triangle(a0, a1, b1);
        }
      }
    }
    // Die Deckel: nur ein offener Weg hat Enden, die offen blieben.
    if (!closed) {
      const points = [region.outer, ...region.holes].flat();
      const faces = triangulate(region.outer, region.holes);
      for (const [ia, ib, ic] of faces) {
        const start = frames[0];
        const end = frames[frames.length - 1];
        // Vorn zeigt der Deckel gegen die Laufrichtung, hinten mit ihr - die
        // Umlaufrichtung dreht sich also um.
        triangle(framePoint(start, points[ia]), framePoint(start, points[ib]), framePoint(start, points[ic]));
        triangle(framePoint(end, points[ic]), framePoint(end, points[ib]), framePoint(end, points[ia]));
      }
    }
  }

  if (positions.length < 9) return null;
  const normals = new Float32Array(positions.length);
  for (let index = 0; index + 8 < positions.length; index += 9) {
    const ax = positions[index + 3] - positions[index];
    const ay = positions[index + 4] - positions[index + 1];
    const az = positions[index + 5] - positions[index + 2];
    const bx = positions[index + 6] - positions[index];
    const by = positions[index + 7] - positions[index + 1];
    const bz = positions[index + 8] - positions[index + 2];
    const nx = ay * bz - az * by;
    const ny = az * bx - ax * bz;
    const nz = ax * by - ay * bx;
    const length = Math.hypot(nx, ny, nz) || 1;
    for (let corner = 0; corner < 3; corner += 1) {
      normals[index + corner * 3] = nx / length;
      normals[index + corner * 3 + 1] = ny / length;
      normals[index + corner * 3 + 2] = nz / length;
    }
  }
  const indices = new Uint32Array(positions.length / 3);
  for (let index = 0; index < indices.length; index += 1) indices[index] = index;
  return {
    positions: new Float32Array(positions),
    normals,
    indices,
    triangleCount: indices.length / 3,
  };
}
