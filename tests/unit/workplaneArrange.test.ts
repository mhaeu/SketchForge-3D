import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { workplaneAlignRotation, workplaneCentringShift } from "@/lib/workplaneArrange";
import {
  horizontalPlacementWorkplane,
  placementWorkplaneCoordinates,
  placementWorkplaneFromSurface,
} from "@/lib/placementWorkplane";
import { shapeRotationQuaternion } from "@/lib/geometryRotation";

// Eine Flaeche, die senkrecht steht: ihre Normale zeigt nach vorn.
const upright = placementWorkplaneFromSurface({ x: 4, y: 6, z: -2 }, { x: 0, y: 0, z: 1 }, { x: 1, y: 0, z: 0 });

/**
 * Die drei Knoepfe unter "Anordnen" beziehen sich alle auf die Arbeitsebene,
 * die gerade gilt. Auf der Hauptebene muss dabei genau das herauskommen, was
 * frueher herauskam - sonst waere aus einer Erweiterung eine Aenderung
 * geworden.
 */
describe("Zentrieren auf der Arbeitsebene", () => {
  it("schiebt auf der Hauptebene nach X und Z und laesst die Hoehe stehen", () => {
    const shift = workplaneCentringShift({ x: 30, y: 12, z: -18 }, horizontalPlacementWorkplane(0));
    expect(shift.x).toBeCloseTo(-30, 9);
    expect(shift.z).toBeCloseTo(18, 9);
    expect(shift.y).toBeCloseTo(0, 9);
  });

  it("laesst die Hoehe ueber einer angehobenen Ebene, wie sie ist", () => {
    // Die Ebene liegt auf 25; ein Koerper 10 darueber bleibt 10 darueber.
    const shift = workplaneCentringShift({ x: 5, y: 35, z: 5 }, horizontalPlacementWorkplane(25));
    expect(shift.y).toBeCloseTo(0, 9);
  });

  it("bringt den Punkt auf einer gekippten Flaeche in deren Mitte", () => {
    const centre = { x: 20, y: 30, z: -2 };
    const shift = workplaneCentringShift(centre, upright);
    const moved = { x: centre.x + shift.x, y: centre.y + shift.y, z: centre.z + shift.z };
    const local = placementWorkplaneCoordinates(upright, moved);
    expect(local.x).toBeCloseTo(0, 9);
    expect(local.z).toBeCloseTo(0, 9);
    // Und der Abstand von der Flaeche bleibt unangetastet.
    expect(local.y).toBeCloseTo(placementWorkplaneCoordinates(upright, centre).y, 9);
  });
});

describe("Ausrichten an der Arbeitsebene", () => {
  const asQuaternion = (angles: { rotation: number; rotationX: number; rotationZ: number }) => shapeRotationQuaternion(angles);
  const facing = (angles: { rotation: number; rotationX: number; rotationZ: number }, baked: { rotation: number; rotationX: number; rotationZ: number }) =>
    new THREE.Vector3(0, 1, 0).applyQuaternion(asQuaternion(angles).multiply(asQuaternion(baked)));
  /*
   * Wie weit das "Oben" des Koerpers danach noch von der Normalen der Ebene
   * abweicht, in Grad. Die Drehfelder halten ein Zehntel Grad fest, mehr
   * Genauigkeit kann dabei gar nicht herauskommen - ein Zehntel Grad ist
   * also die Messlatte, und eine schiefe Lage waere um Groessenordnungen
   * weiter weg.
   */
  const tiltDegrees = (direction: THREE.Vector3, normal: THREE.Vector3) =>
    THREE.MathUtils.radToDeg(Math.acos(Math.min(1, Math.abs(direction.dot(normal)))));

  it("stellt einen gedrehten Koerper auf der Hauptebene wieder gerade", () => {
    /*
     * Genau der Fall, der bisher nichts tat: Die Drehung steckte im Netz, in
     * den Feldern stand eine Null, und die Lage der Hauptebene ist auch eine
     * Null - eingetragen aendert das nichts, der Koerper blieb schief.
     */
    const baked = { rotation: 0, rotationX: 35, rotationZ: 20 };
    const patch = workplaneAlignRotation(horizontalPlacementWorkplane(0), baked);
    const up = facing(patch, baked);
    expect(tiltDegrees(up, new THREE.Vector3(0, 1, 0))).toBeLessThan(0.1);
    expect(up.y).toBeGreaterThan(0);
  });

  it("legt einen unverdrehten Koerper flach auf eine stehende Flaeche", () => {
    const patch = workplaneAlignRotation(upright);
    const up = facing(patch, { rotation: 0, rotationX: 0, rotationZ: 0 });
    // Das "Oben" des Koerpers zeigt danach laengs der Normalen dieser Flaeche.
    expect(tiltDegrees(up, new THREE.Vector3(0, 0, 1))).toBeLessThan(0.1);
  });

  it("rechnet die schon gebackene Drehung heraus", () => {
    const baked = { rotation: 18, rotationX: 40, rotationZ: -12 };
    const patch = workplaneAlignRotation(upright, baked);
    const up = facing(patch, baked);
    expect(tiltDegrees(up, new THREE.Vector3(0, 0, 1))).toBeLessThan(0.1);
    // Ohne dieses Herausrechnen laege der Koerper irgendwo.
    const naive = facing(workplaneAlignRotation(upright), baked);
    expect(tiltDegrees(naive, new THREE.Vector3(0, 0, 1))).toBeGreaterThan(5);
  });

  it("laesst einen Koerper in Ruhe, der schon flach liegt", () => {
    const patch = workplaneAlignRotation(horizontalPlacementWorkplane(0));
    expect(patch).toEqual({ rotation: 0, rotationX: 0, rotationZ: 0 });
  });
});
