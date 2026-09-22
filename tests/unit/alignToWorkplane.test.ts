import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  placementPatchForNewShape,
  placementWorkplaneCoordinates,
  placementWorkplaneFromSurface,
  placementWorkplanePoint,
} from "@/lib/placementWorkplane";
import type { WorkplaneShape } from "@/types/sketchforge";

const shape = (id: string, x: number, z: number, elevation: number, height = 10): WorkplaneShape => ({
  id,
  name: id,
  kind: "box",
  color: "#ffffff",
  x,
  z,
  elevation,
  size: 10,
  width: 10,
  depth: 10,
  height,
  rotation: 0,
});

/**
 * "An der Arbeitsebene ausrichten" legt die Auswahl flach auf die gerade
 * gewaehlte Ebene und schiebt sie in deren Mitte. Gerechnet wird das aus den
 * Bausteinen, die auch eine neu eingefuegte Form auf die Ebene setzen - hier
 * wird nachgerechnet, dass dabei wirklich Flaeche auf Ebene liegt.
 */
describe("aligning a selection to the current workplane", () => {
  const tilted = placementWorkplaneFromSurface({ x: 12, y: 6, z: -4 }, { x: 0.4, y: 0.7, z: 0.59 }, { x: 1, y: 0, z: 0 });
  const normal = new THREE.Vector3(tilted.normal.x, tilted.normal.y, tilted.normal.z);

  const alignedCentre = (subject: WorkplaneShape, basePoint = tilted.origin) => {
    const patch = placementPatchForNewShape(subject, tilted, basePoint);
    return new THREE.Vector3(patch.x, (patch.elevation ?? 0) + subject.height / 2, patch.z);
  };

  it("puts a single object in the middle of the plane, standing on it", () => {
    const subject = shape("a", 40, -20, 3);
    const patch = placementPatchForNewShape(subject, tilted, tilted.origin);
    const centre = alignedCentre(subject);
    // Die Mitte sitzt genau eine halbe Hoehe ueber dem Ursprung, laengs der
    // Normalen - der Koerper liegt also mit seiner Flaeche auf der Ebene.
    const expected = new THREE.Vector3(tilted.origin.x, tilted.origin.y, tilted.origin.z)
      .addScaledVector(normal, subject.height / 2);
    expect(centre.distanceTo(expected)).toBeLessThan(1e-6);
    // Und in den Koordinaten der Ebene steht er im Ursprung, eine halbe Hoehe
    // darueber.
    const local = placementWorkplaneCoordinates(tilted, centre);
    expect(Math.hypot(local.x, local.z)).toBeLessThan(1e-6);
    expect(local.y).toBeCloseTo(subject.height / 2, 6);
  });

  it("turns the object so its underside faces the plane", () => {
    const subject = shape("a", 0, 0, 0);
    const patch = placementPatchForNewShape(subject, tilted, tilted.origin);
    const euler = new THREE.Euler(
      THREE.MathUtils.degToRad(patch.rotationX ?? 0),
      THREE.MathUtils.degToRad(patch.rotation ?? 0),
      THREE.MathUtils.degToRad(patch.rotationZ ?? 0),
      "XYZ",
    );
    const up = new THREE.Vector3(0, 1, 0).applyEuler(euler);
    expect(up.angleTo(normal)).toBeLessThan(1e-6);
  });

  it("keeps several objects in their arrangement and centres the group", () => {
    // Dieselbe Rechnung wie im Editor: die Mitten in Ebenenkoordinaten, um
    // ihren Mittelwert verschoben.
    const subjects = [shape("a", 30, 10, 0), shape("b", 50, 10, 0), shape("c", 40, 30, 0)];
    const places = subjects.map((subject) => placementWorkplaneCoordinates(tilted, {
      x: subject.x,
      y: (subject.elevation ?? 0) + subject.height / 2,
      z: subject.z,
    }));
    const centreX = places.reduce((total, place) => total + place.x, 0) / places.length;
    const centreZ = places.reduce((total, place) => total + place.z, 0) / places.length;
    const centres = subjects.map((subject, index) => alignedCentre(
      subject,
      placementWorkplanePoint(tilted, places[index].x - centreX, places[index].z - centreZ),
    ));

    // Jeder Koerper steht auf der Ebene ...
    centres.forEach((centre) => {
      const above = centre.clone().sub(new THREE.Vector3(tilted.origin.x, tilted.origin.y, tilted.origin.z)).dot(normal);
      expect(above).toBeCloseTo(5, 6);
    });
    // ... die Gruppenmitte liegt im Ursprung ...
    const groupCentre = centres.reduce((total, centre) => total.add(centre), new THREE.Vector3()).multiplyScalar(1 / centres.length);
    const local = placementWorkplaneCoordinates(tilted, groupCentre);
    expect(Math.hypot(local.x, local.z)).toBeLessThan(1e-6);
    /*
     * ... und die Anordnung bleibt, wie sie in der Ebene aussah. Gemessen wird
     * sie dort auch: senkrecht zur Ebene faellt der Abstand weg, weil alle
     * Koerper auf ihr zu liegen kommen. Zwei Koerper, die im Raum zwanzig
     * Millimeter auseinanderstanden, stehen danach so weit auseinander, wie
     * ihre Schatten auf der Ebene es taten.
     */
    const inPlane = (index: number) => ({ x: places[index].x - centreX, z: places[index].z - centreZ });
    const planeDistance = (a: number, b: number) => Math.hypot(inPlane(a).x - inPlane(b).x, inPlane(a).z - inPlane(b).z);
    expect(centres[0].distanceTo(centres[1])).toBeCloseTo(planeDistance(0, 1), 6);
    expect(centres[0].distanceTo(centres[2])).toBeCloseTo(planeDistance(0, 2), 6);
    expect(planeDistance(0, 1)).toBeGreaterThan(0);
  });
});
