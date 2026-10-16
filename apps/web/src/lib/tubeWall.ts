/**
 * tubeWall.ts
 *
 * Der Innendurchmesser von Rohr und Ring.
 *
 * Beide tragen nur die Wandstaerke. Wer eine Buchse fuer eine Welle von 8 mm
 * braucht, musste die Wand von Hand rechnen: (Aussen - 8) / 2. Das Feld
 * "Innendurchmesser" nimmt die Zahl, die man kennt, und setzt daraus die
 * Wand. Es ist kein eigenes Mass am Koerper - aendert man danach die Breite,
 * bleibt die Wand, und der Innendurchmesser wandert mit.
 *
 * Gemessen wird ueber die Breite. Bei einem gestreckten Rohr (Breite und
 * Tiefe verschieden) ist die Oeffnung eine Ellipse, und ihr Durchmesser quer
 * zur Breite ist um denselben Betrag kleiner als die Tiefe.
 *
 * Nach Layerling 1.77.0 (#384).
 */

/** So duenn darf die Wand hoechstens werden - wie der Regler der Wandstaerke. */
export const TUBE_MIN_WALL = 0.5;

/**
 * Die Wand, wie das Netz sie baut: mindestens 0,1, und so, dass innen
 * mindestens 0,1 mm Halbmesser bleibt (siehe createHollowCylinderGeometry).
 */
export function effectiveTubeWall(wall: number, width: number, depth: number) {
  const outer = Math.min(width, depth) / 2;
  return Math.min(Math.max(wall, 0.1), Math.max(0.1, outer - 0.1));
}

/** Der Innendurchmesser, den der Koerper wirklich hat, ueber die Breite gemessen. */
export function tubeInnerDiameter(wall: number, width: number, depth: number) {
  return Math.max(0, width - 2 * effectiveTubeWall(wall, width, depth));
}

/** Der groesste Innendurchmesser, der noch eine Wand von TUBE_MIN_WALL laesst. */
export function maxTubeInnerDiameter(width: number) {
  return Math.max(0, width - 2 * TUBE_MIN_WALL);
}

/**
 * Die Wand zu einem eingetippten Innendurchmesser. Nie duenner als
 * TUBE_MIN_WALL, nie so dick, dass innen nichts bliebe.
 */
export function tubeWallForInnerDiameter(inner: number, width: number, depth: number) {
  if (!Number.isFinite(inner)) return null;
  const wall = (width - inner) / 2;
  const outer = Math.min(width, depth) / 2;
  return Math.min(Math.max(wall, TUBE_MIN_WALL), Math.max(TUBE_MIN_WALL, outer - 0.1));
}
