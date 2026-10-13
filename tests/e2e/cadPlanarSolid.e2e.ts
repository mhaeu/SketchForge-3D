import { beforeAll, describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { OcctKernel, type ShapeHandle } from "occt-wasm";
import manifoldModule from "manifold-3d";
import { buildPlanarMeshSolid, meshSignedVolume } from "@/lib/cadPlanarSolid";

/**
 * Laesst sich die Kante eines Schnitts verrunden?
 *
 * Das Zerteilen gibt zwei Netze, und der Weg eines Netzes in den Kern ging
 * bisher ueber STL: jedes Dreieck eine Flaeche, danach zusammengenaeht und
 * geheilt. Was dabei herauskommt, ist ein Koerper mit dem richtigen
 * Rauminhalt, aber mit der Topologie eines Dreieckshaufens - und auf dessen
 * Kanten lehnt der Kern eine Verrundung ab.
 *
 * Hier wird beides am echten Kern gegeneinander gemessen: der alte Weg und
 * der neue ueber die flachen Flaechen des Netzes.
 */

let cad: OcctKernel;
let runtime: Awaited<ReturnType<typeof manifoldModule>>;

beforeAll(async () => {
  const wasm = join(dirname(fileURLToPath(import.meta.resolve("occt-wasm"))), "occt-wasm.wasm");
  cad = await OcctKernel.init({ wasm });
  runtime = await manifoldModule();
  runtime.setup();
}, 180000);

/** Der STL-Weg des Arbeiters, Schritt fuer Schritt wie dort. */
function asciiStl(positions: ArrayLike<number>, indices: ArrayLike<number>) {
  const lines: string[] = ["solid sketchforge"];
  for (let offset = 0; offset + 2 < indices.length; offset += 3) {
    const a = indices[offset] * 3;
    const b = indices[offset + 1] * 3;
    const c = indices[offset + 2] * 3;
    const abx = positions[b] - positions[a], aby = positions[b + 1] - positions[a + 1], abz = positions[b + 2] - positions[a + 2];
    const acx = positions[c] - positions[a], acy = positions[c + 1] - positions[a + 1], acz = positions[c + 2] - positions[a + 2];
    let nx = aby * acz - abz * acy, ny = abz * acx - abx * acz, nz = abx * acy - aby * acx;
    const size = Math.hypot(nx, ny, nz) || 1;
    nx /= size; ny /= size; nz /= size;
    lines.push(`facet normal ${nx} ${ny} ${nz}\n outer loop\n  vertex ${positions[a]} ${positions[a + 1]} ${positions[a + 2]}\n  vertex ${positions[b]} ${positions[b + 1]} ${positions[b + 2]}\n  vertex ${positions[c]} ${positions[c + 1]} ${positions[c + 2]}\n endloop\nendfacet`);
  }
  lines.push("endsolid sketchforge");
  return lines.join("\n");
}

function solidFromStl(positions: ArrayLike<number>, indices: ArrayLike<number>) {
  const imported = cad.importStl(asciiStl(positions, indices));
  let shape = cad.fixShape(imported);
  if (cad.isSolid(shape)) {
    try {
      shape = cad.healSolid(shape, 1e-4);
      shape = cad.fixFaceOrientations(shape);
      shape = cad.removeDegenerateEdges(shape);
      shape = cad.unifySameDomain(shape);
    } catch {
      // weiter zum Naehen
    }
    if (cad.isSolid(shape) && cad.isValid(shape)) return shape;
  }
  const faces = cad.getSubShapes(imported, "face");
  for (const tolerance of [1e-5, 1e-4, 1e-3, 1e-2]) {
    try {
      let candidate = cad.sewAndSolidify(faces, tolerance);
      candidate = cad.fixShape(candidate);
      if (cad.isSolid(candidate)) candidate = cad.healSolid(candidate, tolerance);
      candidate = cad.fixFaceOrientations(candidate);
      candidate = cad.removeDegenerateEdges(candidate);
      candidate = cad.unifySameDomain(candidate);
      if (cad.isSolid(candidate) && cad.isValid(candidate)) return candidate;
    } catch {
      // naechste Toleranz
    }
  }
  throw new Error("Der STL-Weg gab keinen Koerper");
}

const HASH_UPPER_BOUND = 2_147_483_647;

const faceCount = (shape: ShapeHandle) => cad.getSubShapes(shape, "face").length;
const edgeCount = (shape: ShapeHandle) => cad.getSubShapes(shape, "edge").length;

function unit(x: number, y: number, z: number): [number, number, number] {
  const size = Math.hypot(x, y, z);
  return [x / size, y / size, z / size];
}

/** Die Punkte, mit denen der Kern eine Kante zeichnet. */
function edgePoints(shape: ShapeHandle) {
  const wire = cad.wireframe(shape, 0.0015);
  const byHash = new Map<number, number[]>();
  for (let index = 0; index + 2 < wire.edgeGroups.length; index += 3) {
    const start = wire.edgeGroups[index];
    const count = wire.edgeGroups[index + 1];
    const hash = wire.edgeGroups[index + 2];
    if (!byHash.has(hash)) byHash.set(hash, Array.from(wire.points.slice(start, start + count)));
  }
  return (edge: ShapeHandle) => byHash.get(cad.hashCode(edge, HASH_UPPER_BOUND)) ?? [];
}

/**
 * Die Kanten, die auf der Schnittebene liegen und nicht zur Bohrung gehoeren -
 * die Klebefuge, die man nach dem Zerteilen entgratet.
 */
function seamEdges(shape: ShapeHandle, normal: [number, number, number], offset: number, boreRadius: number) {
  const pointsOf = edgePoints(shape);
  return cad.getSubShapes(shape, "edge").filter((edge) => {
    const points = pointsOf(edge);
    if (points.length < 6) return false;
    for (let index = 0; index + 2 < points.length; index += 3) {
      const distance = points[index] * normal[0] + points[index + 1] * normal[1] + points[index + 2] * normal[2] - offset;
      if (Math.abs(distance) > 1e-4) return false;
      if (Math.hypot(points[index], points[index + 1]) < boreRadius) return false;
    }
    return true;
  });
}

function splitBoredHalf() {
  const { Manifold } = runtime;
  const bored = Manifold.cube([20, 20, 20], true).subtract(Manifold.cylinder(30, 4, 4, 96, true));
  const normal = unit(0.3, 0, 1);
  const [half] = bored.splitByPlane(normal, 2);
  const mesh = half.getMesh();
  return { normal, positions: Array.from(mesh.vertProperties), indices: Array.from(mesh.triVerts) };
}

describe("Eine geteilte Haelfte im Kern", () => {
  /**
   * Der Koerper selbst: Aus 400 Dreiecken werden 102 Flaechen und 300 Kanten -
   * genau die Seiten und Kanten, die der Koerper hat (vier Waende, Vorderseite
   * und Schnittflaeche mit je einem Loch, 96 Facetten der Bohrung). Der
   * STL-Weg gibt daraus 201 Flaechen und 400 Kanten: die Schnittflaeche in
   * Stuecken und jede gerade Kante in Teilstuecken.
   *
   * Der Rauminhalt bleibt in beiden derselbe - daran wird gemessen, dass hier
   * nichts verrutscht ist.
   */
  it("hat so viele Flaechen, wie der Koerper Seiten hat", () => {
    const { positions, indices } = splitBoredHalf();
    const meshVolume = Math.abs(meshSignedVolume(positions, indices));

    const built = buildPlanarMeshSolid(cad, positions, indices);
    expect(built).not.toBeNull();
    expect(built!.faces).toBe(102);
    expect(edgeCount(built!.solid)).toBe(300);
    expect(cad.getVolume(built!.solid)).toBeCloseTo(meshVolume, 2);
    // Die Ecken wandern dabei um ein Zehnmillionstel - float32 ist die Strecke.
    expect(built!.snapped).toBeLessThan(1e-6);

    const viaStl = solidFromStl(positions, indices);
    expect(faceCount(viaStl)).toBe(201);
    expect(edgeCount(viaStl)).toBe(400);
    expect(cad.getVolume(viaStl)).toBeCloseTo(meshVolume, 2);
  }, 300000);

  /**
   * Und darum geht es: Die vier Kanten des Schnitts - die Fuge, die man
   * entgratet oder verklebt - nehmen eine Verrundung an, in jeder Groesse.
   * Ueber STL nahm keine eine an, auch nicht 0,3 mm.
   */
  it("laesst die Kante des Schnitts verrunden, was ueber STL nicht ging", () => {
    const { normal, positions, indices } = splitBoredHalf();

    const built = buildPlanarMeshSolid(cad, positions, indices);
    expect(built).not.toBeNull();
    const seam = seamEdges(built!.solid, normal, 2, 5);
    expect(seam).toHaveLength(4);
    const before = cad.getVolume(built!.solid);
    [0.3, 0.5, 1].forEach((radius) => {
      const rounded = cad.fillet(built!.solid, seam, radius);
      // Eine Verrundung an einer Aussenkante nimmt Material weg.
      expect(cad.getVolume(rounded), `${radius} mm`).toBeLessThan(before);
    });

    const viaStl = solidFromStl(positions, indices);
    const stlSeam = seamEdges(viaStl, normal, 2, 5);
    expect(stlSeam).toHaveLength(4);
    [0.3, 0.5, 1].forEach((radius) => {
      expect(() => cad.fillet(viaStl, stlSeam, radius), `${radius} mm ueber STL`).toThrow();
    });
  }, 300000);

  /**
   * Die Grenze, ehrlich gemessen: Wo eine Verrundung weiterhin scheitert,
   * scheitert sie auch an einem Koerper, den der Kern selbst gebaut hat. Hier
   * steht derselbe Koerper exakt daneben - Kasten minus 96-Eck-Prisma, mit
   * einem Halbraum schraeg abgeschnitten -, und er hat dieselben 102 Flaechen,
   * dieselben 300 Kanten und denselben Rauminhalt.
   *
   * Einzeln geprueft nehmen in beiden 108 der 204 scharfen Kanten eine
   * Verrundung von 0,2 mm an; die 96, die es nicht tun, sind die Kanten
   * zwischen der schraegen Schnittflaeche und den Facetten der Bohrung. Das
   * lehnt der Kern ab, nicht wir - diese Pruefung rechnet die 204 Einzelfaelle
   * nicht jedes Mal nach (sie kosten eine Minute), sondern haelt fest, dass
   * beide Koerper dieselben sind.
   */
  it("ist derselbe Koerper, den der Kern selbst gebaut haette", () => {
    const { normal, positions, indices } = splitBoredHalf();
    const built = buildPlanarMeshSolid(cad, positions, indices);
    expect(built).not.toBeNull();

    const box = cad.translate(cad.makeBox(20, 20, 20), -10, -10, -10);
    const rim = Array.from({ length: 96 }, (_, index) => {
      const angle = (index / 96) * Math.PI * 2;
      return { x: Math.cos(angle) * 4, y: Math.sin(angle) * 4, z: -15 };
    });
    const prism = cad.extrude(
      cad.makeFace(cad.makeWire(rim.map((point, index) => cad.makeLineEdge(point, rim[(index + 1) % rim.length])))),
      0,
      0,
      30,
    );
    const exactBored = cad.getSubShapes(cad.cut(box, prism), "solid")[0];
    let halfSpace = cad.translate(cad.makeBox(200, 200, 100), -100, -100, -100);
    halfSpace = cad.rotate(halfSpace, { point: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 1, z: 0 } }, Math.atan2(0.3, 1));
    halfSpace = cad.translate(halfSpace, normal[0] * 2, normal[1] * 2, normal[2] * 2);
    const exact = cad.getSubShapes(cad.cut(exactBored, halfSpace), "solid")[0];

    expect(faceCount(exact)).toBe(built!.faces);
    expect(edgeCount(exact)).toBe(edgeCount(built!.solid));
    expect(cad.getVolume(exact)).toBeCloseTo(cad.getVolume(built!.solid), 2);
    // Und auch dort nimmt die Fuge eine Verrundung an.
    const seam = seamEdges(exact, normal, 2, 5);
    expect(seam).toHaveLength(4);
    expect(cad.getVolume(cad.fillet(exact, seam, 0.5))).toBeLessThan(cad.getVolume(exact));
  }, 300000);

  /**
   * Ein Kasten ohne Bohrung ging schon vorher - das bleibt so, auf demselben
   * Weg: sechs Flaechen, zwoelf Kanten, und alle zwoelf zusammen verrundet.
   */
  it("nimmt einen schraeg geteilten Kasten wie bisher", () => {
    const { Manifold } = runtime;
    const [half] = Manifold.cube([20, 20, 20], true).splitByPlane(unit(0.3, 0, 1), 2);
    const mesh = half.getMesh();
    const positions = Array.from(mesh.vertProperties);
    const indices = Array.from(mesh.triVerts);
    const built = buildPlanarMeshSolid(cad, positions, indices);
    expect(built).not.toBeNull();
    expect(built!.faces).toBe(6);
    expect(edgeCount(built!.solid)).toBe(12);
    expect(cad.getVolume(built!.solid)).toBeCloseTo(Math.abs(meshSignedVolume(positions, indices)), 3);
    const edges = cad.getSubShapes(built!.solid, "edge");
    expect(cad.getVolume(cad.fillet(built!.solid, edges, 1))).toBeLessThan(cad.getVolume(built!.solid));
  }, 300000);

  /**
   * Und der Weg laesst liegen, was er nicht sauber zerlegen kann: Eine Kugel
   * hat fast so viele Bereiche wie Dreiecke. `null` heisst "nimm den STL-Weg",
   * und der nimmt sie - nur eben als Dreieckshaufen.
   */
  it("gibt null fuer ein gewachsenes Netz, damit der STL-Weg greift", () => {
    const { Manifold } = runtime;
    const mesh = Manifold.sphere(10, 64).getMesh();
    const positions = Array.from(mesh.vertProperties);
    const indices = Array.from(mesh.triVerts);
    expect(buildPlanarMeshSolid(cad, positions, indices, { maxRegions: 500 })).toBeNull();
    expect(cad.isSolid(solidFromStl(positions, indices))).toBe(true);
  }, 300000);
});
