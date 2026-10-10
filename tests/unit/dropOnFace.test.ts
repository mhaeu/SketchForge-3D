import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { placementPatchForNewShape, placementWorkplaneFromSurface, horizontalPlacementWorkplane } from "@/lib/placementWorkplane";

/**
 * Eine neue Form auf die Flaeche eines Koerpers setzen.
 *
 * Gerechnet wird mit derselben Kette, die der Editor beim Fallenlassen geht:
 * aus Normale und Querrichtung eine Ebene, dann die Form darauf stellen. Was
 * dabei schiefgehen kann, ist die Lage - eine Form, die in der Flaeche steckt
 * statt darauf, oder eine, die sich dreht, wo sie nicht sollte.
 */
const shape = { height: 10 };

describe("Auf eine waagerechte Flaeche", () => {
  const workplane = horizontalPlacementWorkplane(0);

  /**
   * Der haeufigste Fall - der Deckel eines Kastens. Die Form muss mit ihrer
   * Unterseite auf der Flaeche stehen, also ihre Aufstellhoehe genau dort.
   */
  it("stellt die Form mit ihrer Unterseite auf die Flaeche", () => {
    const face = placementWorkplaneFromSurface({ x: 5, y: 20, z: -3 }, { x: 0, y: 1, z: 0 }, workplane.xAxis);
    const patch = placementPatchForNewShape(shape, face, { x: 5, y: 20, z: -3 });
    expect(patch.x).toBeCloseTo(5, 9);
    expect(patch.z).toBeCloseTo(-3, 9);
    expect(patch.elevation).toBeCloseTo(20, 9);
  });

  /**
   * Und sie dreht sich dabei nicht: Eine Flaeche parallel zur Arbeitsebene
   * gibt genau dieselbe Lage wie die Arbeitsebene selbst. Sonst stuende ein
   * Kasten auf einem Kasten schief.
   */
  it("dreht die Form nicht, wenn die Flaeche parallel zur Arbeitsebene liegt", () => {
    const face = placementWorkplaneFromSurface({ x: 0, y: 20, z: 0 }, { x: 0, y: 1, z: 0 }, workplane.xAxis);
    const onFace = placementPatchForNewShape(shape, face, { x: 0, y: 20, z: 0 });
    const onPlane = placementPatchForNewShape(shape, workplane, { x: 0, y: 0, z: 0 });
    expect(onFace.rotation).toBe(onPlane.rotation);
    expect(onFace.rotationX).toBe(onPlane.rotationX);
    expect(onFace.rotationZ).toBe(onPlane.rotationZ);
  });
});

describe("Auf eine schraege Flaeche", () => {
  const workplane = horizontalPlacementWorkplane(0);
  // Eine um 30 Grad nach vorn gekippte Flaeche.
  const tilt = (30 * Math.PI) / 180;
  const normal = { x: 0, y: Math.cos(tilt), z: Math.sin(tilt) };

  it("legt die Form mit ihrer Unterseite auf die Schraege", () => {
    const face = placementWorkplaneFromSurface({ x: 0, y: 12, z: 4 }, normal, workplane.xAxis);
    const patch = placementPatchForNewShape(shape, face, { x: 0, y: 12, z: 4 });
    /*
     * Die Form steht senkrecht auf der Flaeche, also ist ihre Achse um
     * dieselben 30 Grad gekippt. Geprueft wird an der gedrehten Achse und
     * nicht an den Winkeln selbst: Welche Eulerwinkel dieselbe Drehung
     * beschreiben, ist nicht eindeutig.
     */
    const up = new THREE.Vector3(0, 1, 0).applyEuler(new THREE.Euler(
      THREE.MathUtils.degToRad(patch.rotationX ?? 0),
      THREE.MathUtils.degToRad(patch.rotation),
      THREE.MathUtils.degToRad(patch.rotationZ ?? 0),
      "XYZ",
    ));
    expect(up.x).toBeCloseTo(normal.x, 6);
    expect(up.y).toBeCloseTo(normal.y, 6);
    expect(up.z).toBeCloseTo(normal.z, 6);
  });

  /**
   * Der Mittelpunkt liegt eine halbe Hoehe **ueber** der Flaeche, laengs
   * ihrer Normale - nicht senkrecht nach oben. Sonst steckte die Form mit
   * einer Ecke in der Schraege.
   */
  it("hebt die Form laengs der Normale an, nicht senkrecht", () => {
    const touch = { x: 0, y: 12, z: 4 };
    const face = placementWorkplaneFromSurface(touch, normal, workplane.xAxis);
    const patch = placementPatchForNewShape(shape, face, touch);
    const centre = new THREE.Vector3(patch.x, (patch.elevation ?? 0) + shape.height / 2, patch.z);
    const expected = new THREE.Vector3(touch.x, touch.y, touch.z)
      .addScaledVector(new THREE.Vector3(normal.x, normal.y, normal.z), shape.height / 2);
    expect(centre.distanceTo(expected)).toBeLessThan(1e-6);
  });
});
