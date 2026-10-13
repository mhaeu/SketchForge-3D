import { parseMeasurementInput } from "@/lib/measurementUnits";

/**
 * measurementFormula.ts
 *
 * Ein Massfeld behaelt seine Rechnung.
 *
 * Rechnen kann es schon: "(140+2)/2" ergibt 71. Uebrig blieb danach aber nur
 * die 71 - wer das Feld wieder anklickte, musste seine Rechnung von Hand
 * wiederherstellen, obwohl gerade sie den Gedanken traegt ("halbe Breite plus
 * zwei Wandstaerken").
 *
 * Gemerkt wird sie an der Form, nicht am Bildschirm: Damit faellt sie mit dem
 * Entwurf in die Datei, und ein Rueckgaengig nimmt Wert und Rechnung
 * zusammen - sie stehen im selben Schritt.
 *
 * Die Regel, die alles zusammenhaelt: **Eine Rechnung gilt nur, solange sie
 * den Wert ergibt, der dort steht.** Ein Wert, den danach ein Griff, ein
 * Regler oder das Skalieren gesetzt hat, zeigt wieder seine Zahl - sonst
 * stuende im Feld eine Rechnung, die etwas anderes ergibt als der Koerper
 * misst, und das waere schlimmer als keine Rechnung.
 *
 * Nach Layerling 1.59.0 (#180).
 */

/**
 * Wie weit der gerechnete Wert vom gespeicherten abweichen darf.
 *
 * Nicht null, weil zwischen Tippen und Speichern gerundet wird: Das Feld
 * rechnet in der Anzeigeeinheit, der Koerper haelt Millimeter, und ein Zoll
 * hin und zurueck trifft die letzte Stelle nicht immer. Ein Zehntausendstel
 * Millimeter liegt weit unter allem, was eine Form zeigt oder ein Drucker
 * aufloest, und weit ueber dieser Rundung.
 */
export const MEASUREMENT_FORMULA_TOLERANCE = 1e-4;

/** Steht in dieser Eingabe eine Rechnung, oder nur eine Zahl? */
export function isMeasurementFormula(input: string) {
  const compact = input.trim().replace(/[\s ]/g, "");
  if (!compact) return false;
  // Ein Vorzeichen am Anfang macht aus "-5" keine Rechnung.
  return /[+\-*/x()]/i.test(compact.slice(1));
}

/**
 * Die Rechnung, die dieses Feld zeigen soll - oder `null`.
 *
 * `null` heisst: die Zahl zeigen. Entweder gibt es keine gemerkte Rechnung,
 * oder sie ergibt nicht mehr, was dort steht.
 */
export function formulaForValue(formula: string | undefined, value: number): string | null {
  if (!formula || !Number.isFinite(value)) return null;
  const evaluated = parseMeasurementInput(formula);
  if (!Number.isFinite(evaluated)) return null;
  return Math.abs(evaluated - value) <= MEASUREMENT_FORMULA_TOLERANCE ? formula : null;
}

/**
 * Was nach einer Eingabe gemerkt wird: die Rechnung, oder `null` zum
 * Vergessen.
 *
 * Vergessen wird bei einer blanken Zahl - wer 71 tippt, will 71 sehen und
 * nicht die Rechnung von vorhin - und bei einer Eingabe, die den Wert nicht
 * ergibt, wie er am Ende gespeichert wurde (eine Grenze hat ihn gekappt, eine
 * verbundene Achse hat ihn mitgezogen).
 */
export function nextMeasurementFormula(input: string, storedValue: number): string | null {
  if (!isMeasurementFormula(input)) return null;
  return formulaForValue(input.trim(), storedValue);
}

/**
 * Die gemerkten Rechnungen einer Form nach einer Eingabe.
 *
 * Gibt `null` zurueck, wenn sich nichts aendert - dann braucht es keinen
 * Schritt im Verlauf. Und ein leeres Verzeichnis wird zu `undefined`, damit
 * eine Form ohne Rechnungen keines mit sich traegt.
 */
export function measurementFormulasPatch(
  formulas: Readonly<Record<string, string>> | undefined,
  key: string,
  formula: string | null,
): Record<string, string> | undefined | null {
  const current = formulas?.[key];
  if ((current ?? null) === formula) return null;
  const next = { ...(formulas ?? {}) };
  if (formula === null) delete next[key];
  else next[key] = formula;
  return Object.keys(next).length === 0 ? undefined : next;
}
