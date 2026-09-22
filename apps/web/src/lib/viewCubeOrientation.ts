import * as THREE from "three";
import { placementWorkplaneIsBase, type PlacementPoint, type PlacementWorkplane } from "@/lib/placementWorkplane";
import type { CameraOrientation } from "@/lib/screenAlignedNudge";

export type ViewCubeFace = "top" | "bottom" | "front" | "back" | "right" | "left";

/**
 * Die drei Achsen der Arbeitsebene: ihre Laengsachse, ihre Normale - das
 * "Oben" dieser Ebene - und ihre Querachse.
 */
export function workplaneBasis(workplane: PlacementWorkplane) {
  return {
    x: new THREE.Vector3(workplane.xAxis.x, workplane.xAxis.y, workplane.xAxis.z),
    y: new THREE.Vector3(workplane.normal.x, workplane.normal.y, workplane.normal.z),
    z: new THREE.Vector3(workplane.zAxis.x, workplane.zAxis.y, workplane.zAxis.z),
  };
}

/** Die Richtung, in der die Kamera fuer eine Wuerfelseite steht, in Weltkoordinaten. */
const FACE_DIRECTIONS: Record<ViewCubeFace, [number, number, number]> = {
  top: [0, 1, 0],
  bottom: [0, -1, 0],
  front: [0, 0, 1],
  back: [0, 0, -1],
  right: [1, 0, 0],
  left: [-1, 0, 0],
};

/**
 * Wohin die Kamera fuer eine Seite des Wuerfels gehoert - gelesen in der
 * Arbeitsebene, die gerade gilt.
 *
 * Draufsicht heisst damit: senkrecht auf diese Ebene. Auf der Hauptebene sind
 * ihre Achsen die Weltachsen, also kommt genau heraus, was frueher auch
 * herauskam; auf einer gekippten Flaeche richtet sich die Ansicht nach ihr.
 * `up` ist die Normale der Ebene, sonst stuende das Bild schief.
 */
export function viewFaceOrientation(face: ViewCubeFace, workplane: PlacementWorkplane) {
  const basis = workplaneBasis(workplane);
  const [x, y, z] = FACE_DIRECTIONS[face];
  const direction = basis.x.clone().multiplyScalar(x)
    .addScaledVector(basis.y, y)
    .addScaledVector(basis.z, z)
    .normalize();
  return { direction, up: basis.y };
}

/** Die Lage der Kamera in Weltkoordinaten - Gier und Neigung um die Y-Achse. */
export function worldCameraOrientation(offset: PlacementPoint): CameraOrientation {
  const horizontal = Math.max(0.001, Math.hypot(offset.x, offset.z));
  return {
    yawDegrees: THREE.MathUtils.radToDeg(Math.atan2(offset.x, offset.z)),
    pitchDegrees: THREE.MathUtils.radToDeg(Math.atan2(offset.y, horizontal)),
  };
}

/**
 * Dieselbe Lage, aber in der Arbeitsebene gemessen. Daraus dreht sich der
 * Wuerfel oben links: Er zeigt, wie man auf die Ebene schaut, die gerade gilt,
 * und nicht nur, wie man auf die Hauptebene schaut.
 *
 * Die Weltrechnung bleibt daneben stehen - an ihr haengt das Verschieben mit
 * den Pfeiltasten, das sich nach dem Bildschirm richtet und nicht nach einer
 * Ebene.
 */
export function workplaneCameraOrientation(offset: PlacementPoint, workplane: PlacementWorkplane): CameraOrientation {
  if (placementWorkplaneIsBase(workplane)) return worldCameraOrientation(offset);
  const basis = workplaneBasis(workplane);
  const vector = new THREE.Vector3(offset.x, offset.y, offset.z);
  const along = vector.dot(basis.x);
  const up = vector.dot(basis.y);
  const across = vector.dot(basis.z);
  return {
    yawDegrees: THREE.MathUtils.radToDeg(Math.atan2(along, across)),
    pitchDegrees: THREE.MathUtils.radToDeg(Math.atan2(up, Math.max(0.001, Math.hypot(along, across)))),
  };
}
