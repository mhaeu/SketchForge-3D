/**
 * layFlat.ts
 *
 * Auf eine Flaeche legen: Man zeigt auf eine Flaeche des Koerpers, und der
 * Koerper dreht sich so, dass genau diese Flaeche unten liegt, und setzt sich
 * auf die Arbeitsebene.
 *
 * Fuer den Druck ist das die haeufigste Frage ueberhaupt - welche Seite liegt
 * auf der Platte. Ueber die Winkelregler ist sie kaum zu beantworten: Wer eine
 * schraege Flaeche unten haben will, muesste zwei Winkel gleichzeitig raten.
 *
 * Nach Layerling 1.19.0.
 *
 * License: MIT
 */

import * as THREE from "three";
import type { PlacementPoint, PlacementWorkplane } from "@/lib/placementWorkplane";

function vector(point: PlacementPoint) {
  return new THREE.Vector3(point.x, point.y, point.z);
}

/**
 * Die Drehung, die `faceNormal` gegen die Arbeitsebene richtet.
 *
 * Die Normale der Flaeche zeigt nach aussen. Unten liegt die Flaeche, wenn
 * diese Richtung **gegen** die Normale der Arbeitsebene zeigt - auf der
 * Hauptebene also nach unten.
 *
 * `null`, wenn eine der Richtungen keine ist. Liegt die Flaeche schon richtig,
 * kommt die Einheitsdrehung heraus; liegt sie genau falsch, also oben, waehlt
 * `setFromUnitVectors` eine der unendlich vielen Achsen, um die man sie
 * umschlagen kann - jede davon ist richtig.
 */
export function layFlatRotation(faceNormal: PlacementPoint, workplane: PlacementWorkplane): THREE.Quaternion | null {
  const from = vector(faceNormal);
  const to = vector(workplane.normal).negate();
  if (from.lengthSq() < 1e-12 || to.lengthSq() < 1e-12) return null;
  return new THREE.Quaternion().setFromUnitVectors(from.normalize(), to.normalize());
}

/**
 * Um wie viel Grad der Koerper sich dabei dreht.
 *
 * Nur fuer die Rueckmeldung: "schon flach" ist etwas anderes als "um 137 Grad
 * gedreht", und wer das eine erwartet und das andere bekommt, will es wissen.
 */
export function layFlatAngleDegrees(rotation: THREE.Quaternion) {
  // Ueber den Realteil, damit auch die Einheitsdrehung genau null ergibt.
  const half = Math.min(1, Math.abs(rotation.w));
  return THREE.MathUtils.radToDeg(2 * Math.acos(half));
}

/**
 * Die gemeinsame Verschiebung, die alle Koerper auf die Arbeitsebene setzt.
 *
 * `translationToWorkplane` gibt es schon, aber je Koerper. Mehrere Koerper
 * duerfen nicht jeder fuer sich absetzen - dann verlieren sie ihre Lage
 * zueinander. Gemessen wird darum der tiefste Punkt von allen, und der
 * bestimmt die eine Verschiebung.
 */
export function dropTogetherTranslation(
  workplane: PlacementWorkplane,
  worldVertices: ReadonlyArray<PlacementPoint>,
): PlacementPoint {
  if (worldVertices.length === 0) return { x: 0, y: 0, z: 0 };
  const origin = vector(workplane.origin);
  const normal = vector(workplane.normal);
  let lowest = Number.POSITIVE_INFINITY;
  worldVertices.forEach((vertex) => {
    lowest = Math.min(lowest, vector(vertex).sub(origin).dot(normal));
  });
  if (!Number.isFinite(lowest)) return { x: 0, y: 0, z: 0 };
  const translation = normal.multiplyScalar(-lowest);
  // Negative Null wie in `placementWorkplane`: Sie rechnet sich richtig,
  // schreibt sich aber in die Datei und vergleicht sich nicht gleich.
  return {
    x: translation.x === 0 ? 0 : translation.x,
    y: translation.y === 0 ? 0 : translation.y,
    z: translation.z === 0 ? 0 : translation.z,
  };
}
