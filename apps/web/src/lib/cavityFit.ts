import * as THREE from "three";
import { shapeRotationQuaternion } from "@/lib/geometryRotation";
import { resizedImportedMeshPositions, shapeDepth, shapeWidth } from "@/lib/workplaneShapes";
import type { WorkplaneShape } from "@/types/sketchforge";

/**
 * Den neu gebauten vollen Koerper auf die Masse des hohlen bringen.
 *
 * Der Hohlraum eines gezeichneten Koerpers entsteht, indem dieselbe Zeichnung
 * noch einmal voll hochgezogen und der hohle davon abgezogen wird. Das setzt
 * voraus, dass beide gleich gross sind - und das stimmt nur so lange, wie
 * niemand am Koerper gezogen hat: Die Zeichnung beschreibt ihn, **wie er
 * gezeichnet wurde**, und ein spaeteres Ziehen an den Griffen steht nur am
 * Koerper.
 *
 * Gemeldet an einem Rotationskoerper, dessen Zeichnung 45 mm lang war,
 * waehrend er selbst 71 mm lang dastand: Der neu gebaute volle Koerper war
 * damit zu kurz, steckte den hohlen nicht ein, und die Sicherheitsprobe sagte
 * ab - zu Recht, denn ein Hohlraum aus zu kurzem Material haette ein Loch an
 * der falschen Stelle geschnitten.
 */

export type BodySize = { width: number; depth: number; height: number };

/**
 * Die Masse eines Koerpers in seinem **eigenen** Rahmen.
 *
 * Wurde er von Hand gedreht, sitzt die Drehung in den Punkten seines Netzes
 * und seine Masse sind die des Kastens um die gedrehte Form - fuer einen
 * Vergleich mit dem frisch gebauten, ungedrehten Koerper unbrauchbar. Der
 * mitgeschriebene Winkel dreht das Netz zurueck, und dann laesst sich ehrlich
 * messen.
 */
export function unturnedMeshSize(shape: WorkplaneShape): BodySize | null {
  const mesh = shape.importedMesh;
  if (!mesh || mesh.positions.length < 9) return null;
  // Gemessen wird am angezeigten Netz, also mit der Streckung darin.
  const positions = resizedImportedMeshPositions(shape);
  if (positions.length < 9) return null;
  const turn = shape.bakedRotation;
  const back = turn
    ? shapeRotationQuaternion({ rotation: turn.rotation, rotationX: turn.rotationX, rotationZ: turn.rotationZ } as WorkplaneShape).invert()
    : null;
  const half = shape.height / 2;
  const box = new THREE.Box3().makeEmpty();
  const point = new THREE.Vector3();
  for (let index = 0; index + 2 < positions.length; index += 3) {
    point.set(positions[index], positions[index + 1] - half, positions[index + 2]);
    if (back) point.applyQuaternion(back);
    box.expandByPoint(point);
  }
  const size = box.getSize(new THREE.Vector3());
  if (![size.x, size.y, size.z].every((value) => Number.isFinite(value) && value > 0)) return null;
  return { width: size.x, depth: size.z, height: size.y };
}

/** Gleich, bis auf ein Zehntelpromille - oder ein hundertstel Millimeter. */
function alike(a: number, b: number) {
  return Math.abs(a - b) <= Math.max(0.01, Math.abs(b) * 1e-4);
}

/**
 * Was am frisch gebauten vollen Koerper geaendert werden muss, damit er den
 * hohlen einsteckt. `null`, wenn beide schon zusammenpassen oder der hohle
 * sich nicht messen laesst.
 *
 * Beide Kaesten muessen gleich sein, weil das Fuellen nur nach innen wirkt:
 * Die aeussere Haut des vollen ist dieselbe wie die des hohlen. Weichen sie
 * ab, hat jemand am Koerper gezogen, und genau diese Streckung wird hier
 * nachgetragen.
 */
export function cavityFitPatch(built: WorkplaneShape, tool: WorkplaneShape): Partial<WorkplaneShape> | null {
  const target = unturnedMeshSize(tool);
  if (!target) return null;
  if (
    alike(shapeWidth(built), target.width)
    && alike(shapeDepth(built), target.depth)
    && alike(built.height, target.height)
  ) {
    return null;
  }
  return {
    width: target.width,
    depth: target.depth,
    height: target.height,
    size: Math.max(target.width, target.depth),
  };
}
