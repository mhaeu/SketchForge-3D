/**
 * marqueeSelection.ts
 *
 * Was ein aufgezogener Rahmen mit Umschalt an der Auswahl aendert.
 *
 * Mit Umschalt angeklickt *dreht* sich ein Koerper um: Ausgewaehltes faellt
 * heraus, Nichtausgewaehltes kommt hinzu. Ein Rahmen mit Umschalt tat bisher
 * nur das Zweite - er konnte nichts mehr wegnehmen. Damit war dieselbe Taste
 * am selben Werkzeug zweierlei, und ein Versehen liess sich nur noch durch
 * Neuauswaehlen beheben.
 *
 * Nach Layerling, beigetragen von @rmpel (#117).
 */

/**
 * Die Reihenfolge bleibt, soweit es geht: zuerst die bisherige Auswahl ohne
 * die umgedrehten, dann das Neue in der Reihenfolge des Rahmens. Daran haengt,
 * welcher Koerper der Anker der Auswahl ist.
 */
export function toggledMarqueeSelection(
  current: ReadonlyArray<string>,
  boxed: ReadonlyArray<string>,
): string[] {
  const inBox = new Set(boxed);
  const held = new Set(current);
  return [
    ...current.filter((id) => !inBox.has(id)),
    ...boxed.filter((id, index) => !held.has(id) && boxed.indexOf(id) === index),
  ];
}
