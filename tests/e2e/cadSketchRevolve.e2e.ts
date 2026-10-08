import { beforeAll, describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { OcctKernel, JoinType } from "occt-wasm";
import { buildRevolvedSketchSolid, revolveProfileFitsAxis } from "@/lib/cadSketchRevolve";
import { SKETCH_CAD_DEFLECTION } from "@/lib/cadModifierRuntime";
import type { SketchProfile } from "@/types/sketchforge";

/**
 * Kann der Kern eine Skizze drehen - und laesst sich das Ergebnis bearbeiten?
 *
 * Das zweite ist der Grund fuer die ganze Sache: Ein gedrehter Koerper war
 * bei uns ein Netz, und ein Netz laesst sich nicht aushoehlen. Darum steht
 * hier am Ende eine echte Schalenrechnung und nicht nur eine Massprobe.
 */

let cad: OcctKernel;

beforeAll(async () => {
  const wasm = join(dirname(fileURLToPath(import.meta.resolve("occt-wasm"))), "occt-wasm.wasm");
  cad = await OcctKernel.init({ wasm });
}, 180000);

/**
 * Ein Viereck in Skizzenmassen. Die Skizze zeichnet links der Achse (x <= 0)
 * und ihr z laeuft nach unten, also ist `fromX`/`toX` der Abstand von der
 * Achse mit umgekehrtem Vorzeichen.
 */
function rectangle(id: string, fromX: number, toX: number, fromZ: number, toZ: number): SketchProfile {
  const corners = [
    { x: fromX, z: fromZ },
    { x: toX, z: fromZ },
    { x: toX, z: toZ },
    { x: fromX, z: toZ },
  ];
  const points = corners.map((corner, index) => ({ id: `${id}-${index}`, ...corner }));
  const segments = points.map((point, index) => ({
    id: `${id}-s${index}`,
    kind: "line" as const,
    startId: point.id,
    endId: points[(index + 1) % points.length].id,
  }));
  return { points, segments };
}

function merge(...profiles: SketchProfile[]): SketchProfile {
  return { points: profiles.flatMap((p) => p.points), segments: profiles.flatMap((p) => p.segments) };
}

function faceKinds(solid: Parameters<typeof cad.getSubShapes>[0]) {
  const faces = cad.getSubShapes(solid, "face");
  const kinds = faces.map((face) => cad.surfaceType(face));
  faces.forEach((face) => cad.release(face));
  return kinds.sort();
}

describe("Der Kern dreht eine Skizze zu einem genauen Koerper", () => {
  /**
   * Zuerst das Mass, und zwar scharf: Ein Viereck von 10 bis 20 mm Abstand
   * und 30 mm Hoehe wird ein Rohr. Sein Rauminhalt ist pi * (400 - 100) * 30
   * = 28.274,33 mm^3 - keine Annaeherung, sondern die Zahl selbst. Ein Netz
   * aus Scheiben traefe sie nie.
   */
  it("trifft den Rauminhalt eines Rohres genau", () => {
    const profile = rectangle("tube", -20, -10, 0, 30);
    const solid = buildRevolvedSketchSolid(cad, profile, 0, 360);
    expect(cad.isSolid(solid)).toBe(true);
    expect(cad.getVolume(solid)).toBeCloseTo(Math.PI * (400 - 100) * 30, 4);
  }, 300000);

  /** Ein Viereck bis zur Achse wird ein voller Zylinder, kein Rohr. */
  it("und den eines Zylinders, wenn der Umriss die Achse beruehrt", () => {
    const solid = buildRevolvedSketchSolid(cad, rectangle("cyl", -20, 0, 0, 30), 0, 360);
    expect(cad.getVolume(solid)).toBeCloseTo(Math.PI * 400 * 30, 4);
    // Zwei Deckel und eine Mantelflaeche - analytische Flaechen, keine Facetten.
    expect(faceKinds(solid)).toEqual(["cylinder", "plane", "plane"]);
  }, 300000);

  /**
   * Und er ist sparsam: ein paar hundert Dreiecke, wo das Netz Zehntausende
   * braucht. Gemessen mit derselben Abweichung, mit der eine Skizze auch
   * hochgezogen wird.
   */
  it("mit ein paar hundert Dreiecken statt Zehntausenden", () => {
    const solid = buildRevolvedSketchSolid(cad, rectangle("fine", -20, -10, 0, 30), 0, 360);
    const mesh = cad.tessellate(solid, { linearDeflection: SKETCH_CAD_DEFLECTION.linear, angularDeflection: SKETCH_CAD_DEFLECTION.angular });
    expect(mesh.triangleCount).toBeLessThan(1000);
    expect(mesh.triangleCount).toBeGreaterThan(50);
  }, 300000);

  /** Ein Teilueberstrich nimmt seinen Anteil - 90 Grad ein Viertel. */
  it("dreht nur so weit, wie der Ueberstrich sagt", () => {
    const quarter = buildRevolvedSketchSolid(cad, rectangle("quarter", -20, 0, 0, 30), 0, 90);
    expect(cad.getVolume(quarter)).toBeCloseTo((Math.PI * 400 * 30) / 4, 4);
  }, 300000);

  /**
   * Ein negativer Ueberstrich dreht andersherum - derselbe Koerper, nur woanders.
   * Geprueft am Rauminhalt und daran, dass der Startwinkel mitgenommen wird:
   * -90 ab 90 Grad deckt denselben Viertel wie +90 ab 0.
   */
  it("und ein negativer Ueberstrich geht andersherum", () => {
    const forward = buildRevolvedSketchSolid(cad, rectangle("f", -20, 0, 0, 30), 0, 90);
    const backward = buildRevolvedSketchSolid(cad, rectangle("b", -20, 0, 0, 30), 90, -90);
    const bounds = (shape: typeof forward) => {
      cad.tessellate(shape, { linearDeflection: 0.05, angularDeflection: 0.16 });
      const box = cad.getBoundingBox(shape);
      return [box.xmin, box.xmax, box.zmin, box.zmax].map((value) => Number(value.toFixed(3)));
    };
    expect(cad.getVolume(backward)).toBeCloseTo(cad.getVolume(forward), 4);
    expect(bounds(backward)).toEqual(bounds(forward));
  }, 300000);

  /**
   * Ein Loch im Querschnitt bleibt ein Loch: ein Ring im Viereck wird ein
   * Hohlraum, der sich ringsherum zieht - und der Rauminhalt ist die
   * Differenz zweier Rohre.
   */
  it("behaelt ein Loch im Querschnitt", () => {
    const profile = merge(rectangle("outer", -20, -5, 0, 30), rectangle("hole", -15, -10, 10, 20));
    const solid = buildRevolvedSketchSolid(cad, profile, 0, 360);
    const outer = Math.PI * (400 - 25) * 30;
    const cavity = Math.PI * (225 - 100) * 10;
    expect(cad.getVolume(solid)).toBeCloseTo(outer - cavity, 3);
  }, 300000);

  /**
   * Ein Bogen bleibt ein Bogen. Gedreht wird daraus eine Torusflaeche - und
   * genau daran haengt, dass eine Rundung rund bleibt und nicht als Kette von
   * Sehnen in den Koerper eingeht. Layerling baut den Bogen an dieser Stelle
   * als Bezierkurve; unsere Hochziehung macht es richtig, und das Drehen
   * teilt sich jetzt denselben Drahtbauer mit ihr.
   */
  it("baut einen Bogen als Bogen, nicht als aehnliche Kurve", () => {
    const points = [
      { id: "a", x: -20, z: 0 },
      { id: "b", x: -20, z: 20 },
      { id: "c", x: -10, z: 20 },
    ];
    const profile: SketchProfile = {
      points,
      segments: [
        { id: "s0", kind: "line", startId: "a", endId: "b" },
        { id: "s1", kind: "line", startId: "b", endId: "c" },
        { id: "s2", kind: "arc", bulge: 4, startId: "c", endId: "a" },
      ],
    };
    const solid = buildRevolvedSketchSolid(cad, profile, 0, 360);
    expect(cad.isSolid(solid)).toBe(true);
    expect(faceKinds(solid)).toContain("torus");
  }, 300000);
});

describe("Und der gedrehte Koerper laesst sich bearbeiten", () => {
  /**
   * Der Grund fuer die ganze Aenderung: Ein gedrehter Becher liess sich als
   * Netz nicht aushoehlen. Hier laeuft dieselbe Schalenrechnung, die das
   * Aushoehlen-Werkzeug benutzt, auf dem genauen Koerper - mit dem Deckel
   * offen und 2 mm Wand.
   */
  it("hoehlt sich aus - mit offenem Deckel und 2 mm Wand", () => {
    const solid = buildRevolvedSketchSolid(cad, rectangle("cup", -20, 0, 0, 30), 0, 360);
    const faces = cad.getSubShapes(solid, "face");
    const top = faces.find((face) => cad.surfaceType(face) === "plane" && cad.getSurfaceCenterOfMass(face).y > 29.9);
    expect(top).toBeDefined();
    const shell = cad.shell(solid, [top!], 2, 1e-6, JoinType.Arc);
    expect(cad.isValid(shell)).toBe(true);
    // Aussen 20 mm, innen 18 mm, Boden 2 mm: der Becher ist eine Wand und ein Boden.
    const wall = Math.PI * (400 - 324) * 28;
    const base = Math.PI * 400 * 2;
    expect(cad.getVolume(shell)).toBeCloseTo(wall + base, 2);
  }, 300000);

  /** Und verrunden: eine echte Kante, kein Dreiecksrand. */
  it("und verrundet seine obere Kante", () => {
    const solid = buildRevolvedSketchSolid(cad, rectangle("fil", -20, 0, 0, 30), 0, 360);
    const edges = cad.getSubShapes(solid, "edge");
    expect(edges.length).toBeGreaterThan(0);
    const filleted = cad.fillet(solid, [edges[0]], 1);
    expect(cad.isSolid(filleted)).toBe(true);
    expect(cad.getVolume(filleted)).toBeLessThan(Math.PI * 400 * 30);
  }, 300000);
});

describe("Wo der Kern es nicht kann, sagt er es", () => {
  /**
   * Ein Umriss, der die Achse ueberquert, geht nicht: Der Kern wuerde ihn
   * durch sich selbst drehen. Das Netz schneidet ihn an der Achse ab, also
   * faellt der Aufrufer dorthin zurueck - und diese Pruefung ist das Signal.
   */
  it("lehnt einen Umriss ab, der die Achse ueberquert", () => {
    const crossing = rectangle("across", -10, 10, 0, 30);
    expect(revolveProfileFitsAxis(crossing)).toBe(false);
    expect(() => buildRevolvedSketchSolid(cad, crossing, 0, 360)).toThrow("status.revolveProfileCrossesAxis");
  }, 300000);

  it("nimmt einen Umriss, der die Achse nur beruehrt", () => {
    expect(revolveProfileFitsAxis(rectangle("touch", -20, 0, 0, 30))).toBe(true);
  }, 300000);

  it("und sagt es auch, wenn nichts geschlossen ist", () => {
    const open: SketchProfile = {
      points: [{ id: "a", x: -10, z: 0 }, { id: "b", x: -10, z: 10 }],
      segments: [{ id: "s", kind: "line", startId: "a", endId: "b" }],
    };
    expect(() => buildRevolvedSketchSolid(cad, open, 0, 360)).toThrow();
  }, 300000);
});
