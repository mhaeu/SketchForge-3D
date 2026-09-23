export type RevolveSectionPoint = [number, number];
export type RevolveSectionPolygon = RevolveSectionPoint[];

/**
 * Der volle Koerper zu einem hohlen Rotationskoerper.
 *
 * Bei einem gezeichneten Koerper reicht es, die inneren Zuege wegzulassen -
 * ein Loch im Querschnitt ist dort der Hohlraum. Bei einem Rotationskoerper
 * ist das anders: Eine Vase hat gar kein Loch im Querschnitt, ihr Hohlraum
 * entsteht daraus, dass der Umriss nur die Wand beschreibt und die Achse
 * nicht erreicht. Wer dort die Loecher weglaesst, aendert nichts.
 *
 * Voll ist ein Rotationskoerper deshalb dann, wenn zwischen der Achse und
 * seiner aeusseren Kontur nichts fehlt. Der volle Querschnitt ist also der
 * Schatten des gezeichneten zur Achse hin: Auf jeder Hoehe reicht er von
 * null bis zum weitesten Punkt, den der Umriss dort hat.
 *
 * Das trifft beide Faelle zugleich. Bei der Vase fuellt es den Innenraum bis
 * zur Wand; bei einem Rohr, das als Rechteck neben der Achse gezeichnet
 * wurde, fuellt es die Bohrung. Und eine Kerbe von aussen bleibt eine Kerbe,
 * denn dort ist der weiteste Punkt eben der Kerbengrund.
 */

/** Der weiteste Punkt des Querschnitts auf dieser Hoehe, oder null. */
function outerRadiusAt(polygons: readonly RevolveSectionPolygon[], y: number): number | null {
  let outer: number | null = null;
  for (const polygon of polygons) {
    for (let index = 0; index < polygon.length; index += 1) {
      const [r0, y0] = polygon[index];
      const [r1, y1] = polygon[(index + 1) % polygon.length];
      const low = Math.min(y0, y1);
      const high = Math.max(y0, y1);
      if (y < low || y > high || high - low < 1e-12) continue;
      const radius = r0 + (r1 - r0) * ((y - y0) / (y1 - y0));
      if (outer === null || radius > outer) outer = radius;
    }
  }
  return outer;
}

export function filledRevolveSection(polygons: readonly RevolveSectionPolygon[]): RevolveSectionPolygon[] {
  const ys = [...new Set(polygons.flatMap((polygon) => polygon.map(([, y]) => y)))].sort((a, b) => a - b);
  if (ys.length < 2) return [];
  const span = ys[ys.length - 1] - ys[0];
  if (!(span > 0)) return [];
  const nudge = span * 1e-7;

  /*
   * Abgetastet wird an jeder Hoehe, an der die Kontur einen Knick hat, und
   * dicht daneben: Eine waagerechte Flaeche springt genau dort, und ohne die
   * beiden Nachbarn faende man entweder den Wert davor oder den danach.
   * Dazwischen liegt je ein Punkt, damit auch eine schraege Wand mitkommt.
   */
  const samples: number[] = [];
  ys.forEach((y, index) => {
    if (index > 0) samples.push((ys[index - 1] + y) / 2);
    if (index > 0) samples.push(y - nudge);
    samples.push(y);
    if (index < ys.length - 1) samples.push(y + nudge);
  });

  const filled: RevolveSectionPolygon[] = [];
  let run: Array<{ y: number; radius: number }> = [];
  const flush = () => {
    if (run.length >= 2) {
      const outward = run.map(({ y, radius }) => [radius, y] as RevolveSectionPoint);
      filled.push([[0, run[0].y], ...outward, [0, run[run.length - 1].y]]);
    }
    run = [];
  };
  for (const y of samples) {
    const radius = outerRadiusAt(polygons, y);
    // Ein Querschnitt, der auf dieser Hoehe nichts hat, trennt zwei Koerper -
    // dann faengt hier ein neuer an.
    if (radius === null || radius <= 0) {
      flush();
      continue;
    }
    run.push({ y, radius });
  }
  flush();
  return filled;
}
