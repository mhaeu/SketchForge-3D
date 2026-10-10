import type { AlignAxis } from "@/types/sketchforge";

/**
 * axisLabels.ts
 *
 * Wie die drei Achsen vor dem Nutzer heissen.
 *
 * Innen rechnen wir in den Achsen von three.js: x nach rechts, **y nach
 * oben**, z nach hinten. In der Oberflaeche heissen sie anders, naemlich so,
 * wie jeder Scheibenschneider (Bambu Studio, OrcaSlicer), Tinkercad und jedes
 * CAD-Programm sie nennt:
 *
 *   X nach rechts      -> x
 *   Y nach hinten      -> z
 *   Z nach oben        -> y
 *
 * Die Hoehe heisst also **Z**, nicht Y. Vorher stand im Positionsfeld Y fuer
 * die Hoehe, waehrend das Teilen-Werkzeug schon Z dafuer schrieb - wer unsere
 * Zahlen neben den Scheibenschneider legte, hatte zwei Buchstaben vertauscht,
 * und wir untereinander auch.
 *
 * Die Felder in den Daten behalten ihre Szenennamen (`z` ist die Tiefe,
 * `elevation` die Hoehe). Das ist Absicht: Jede Rechnung an Netzen, Matrizen
 * und Normalen laeuft in den Szenenachsen, und ein zweiter Satz Namen daneben
 * waere eine Stelle mehr, an der sich jemand vertut. Umbenannt wird nur, was
 * man liest - und zwar hier.
 */

export type AxisLetter = "X" | "Y" | "Z";

/** Der Buchstabe, unter dem diese Szenenachse in der Oberflaeche steht. */
export function sceneAxisLetter(axis: AlignAxis): AxisLetter {
  return axis === "x" ? "X" : axis === "y" ? "Z" : "Y";
}

/** Und zurueck: welche Szenenachse hinter einem Buchstaben steht. */
export function sceneAxisFromLetter(letter: string): AlignAxis | null {
  const value = letter.trim().toLowerCase();
  if (value === "x") return "x";
  if (value === "y") return "z";
  if (value === "z") return "y";
  return null;
}
