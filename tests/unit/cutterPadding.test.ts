import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { Brush, Evaluator, SUBTRACTION } from "three-bvh-csg";
import { CUTTER_END_PADDING, paddedCutterShape } from "@/lib/cutterPadding";
import type { WorkplaneShape } from "@/types/sketchforge";

/**
 * Hat das Loch die Weite, die dort steht?
 *
 * Der Fraeser einer Aussparung bekommt eine Zugabe, damit ein randvolles Loch
 * keine Splitter an seinen Deckeln stehen laesst. Lag sie auf allen drei
 * Achsen, war das Loch um zweimal die Zugabe weiter als eingetippt - ein
 * Presssitz von 7,9 mm kam mit 8,0 heraus. Hier wird beides gemessen: die
 * Weite des Loches im geschnittenen Kasten, und dass die Zugabe an den Enden
 * weiterhin noetig ist.
 */

const hole = (diameter: number, height: number, elevation = 0): WorkplaneShape => ({
  id: "h",
  name: "Bohrung",
  kind: "cylinder",
  color: "#6f7f8d",
  x: 0,
  z: 0,
  elevation,
  size: diameter,
  width: diameter,
  depth: diameter,
  height,
  rotation: 0,
  hole: true,
} as WorkplaneShape);

/** Das Netz, das der Editor fuer einen Zylinder baut: ein 96-Eck-Prisma. */
function cylinderMesh(shape: WorkplaneShape, sides = 96) {
  const geometry = new THREE.CylinderGeometry(1, 1, shape.height, sides, 1);
  geometry.scale(shape.width / 2, 1, shape.depth / 2);
  geometry.translate(shape.x, (shape.elevation ?? 0) + shape.height / 2, shape.z);
  return geometry;
}

function boxMesh(size: number) {
  const geometry = new THREE.BoxGeometry(size, size, size);
  geometry.translate(0, size / 2, 0);
  return geometry;
}

function positionsOf(geometry: THREE.BufferGeometry) {
  const soup = geometry.index ? geometry.toNonIndexed() : geometry;
  return Array.from(soup.getAttribute("position").array as ArrayLike<number>);
}

function signedVolume(positions: number[]) {
  let total = 0;
  for (let i = 0; i + 8 < positions.length; i += 9) {
    const ax = positions[i], ay = positions[i + 1], az = positions[i + 2];
    const bx = positions[i + 3], by = positions[i + 4], bz = positions[i + 5];
    const cx = positions[i + 6], cy = positions[i + 7], cz = positions[i + 8];
    total += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  }
  return total;
}

const evaluator = new Evaluator();
evaluator.useGroups = false;
evaluator.attributes = ["position", "normal"];

function cut(solid: THREE.BufferGeometry, cutter: THREE.BufferGeometry) {
  const a = new Brush(solid);
  const b = new Brush(cutter);
  a.updateMatrixWorld(true);
  b.updateMatrixWorld(true);
  return positionsOf(evaluator.evaluate(a, b, SUBTRACTION).geometry);
}

/**
 * Die engste Stelle der Lochwand, quer gemessen - die, durch die ein Stift
 * muss. Gezaehlt werden nur Punkte in einem engen Band um die Wand; die
 * Deckelflaeche des Kastens tragt weitere Punkte, die das Schneiden dort
 * einsetzt und die nicht auf der Wand liegen.
 */
function narrowestHoleWidth(positions: number[], expected: number) {
  let min = Number.POSITIVE_INFINITY;
  for (let i = 0; i + 2 < positions.length; i += 3) {
    const radius = Math.hypot(positions[i], positions[i + 2]);
    if (radius < expected * 0.35 || radius > expected * 0.55) continue;
    min = Math.min(min, radius);
  }
  return min * 2;
}

/** Das Prisma, das ein 96-Eck dieser Weite einnimmt. */
function polygonPrismVolume(diameter: number, height: number) {
  return (96 * (diameter / 2) * (diameter / 2) * Math.sin((Math.PI * 2) / 96) * height) / 2;
}

describe("Der Fraeser einer Aussparung", () => {
  it("gibt nur an den beiden Enden zu, nicht rundherum", () => {
    const padded = paddedCutterShape(hole(7.9, 20, 3));
    expect(padded.width).toBeCloseTo(7.9, 9);
    expect(padded.depth).toBeCloseTo(7.9, 9);
    expect(padded.size).toBeCloseTo(7.9, 9);
    expect(padded.height).toBeCloseTo(20 + 2 * CUTTER_END_PADDING, 9);
    expect(padded.elevation).toBeCloseTo(3 - CUTTER_END_PADDING, 9);
    // Und die Zugabe steht an beiden Enden gleich weit hinaus.
    expect((padded.elevation ?? 0) + padded.height).toBeCloseTo(23 + CUTTER_END_PADDING, 9);
  });

  /**
   * Eine liegende Bohrung wird entlang ihrer eigenen Achse verlaengert. Ihre
   * Drehung bleibt, wie sie war - gedreht wird das Netz erst danach, und die
   * Enden sind dort, wo die Hoehe hinzeigt.
   */
  it("verlaengert eine liegende Bohrung entlang ihrer eigenen Achse", () => {
    const lying = paddedCutterShape({ ...hole(6, 30), rotationX: 90 } as WorkplaneShape);
    expect(lying.rotationX).toBe(90);
    expect(lying.width).toBeCloseTo(6, 9);
    expect(lying.height).toBeCloseTo(30 + 2 * CUTTER_END_PADDING, 9);
  });

  /**
   * Die Zusage am geschnittenen Koerper: Ein Loch von 7,9 mm durch einen
   * Kasten von 20 mm ist an seiner engsten Stelle 7,8958 mm weit, nie weiter
   * als eingetippt. Die 0,0042 mm darunter sind das Vieleck des Netzes, das
   * dem Kreis eingeschrieben ist - kein Spiel.
   */
  it("schneidet ein Loch von der eingetippten Weite", () => {
    const typed = 7.9;
    const cavity = cut(boxMesh(20), cylinderMesh(paddedCutterShape(hole(typed, 20))));
    const width = narrowestHoleWidth(cavity, typed);
    expect(width).toBeLessThanOrEqual(typed);
    // Auf fuenf Stellen: die Positionen des Netzes sind float32.
    expect(width).toBeCloseTo(typed * Math.cos(Math.PI / 96), 5);
    expect(typed - width).toBeLessThan(0.005);

    // Das abgetragene Volumen ist genau das Prisma dieser Weite.
    expect(8000 - signedVolume(cavity)).toBeCloseTo(polygonPrismVolume(typed, 20), 3);
  }, 60000);

  /**
   * Die Gegenprobe, damit die Zusage etwas wert ist: Mit der alten Zugabe auf
   * allen drei Achsen kam dasselbe Loch 7,9957 mm weit heraus - 0,0957 mm zu
   * weit - und es trug 24,96 mm^3 zu viel ab.
   */
  it("war mit einer Zugabe rundherum um zweimal die Zugabe zu weit", () => {
    const typed = 7.9;
    const old = { ...hole(typed + CUTTER_END_PADDING * 2, 20 + CUTTER_END_PADDING * 2, -CUTTER_END_PADDING) };
    const cavity = cut(boxMesh(20), cylinderMesh(old));
    const width = narrowestHoleWidth(cavity, typed);
    expect(width).toBeGreaterThan(typed);
    expect(width - typed).toBeCloseTo(0.0957, 3);
    const removed = 8000 - signedVolume(cavity);
    expect(removed - polygonPrismVolume(typed, 20)).toBeCloseTo(24.96, 1);
  }, 60000);

  /**
   * Und warum die Zugabe an den Enden bleibt: Ein randvolles Loch ohne sie
   * laesst Splitter an den Deckeln stehen, wo zwei Flaechen genau
   * aufeinandertreffen. Gemessen mit einem 48-Eck: dasselbe Volumen, aber
   * 1045 Dreiecke gegen 512 und 145 ms gegen 23 ms.
   *
   * Hier mit 48 Ecken und nicht mit den 96 des Editors, weil der Fall mit der
   * Feinheit ueberproportional teurer wird: Am 96-Eck sind es 2977 Dreiecke
   * gegen 1034 und **9,9 Sekunden** gegen 98 ms - einmal gemessen, und der
   * Grund, warum diese Pruefung das nicht jedes Mal nachrechnet.
   */
  it("braucht die Zugabe an den Enden, sonst bleiben Splitter stehen", () => {
    const typed = 7.9;
    const flush = cut(boxMesh(20), cylinderMesh(hole(typed, 20), 48));
    const padded = cut(boxMesh(20), cylinderMesh(paddedCutterShape(hole(typed, 20)), 48));
    expect(signedVolume(flush)).toBeCloseTo(signedVolume(padded), 3);
    expect(flush.length / 9).toBeGreaterThan((padded.length / 9) * 1.8);
  }, 60000);
});
