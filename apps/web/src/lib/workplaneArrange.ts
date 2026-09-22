import * as THREE from "three";
import {
  placementWorkplaneCoordinates,
  placementWorkplaneQuaternion,
  type PlacementPoint,
  type PlacementWorkplane,
} from "@/lib/placementWorkplane";
import { rotationPatchFromQuaternion, shapeRotationQuaternion } from "@/lib/geometryRotation";

export type ShapeRotationAngles = {
  rotation: number;
  rotationX: number;
  rotationZ: number;
};

const NO_ROTATION: ShapeRotationAngles = { rotation: 0, rotationX: 0, rotationZ: 0 };

function vector(point: PlacementPoint) {
  return new THREE.Vector3(point.x, point.y, point.z);
}

/**
 * Die Verschiebung, die einen Punkt ueber die Mitte der Arbeitsebene bringt.
 *
 * Verschoben wird nur laengs der beiden Achsen dieser Ebene - der Abstand von
 * der Ebene bleibt, wie er war. Auf der Hauptebene sind das die Weltachsen,
 * und es kommt genau die alte Rechnung heraus: nach X und Z schieben, die
 * Hoehe nicht anfassen. Auf einer gekippten Flaeche schiebt es entlang dieser
 * Flaeche, und dabei aendert sich auch die Hoehe.
 */
export function workplaneCentringShift(centre: PlacementPoint, workplane: PlacementWorkplane): PlacementPoint {
  const local = placementWorkplaneCoordinates(workplane, centre);
  const shift = vector(workplane.xAxis).multiplyScalar(-local.x)
    .addScaledVector(vector(workplane.zAxis), -local.z);
  return { x: shift.x, y: shift.y, z: shift.z };
}

/**
 * Die Drehung, die einen Koerper flach auf die Arbeitsebene legt.
 *
 * Gedreht wird mit den Feldern des Datensatzes, und die gelten **auf** dem,
 * was schon im Netz steckt: Wer einen Koerper dreht, laesst ihn in ein Netz
 * backen, und danach traegt das Netz diese Drehung. Wird jetzt einfach die
 * Lage der Ebene eingetragen, kommt sie oben auf die alte - der Koerper liegt
 * dann irgendwo, nur nicht flach. Deshalb wird die schon gebackene Drehung
 * erst herausgerechnet.
 *
 * Steckt keine im Netz, bleibt genau die Lage der Ebene uebrig - und auf der
 * Hauptebene ist das eine Null, also wird der Koerper dort gerade gestellt.
 */
export function workplaneAlignRotation(
  workplane: PlacementWorkplane,
  bakedRotation: ShapeRotationAngles = NO_ROTATION,
): ShapeRotationAngles {
  const target = placementWorkplaneQuaternion(workplane);
  const alreadyInTheMesh = shapeRotationQuaternion(bakedRotation).invert();
  return rotationPatchFromQuaternion(target.multiply(alreadyInTheMesh));
}
