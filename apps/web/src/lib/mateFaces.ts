import * as THREE from "three";
import type { PlacementPoint } from "@/lib/placementWorkplane";

/**
 * mateFaces.ts
 *
 * Flaechen aneinanderlegen: Man zeigt auf eine Flaeche des Koerpers, dann auf
 * eine Flaeche eines anderen - und der erste legt sich an den zweiten.
 *
 * Das ist die Frage, die mit den Winkelreglern kaum zu beantworten ist: Zwei
 * schraege Teile sollen flaechig aufeinanderliegen. Ueber Winkel muesste man
 * zwei Zahlen gleichzeitig raten und danach noch die Lage suchen.
 *
 * Verwandt mit `layFlat.ts` und bewusst nach demselben Muster gebaut: erst die
 * kuerzeste Drehung um den angeklickten Punkt, dann eine Verschiebung. Dort
 * ist das Ziel die Arbeitsebene, hier die Flaeche eines anderen Koerpers.
 *
 * Nach Layerling 1.48.0 (#163).
 */

/** Eine angeklickte Flaeche: Koerper, Punkt darauf und Normale nach aussen - in Weltmassen. */
export type MateFacePick = { shapeId: string; point: PlacementPoint; normal: PlacementPoint };

/**
 * Wie die bewegte Flaeche die andere trifft.
 *
 * "against" legt sie Ruecken an Ruecken aneinander - die beiden Normalen
 * zeigen voneinander weg, die Koerper beruehren sich. "flush" legt sie in
 * **eine** Ebene, die Normalen zeigen in dieselbe Richtung: zwei Teile, deren
 * Seiten eine durchgehende Flaeche bilden.
 */
export type MateMode = "against" | "flush";

function vector(point: PlacementPoint) {
  return new THREE.Vector3(point.x, point.y, point.z);
}

/**
 * Die kuerzeste Drehung, die `from` nach `to` richtet.
 *
 * `null`, wenn eine der Richtungen keine ist. Zeigen beide schon gleich, kommt
 * die Einheitsdrehung heraus. Zeigen sie genau gegeneinander, waehlt
 * `setFromUnitVectors` eine der unendlich vielen Achsen, um die man umschlagen
 * kann - fuer die Zusage "die Flaechen liegen danach parallel" ist jede davon
 * richtig, und wie der Koerper sich dabei um seine Normale dreht, ist in
 * diesem einen Fall nicht bestimmt.
 */
export function shortestTurn(from: PlacementPoint, to: PlacementPoint): THREE.Quaternion | null {
  const a = vector(from);
  const b = vector(to);
  if (a.lengthSq() < 1e-12 || b.lengthSq() < 1e-12) return null;
  return new THREE.Quaternion().setFromUnitVectors(a.normalize(), b.normalize());
}

/**
 * Um wie viel Grad der Koerper sich dreht.
 *
 * Nur fuer die Rueckmeldung - "lag schon parallel" ist etwas anderes als "um
 * 137 Grad gedreht". Gerechnet ueber den Realteil, damit die Einheitsdrehung
 * genau null ergibt.
 */
export function mateTurnDegrees(rotation: THREE.Quaternion) {
  return THREE.MathUtils.radToDeg(2 * Math.acos(Math.min(1, Math.abs(rotation.w))));
}

export type MateMotion = {
  /** Die Drehung um `pivot`, oder null, wenn die Flaechen schon parallel liegen. */
  rotation: THREE.Quaternion | null;
  /** Der angeklickte Punkt auf der bewegten Flaeche - er bleibt beim Drehen stehen. */
  pivot: THREE.Vector3;
  /** Die Verschiebung danach, nur laengs der Normale der Zielflaeche. */
  translation: PlacementPoint;
};

/**
 * Wie der Koerper sich bewegen muss, damit seine Flaeche an der anderen liegt.
 *
 * Zwei Schritte, und zwar in dieser Reihenfolge: die kuerzeste Drehung um den
 * angeklickten Punkt, bis die Flaechen parallel stehen (keine, wenn sie es
 * schon sind), dann eine Verschiebung **allein laengs der Normale der
 * Zielflaeche**. Nur so behaelt der Koerper seine Lage quer dazu: Er rutscht
 * auf die Flaeche zu, nicht auf den angeklickten Punkt.
 *
 * `gap` laesst Luft zwischen den beiden Ebenen, aus der Zielflaeche heraus
 * gemessen - fuer ein Spiel, das ein Drucker braucht.
 *
 * `null`, wenn eine der Normalen keine ist.
 */
export function mateMotion(
  source: Pick<MateFacePick, "point" | "normal">,
  target: Pick<MateFacePick, "point" | "normal">,
  mode: MateMode,
  gap = 0,
): MateMotion | null {
  const targetNormal = vector(target.normal);
  if (targetNormal.lengthSq() < 1e-12) return null;
  targetNormal.normalize();
  // Ruecken an Ruecken heisst: die bewegte Normale zeigt der anderen
  // entgegen. In einer Ebene heisst: sie zeigt dorthin, wo die andere zeigt.
  const wanted = mode === "against" ? targetNormal.clone().negate() : targetNormal.clone();
  const rotation = shortestTurn(source.normal, wanted);
  if (!rotation) return null;
  const pivot = vector(source.point);
  // Nach der Drehung liegt der angeklickte Punkt noch dort, wo er war - er ist
  // der Drehpunkt. Es bleibt der Abstand der beiden Ebenen laengs der Normale.
  const distance = vector(target.point).dot(targetNormal) + gap - pivot.dot(targetNormal);
  const translation = targetNormal.clone().multiplyScalar(distance);
  return {
    rotation: mateTurnDegrees(rotation) < 1e-6 ? null : rotation,
    pivot,
    // Negative Null wie in `placementWorkplane`: Sie rechnet sich richtig,
    // schreibt sich aber in die Datei und vergleicht sich nicht gleich.
    translation: {
      x: translation.x + 0,
      y: translation.y + 0,
      z: translation.z + 0,
    },
  };
}

/**
 * Wie weit das Spiel reichen darf, in Millimetern.
 *
 * Nach beiden Seiten: Ein negatives Spiel schiebt den Koerper in den anderen
 * hinein - gewollt, wenn danach verschnitten wird oder eine Presspassung
 * gemeint ist.
 */
export const MAX_MATE_GAP = 20;
export const MIN_MATE_GAP = -20;
