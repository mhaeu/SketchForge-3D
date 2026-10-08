import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { mateMotion, type MateFacePick } from "@/lib/mateFaces";
import { rotatedGeometryShapePatch, shapeRotationQuaternion } from "@/lib/geometryRotation";
import type { WorkplaneShape } from "@/types/sketchforge";

/**
 * Der ganze Weg vom zweiten Klick bis zum bewegten Koerper.
 *
 * Die Rechnung daneben (mateFaces.test.ts) prueft Drehung und Verschiebung
 * fuer sich. Hier geht beides durch dieselbe Kette wie im Ansichtsfenster:
 * Winkel in Quaternion, Drehung um den angeklickten Punkt, Mittelpunkt
 * nachgezogen, Verschiebung drauf - und am Ende wird am echten Netz gemessen,
 * ob die Flaeche dort liegt, wo sie liegen soll. Genau zwischen diesen
 * Schritten ist bei uns schon mehrfach ein Vorzeichen verrutscht.
 */

function box(overrides: Partial<WorkplaneShape> = {}): WorkplaneShape {
  return {
    id: overrides.id ?? "a",
    name: "Kasten",
    kind: "box",
    color: "#d41721",
    x: 0,
    z: 0,
    elevation: 0,
    size: 20,
    width: 20,
    depth: 20,
    height: 20,
    rotation: 0,
    ...overrides,
  } as WorkplaneShape;
}

/** Die Matrix, mit der das Ansichtsfenster diesen Koerper hinstellt. */
function matrixOf(shape: WorkplaneShape) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(shape.x, (shape.elevation ?? 0) + shape.height / 2, shape.z),
    shapeRotationQuaternion(shape),
    new THREE.Vector3(1, 1, 1),
  );
}

/** Die Eckpunkte des Koerpers in Weltmassen, ueber eine echte three.js-Geometrie. */
function worldCorners(shape: WorkplaneShape) {
  const geometry = new THREE.BoxGeometry(shape.width, shape.height, shape.depth);
  const position = geometry.getAttribute("position");
  const matrix = matrixOf(shape);
  const point = new THREE.Vector3();
  const corners: THREE.Vector3[] = [];
  for (let index = 0; index < position.count; index += 1) {
    corners.push(point.fromBufferAttribute(position, index).applyMatrix4(matrix).clone());
  }
  geometry.dispose();
  return corners;
}

/** Wie weit der Koerper laengs `direction` reicht. */
function reach(shape: WorkplaneShape, direction: THREE.Vector3) {
  const values = worldCorners(shape).map((corner) => corner.dot(direction));
  return { min: Math.min(...values), max: Math.max(...values) };
}

/**
 * Eine Flaeche des Kastens, so wie ein Klick darauf sie meldet: ihre Mitte
 * und ihre Normale nach aussen, beide in Weltmassen.
 */
function facePick(shape: WorkplaneShape, localNormal: [number, number, number]): MateFacePick {
  const normal = new THREE.Vector3(...localNormal).applyQuaternion(shapeRotationQuaternion(shape)).normalize();
  const half = new THREE.Vector3(
    (localNormal[0] * shape.width) / 2,
    (localNormal[1] * shape.height) / 2,
    (localNormal[2] * shape.depth) / 2,
  );
  const centre = half.applyMatrix4(matrixOf(shape));
  return { shapeId: shape.id, point: { x: centre.x, y: centre.y, z: centre.z }, normal };
}

/** Dieselben zwei Schritte, die der Editor nach dem zweiten Klick tut. */
function mated(shape: WorkplaneShape, source: MateFacePick, target: MateFacePick, mode: "against" | "flush", gap = 0) {
  const motion = mateMotion(source, target, mode, gap);
  expect(motion).not.toBeNull();
  const turned = motion!.rotation
    ? { ...shape, ...rotatedGeometryShapePatch(shape, motion!.rotation, motion!.pivot) }
    : shape;
  return {
    ...turned,
    x: turned.x + motion!.translation.x,
    z: turned.z + motion!.translation.z,
    elevation: (turned.elevation ?? 0) + motion!.translation.y,
  } as WorkplaneShape;
}

describe("Zwei Kaesten aneinanderlegen", () => {
  /**
   * Der einfache Fall, der nur verschiebt: Die rechte Flaeche des ersten
   * schaut nach +x, die linke des zweiten nach -x. Danach beruehren sie sich
   * bei x = 40, und der erste Kasten hat seine Hoehe und seine Tiefe behalten.
   */
  it("schiebt den Kasten an die Flaeche, ohne ihn zu drehen", () => {
    const moving = box({ id: "moving" });
    const standing = box({ id: "standing", x: 50 });
    const result = mated(
      moving,
      facePick(moving, [1, 0, 0]),
      facePick(standing, [-1, 0, 0]),
      "against",
    );
    expect(result.rotation).toBe(0);
    expect(result.x).toBeCloseTo(30, 9);
    expect(result.z).toBeCloseTo(0, 9);
    expect(result.elevation).toBeCloseTo(0, 9);
    // Und die beiden beruehren sich genau dort, wo die Zielflaeche liegt.
    expect(reach(result, new THREE.Vector3(1, 0, 0)).max).toBeCloseTo(40, 6);
  });

  /**
   * Und der Fall, um den es eigentlich geht: Der bewegte Kasten steht schief -
   * um 30 Grad um die Hochachse und um 20 Grad nach vorn gekippt. Seine
   * angeklickte Flaeche muss danach flaechig an der anderen liegen, und kein
   * Eckpunkt darf durch die Zielebene stossen.
   */
  it("dreht einen schief stehenden Kasten flaechig an die Flaeche", () => {
    const moving = box({ id: "moving", rotation: 30, rotationX: 20, x: -40, elevation: 12 });
    const standing = box({ id: "standing", x: 50 });
    const target = facePick(standing, [-1, 0, 0]);
    const result = mated(moving, facePick(moving, [1, 0, 0]), target, "against");
    /*
     * Gemessen wird laengs der Richtung, in die die bewegte Flaeche danach
     * schaut - der Zielnormale entgegen, also +x. Der Koerper liegt hinter
     * seiner Flaeche, sein weitester Punkt in dieser Richtung ist also die
     * Flaeche selbst: die Zielebene bei x = 40.
     */
    const outward = new THREE.Vector3(1, 0, 0);
    const plane = new THREE.Vector3(target.point.x, target.point.y, target.point.z).dot(outward);
    expect(plane).toBeCloseTo(40, 9);
    /*
     * Flaechig heisst: Der Koerper reicht bis genau an die Ebene und keinen
     * Hauch darueber hinaus, und die vier Ecken seiner Flaeche liegen darauf.
     * Ein verrutschtes Vorzeichen in der Drehung oder im Drehpunkt faellt
     * hier auf - der Koerper stuende dann windschief oder mitten im anderen.
     */
    expect(reach(result, outward).max).toBeCloseTo(plane, 6);
    const onPlane = worldCorners(result).filter((corner) => Math.abs(corner.dot(outward) - plane) < 1e-6);
    expect(onPlane.length).toBeGreaterThanOrEqual(4);
  });

  /**
   * Das Spiel laesst Luft: ein Millimeter, und die Flaechen liegen einen
   * Millimeter auseinander statt aneinander.
   */
  it("laesst mit Spiel einen Millimeter Luft", () => {
    const moving = box({ id: "moving", rotation: 30 });
    const standing = box({ id: "standing", x: 50 });
    const result = mated(moving, facePick(moving, [1, 0, 0]), facePick(standing, [-1, 0, 0]), "against", 1);
    expect(reach(result, new THREE.Vector3(1, 0, 0)).max).toBeCloseTo(39, 6);
  });

  /**
   * In einer Ebene: Die linke Flaeche des bewegten Kastens kommt in die
   * Ebene der linken Flaeche des stehenden - die beiden stehen danach
   * nebeneinander, mit einer durchgehenden linken Seite, und nicht
   * ineinander.
   */
  it("legt zwei Seiten in eine Ebene", () => {
    const moving = box({ id: "moving", z: -60 });
    const standing = box({ id: "standing", x: 50 });
    const result = mated(moving, facePick(moving, [-1, 0, 0]), facePick(standing, [-1, 0, 0]), "flush");
    // Beide linken Seiten liegen jetzt bei x = 40.
    expect(reach(result, new THREE.Vector3(-1, 0, 0)).max).toBeCloseTo(-40, 6);
    expect(reach(standing, new THREE.Vector3(-1, 0, 0)).max).toBeCloseTo(-40, 6);
    // Quer dazu hat sich der Kasten nicht bewegt: er bleibt vor dem anderen.
    expect(result.z).toBeCloseTo(-60, 9);
  });

  /**
   * Und die Zusage, auf die es beim Verschieben ankommt: Der Koerper rutscht
   * auf die **Flaeche** zu, nicht auf den angeklickten Punkt. Hier liegt der
   * Zielpunkt hoch oben und weit hinten - der bewegte Kasten darf seine Hoehe
   * und seine Tiefe trotzdem behalten.
   */
  it("behaelt seine Lage quer zur Flaeche", () => {
    const moving = box({ id: "moving", z: 15, elevation: 7 });
    const standing = box({ id: "standing", x: 50, z: -80, elevation: 60 });
    const result = mated(moving, facePick(moving, [1, 0, 0]), facePick(standing, [-1, 0, 0]), "against");
    expect(result.z).toBeCloseTo(15, 9);
    expect(result.elevation).toBeCloseTo(7, 9);
  });
});
