import * as THREE from "three";
import { placementWorkplaneFromSurface, type PlacementWorkplane } from "@/lib/placementWorkplane";
import { shapeAccumulatedRotation, shapeWithParametricSource } from "@/lib/workplaneShapes";
import type { WorkplaneShape } from "@/types/sketchforge";

/**
 * Die Ebene, auf der ein Skizzenkoerper wieder aufgeht, wenn man ihn noch
 * einmal bearbeiten will.
 *
 * Sie liegt dort, wo der Umriss gezeichnet wurde: auf der unteren
 * Stirnflaeche des Koerpers, um die Mitte des Umrisses verschoben, damit die
 * Punkte wieder da liegen, wo sie lagen.
 *
 * Zwei Dinge muessen dabei aus der Urform kommen, nicht vom Datensatz. Wer den
 * Koerper gedreht hat, hat ihn in ein Netz backen lassen: seine Drehung steht
 * danach auf null und seine Hoehe ist die des Rahmens um das gedrehte Netz.
 * Mit beidem ginge die Skizze flach und zu tief auf - und laege neben ihrem
 * eigenen Koerper.
 */
export function sketchEditWorkplane(shape: WorkplaneShape): PlacementWorkplane | undefined {
  const points = shape.sketchProfile?.points;
  if (!points) return undefined;
  const source = shapeWithParametricSource(shape);
  const turned = shapeAccumulatedRotation(shape);
  const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(
    THREE.MathUtils.degToRad(turned.rotationX),
    THREE.MathUtils.degToRad(turned.rotation),
    THREE.MathUtils.degToRad(turned.rotationZ),
    "XYZ",
  ));
  const normal = new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion).normalize();
  const xAxis = new THREE.Vector3(1, 0, 0).applyQuaternion(quaternion).normalize();
  const zAxis = new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion).normalize();
  const profileCenterX = points.length
    ? (Math.min(...points.map((point) => point.x)) + Math.max(...points.map((point) => point.x))) / 2
    : 0;
  const profileCenterZ = points.length
    ? (Math.min(...points.map((point) => point.z)) + Math.max(...points.map((point) => point.z))) / 2
    : 0;
  // Die Mitte des Koerpers steht auch nach dem Backen richtig - nur seine
  // Hoehe nicht mehr, deshalb kommt der halbe Weg nach unten aus der Urform.
  const origin = new THREE.Vector3(shape.x, (shape.elevation ?? 0) + shape.height / 2, shape.z)
    .addScaledVector(normal, -source.height / 2)
    .addScaledVector(xAxis, -profileCenterX)
    .addScaledVector(zAxis, -profileCenterZ);
  return placementWorkplaneFromSurface(
    { x: origin.x, y: origin.y, z: origin.z },
    { x: normal.x, y: normal.y, z: normal.z },
    { x: xAxis.x, y: xAxis.y, z: xAxis.z },
  );
}
