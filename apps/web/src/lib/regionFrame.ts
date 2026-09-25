import * as THREE from "three";
import { placementWorkplaneQuaternion, type PlacementWorkplane } from "@/lib/placementWorkplane";
import { shapeDepth, shapeWidth } from "@/lib/workplaneShapes";
import type { ResizeRegion } from "@/lib/regionResize";
import type { WorkplaneShape } from "@/types/sketchforge";

/**
 * Der Rahmen, in dem der Teilbereich lebt.
 *
 * Der Kasten des Teilbereichs steht im **eigenen** Rahmen des Koerpers: x und
 * z um seine Mitte, y ab seiner Unterkante. Die ganze Schneidemaschinerie
 * arbeitet darin, und ihre sechs Schnittebenen stehen senkrecht auf genau
 * diesen drei Achsen.
 *
 * Damit der Kasten einer gekippten Arbeitsebene folgt, wird deshalb nicht die
 * Maschinerie umgebaut, sondern der Rahmen des Koerpers gedreht: Sein Netz
 * wird in die Arbeitsebene gedreht, und die Drehung, die es dorthin gebracht
 * hat, traegt der Koerper als Feld. Sichtbar aendert sich nichts - gerechnet
 * wird danach aber in den Achsen der Arbeitsebene.
 */

function shapeQuaternion(shape: Pick<WorkplaneShape, "rotation" | "rotationX" | "rotationZ">) {
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(
    THREE.MathUtils.degToRad(shape.rotationX ?? 0),
    THREE.MathUtils.degToRad(shape.rotation ?? 0),
    THREE.MathUtils.degToRad(shape.rotationZ ?? 0),
    "XYZ",
  ));
}

/** Die Mitte des Koerpers in der Szene - um sie dreht er sich. */
function shapeCentre(shape: WorkplaneShape) {
  return new THREE.Vector3(shape.x, (shape.elevation ?? 0) + shape.height / 2, shape.z);
}

export type RegionBoxPlacement = {
  x: number;
  z: number;
  elevation: number;
  width: number;
  depth: number;
  height: number;
  rotation: number;
  rotationX: number;
  rotationZ: number;
};

/**
 * Wo der Kasten des Teilbereichs in der Szene steht.
 *
 * Er liegt im Rahmen des Koerpers, dreht sich also mit ihm. Frueher wurde er
 * ohne diese Drehung gezeichnet - an einem gedrehten Koerper stand er dann
 * woanders als das Material, das er meint.
 */
export function regionBoxPlacement(shape: WorkplaneShape, region: ResizeRegion): RegionBoxPlacement {
  const width = Math.max(0.01, region.maxX - region.minX);
  const depth = Math.max(0.01, region.maxZ - region.minZ);
  const height = Math.max(0.01, region.maxY - region.minY);
  const local = new THREE.Vector3(
    (region.minX + region.maxX) / 2,
    (region.minY + region.maxY) / 2 - shape.height / 2,
    (region.minZ + region.maxZ) / 2,
  );
  const centre = shapeCentre(shape).add(local.applyQuaternion(shapeQuaternion(shape)));
  return {
    x: centre.x,
    z: centre.z,
    elevation: centre.y - height / 2,
    width,
    depth,
    height,
    rotation: shape.rotation ?? 0,
    rotationX: shape.rotationX ?? 0,
    rotationZ: shape.rotationZ ?? 0,
  };
}

/** Der Rueckweg: aus dem gezogenen Kasten wieder der Bereich im Rahmen des Koerpers. */
export function regionFromBoxPlacement(shape: WorkplaneShape, box: WorkplaneShape): ResizeRegion {
  const width = shapeWidth(box);
  const depth = shapeDepth(box);
  const centre = new THREE.Vector3(box.x, (box.elevation ?? 0) + box.height / 2, box.z)
    .sub(shapeCentre(shape))
    .applyQuaternion(shapeQuaternion(shape).invert());
  const middleY = centre.y + shape.height / 2;
  return {
    minX: centre.x - width / 2,
    maxX: centre.x + width / 2,
    minY: middleY - box.height / 2,
    maxY: middleY + box.height / 2,
    minZ: centre.z - depth / 2,
    maxZ: centre.z + depth / 2,
  };
}

export type WorkplaneFramePatch = {
  positions: number[];
  patch: Partial<WorkplaneShape>;
};

/**
 * Das Netz in den Rahmen der Arbeitsebene drehen, ohne den Koerper zu bewegen.
 *
 * Er steht danach genau wie vorher - nur liegen seine eigenen drei Achsen
 * jetzt auf denen der Arbeitsebene, und damit auch die sechs Schnittebenen
 * des Teilbereichs. Die Drehung, die das Netz dorthin gebracht hat, traegt
 * der Koerper als Feld wieder zurueck.
 */
export function workplaneFramePatch(shape: WorkplaneShape, workplane: PlacementWorkplane): WorkplaneFramePatch | null {
  const mesh = shape.importedMesh;
  if (!mesh || mesh.positions.length < 9) return null;
  const plane = placementWorkplaneQuaternion(workplane);
  // Steht die Arbeitsebene schon so wie der Koerper, gibt es nichts zu drehen.
  if (Math.abs(plane.angleTo(shapeQuaternion(shape))) < 1e-6) return null;
  const into = plane.clone().invert().multiply(shapeQuaternion(shape));

  const half = new THREE.Vector3(0, shape.height / 2, 0);
  const point = new THREE.Vector3();
  const turned: number[] = new Array(mesh.positions.length);
  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  for (let index = 0; index + 2 < mesh.positions.length; index += 3) {
    point.set(mesh.positions[index], mesh.positions[index + 1], mesh.positions[index + 2]).sub(half).applyQuaternion(into);
    turned[index] = point.x;
    turned[index + 1] = point.y;
    turned[index + 2] = point.z;
    min.min(point);
    max.max(point);
  }
  if (!Number.isFinite(min.x) || !Number.isFinite(max.x)) return null;

  const centre = min.clone().add(max).multiplyScalar(0.5);
  const width = Math.max(0.01, max.x - min.x);
  const height = Math.max(0.01, max.y - min.y);
  const depth = Math.max(0.01, max.z - min.z);
  for (let index = 0; index + 2 < turned.length; index += 3) {
    turned[index] -= centre.x;
    turned[index + 1] -= centre.y - height / 2;
    turned[index + 2] -= centre.z;
  }

  // Der Koerper steht weiter, wo er stand: Die Mitte wandert um genau das,
  // was das Drehen an seinem Kasten verschoben hat.
  const moved = shapeCentre(shape).add(centre.clone().applyQuaternion(plane));
  const euler = new THREE.Euler().setFromQuaternion(plane, "XYZ");
  return {
    positions: turned,
    patch: {
      x: moved.x,
      z: moved.z,
      elevation: moved.y - height / 2,
      width,
      depth,
      height,
      size: Math.max(width, depth),
      rotation: THREE.MathUtils.radToDeg(euler.y),
      rotationX: THREE.MathUtils.radToDeg(euler.x),
      rotationZ: THREE.MathUtils.radToDeg(euler.z),
      importedMesh: {
        ...mesh,
        positions: turned,
        normals: undefined,
        baseWidth: width,
        baseDepth: depth,
        baseHeight: height,
      },
    },
  };
}

/**
 * Ob der Kasten des Teilbereichs an diesem Koerper noch gilt.
 *
 * Er wird im eigenen Rahmen des Netzes gemessen, also muss der Koerper das
 * schlichte Netz bleiben, in das er dafuer verwandelt wurde. Faellt das weg -
 * durch ein Rueckgaengig ueber die Verwandlung hinaus, weil der Koerper
 * verschwindet oder gesperrt wird -, ist der Kasten sinnlos.
 *
 * Eine **Drehung** ist dagegen kein Grund mehr, ihn fallen zu lassen: Seit
 * der Teilbereich der Arbeitsebene folgt, ist sie genau der Weg dorthin - der
 * Koerper traegt die Drehung der Arbeitsebene, und der Kasten dreht sich mit
 * ihm. Solange das hier eine Drehung mit ausschloss, verschwand der Kasten an
 * einer gekippten Arbeitsebene sofort wieder, und es liess sich ueberhaupt
 * kein Teilbereich waehlen.
 *
 * Eine **Spiegelung** bleibt draussen: Sie kehrt den Rahmen um, in dem
 * gemessen wird, und laesst sich nicht als Drehung mittragen.
 */
export function regionFrameStillHolds(shape: WorkplaneShape | undefined | null) {
  if (!shape || shape.kind !== "mesh" || !shape.importedMesh || shape.locked) return false;
  return !(shape.mirrorX || shape.mirrorY || shape.mirrorZ);
}
