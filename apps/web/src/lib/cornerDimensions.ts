/**
 * cornerDimensions.ts
 *
 * Zwei Masse, die zusammen eingetippt werden, als ein Schritt.
 *
 * Der Klick auf eine Ecke schlaegt Breite und Laenge zugleich auf. Sie
 * einzeln zu setzen hat zwei Fehler: Es schreibt zwei Schritte in den
 * Verlauf, von denen keiner fuer sich gewollt war, und das zweite Mass
 * rechnet auf dem Koerper von vorher - bei einem verjuengten Koerper haengt
 * seine Mitte aber am ersten.
 *
 * Darum wird gekettet: Jedes Mass rechnet auf dem Ergebnis des vorigen, und
 * hinaus geht ein Flicken.
 */

export type TypedDimension<Axis extends string> = {
  axis: Axis;
  /** Was im Feld steht. */
  value: string;
  /** Was darin stand, als es aufging. */
  original: string;
};

/**
 * Der Flicken aus mehreren eingetippten Massen.
 *
 * Unveraendert gelassene Felder bleiben aussen vor: Wer nur die Breite
 * eintippt und die Laenge stehenlaesst, soll die Laenge nicht neu gesetzt
 * bekommen - schon weil das Feld gerundet anzeigt und das Zurueckschreiben
 * den Koerper um die Rundung verschoebe.
 *
 * `patchFor` gibt `null` fuer eine Eingabe, aus der kein Mass zu lesen ist;
 * dieses Feld wird dann uebergangen, die anderen gelten trotzdem.
 */
export function mergedDimensionPatch<Shape, Axis extends string>(
  shape: Shape,
  entries: ReadonlyArray<TypedDimension<Axis>>,
  patchFor: (shape: Shape, axis: Axis, value: string) => Partial<Shape> | null,
): Partial<Shape> {
  let working = shape;
  let merged: Partial<Shape> = {};
  entries.forEach((entry) => {
    if (entry.value.trim() === entry.original.trim()) return;
    const patch = patchFor(working, entry.axis, entry.value);
    if (!patch) return;
    working = { ...working, ...patch };
    merged = { ...merged, ...patch };
  });
  return merged;
}
