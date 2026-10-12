/**
 * setDownOnFace.ts
 *
 * Aufnehmen und absetzen: Man nimmt die Auswahl auf, und der naechste Klick
 * auf eine Flaeche sagt, wohin sie soll. Sie landet dort, wo der Zeiger steht,
 * mit ihrer Unterseite auf dieser Flaeche - auch auf einer schraegen.
 *
 * Der Unterschied zum Aneinanderlegen (`mateFaces.ts`) ist der eine Klick.
 * Dort zeigt man zwei Flaechen, und der Koerper behaelt seine Lage quer zur
 * Zielflaeche; hier ist die Unterseite der Auswahl die bewegte Flaeche, und
 * die Auswahl wandert quer mit - als nehme man sie in die Hand und setze sie
 * woandershin. Darum geht es auch mit mehreren Koerpern auf einmal: Eine
 * Drehung und eine Verschiebung gelten fuer alle, also behalten sie ihre Lage
 * zueinander.
 *
 * Nach Layerling 1.55.0 (#195) - die andere Haelfte von "Cruise", deren erste
 * bei uns das Fallenlassen einer neuen Form ist.
 */

import * as THREE from "three";
import { shortestTurn } from "@/lib/mateFaces";
import type { PlacementPoint, PlacementWorkplane } from "@/lib/placementWorkplane";

/** Die angeklickte Flaeche: ein Punkt darauf und ihre Normale nach aussen, in Weltmassen. */
export type SetDownTarget = { point: PlacementPoint; normal: PlacementPoint };

function vector(point: PlacementPoint) {
  return new THREE.Vector3(point.x, point.y, point.z);
}

/** Negative Null wie in `placementWorkplane`: rechnet sich richtig, vergleicht sich nicht gleich. */
function point(value: THREE.Vector3): PlacementPoint {
  return { x: value.x + 0, y: value.y + 0, z: value.z + 0 };
}

/**
 * Die Drehung, die die Unterseite der Auswahl gegen die Zielflaeche richtet.
 *
 * Unten ist die Auswahl dort, wo die Arbeitsebene unten ist, also gegen ihre
 * Normale. Danach soll die Unterseite in die Flaeche hinein zeigen, also gegen
 * deren Normale - und die kuerzeste Drehung von `-a` nach `-b` ist dieselbe
 * wie die von `a` nach `b` (gleiche Achse `a x b`, gleicher Winkel). Darum
 * steht hier die Normale der Arbeitsebene und nicht ihr Gegenteil.
 *
 * `null`, wenn eine der Richtungen keine ist. Liegt die Flaeche schon
 * parallel, kommt die Einheitsdrehung heraus.
 */
export function setDownRotation(workplane: PlacementWorkplane, targetNormal: PlacementPoint) {
  return shortestTurn(workplane.normal, targetNormal);
}

/**
 * Die Mitte der Auswahl: der Punkt, der auf den Klick wandert.
 *
 * Die Mitte ihres Kastens, nicht der Schwerpunkt - wer eine Baugruppe absetzt,
 * meint ihre Mitte und nicht die Seite, an der mehr Material haengt.
 *
 * `null` ohne Punkte: Dann gibt es nichts abzusetzen.
 */
export function selectionCentre(worldVertices: ReadonlyArray<PlacementPoint>): PlacementPoint | null {
  if (worldVertices.length === 0) return null;
  const box = new THREE.Box3();
  worldVertices.forEach((vertex) => box.expandByPoint(vector(vertex)));
  return point(box.getCenter(new THREE.Vector3()));
}

/**
 * Die Verschiebung, die die Auswahl auf die Flaeche setzt - nach dem Drehen.
 *
 * Zwei Anteile, und sie stoeren einander nicht: quer zur Flaeche wandert die
 * Mitte der Auswahl auf den angeklickten Punkt, laengs der Normale sinkt der
 * **tiefste** Punkt von allen auf die Flaeche. Dass der Querteil in der Ebene
 * liegt, heisst `lateral . n = 0` - er aendert keine der Hoehen, die den
 * tiefsten Punkt bestimmen, also darf er vorher gerechnet werden.
 *
 * Der tiefste Punkt von **allen** und nicht je Koerper: Sonst setzte jeder
 * Koerper einer Baugruppe fuer sich ab und sie fiele auseinander - derselbe
 * Grund wie bei `dropTogetherTranslation`.
 *
 * `null`, wenn die Normale keine ist oder keine Punkte da sind.
 */
export function setDownTranslation(
  target: SetDownTarget,
  worldVertices: ReadonlyArray<PlacementPoint>,
): PlacementPoint | null {
  const normal = vector(target.normal);
  if (normal.lengthSq() < 1e-12) return null;
  normal.normalize();
  const centre = selectionCentre(worldVertices);
  if (!centre) return null;

  const onFace = vector(target.point);
  const offset = onFace.clone().sub(vector(centre));
  const lateral = offset.clone().addScaledVector(normal, -offset.dot(normal));

  let lowest = Number.POSITIVE_INFINITY;
  worldVertices.forEach((vertex) => {
    lowest = Math.min(lowest, vector(vertex).sub(onFace).dot(normal));
  });
  if (!Number.isFinite(lowest)) return null;

  return point(lateral.addScaledVector(normal, -lowest));
}
