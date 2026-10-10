/**
 * roundWave.ts
 *
 * Eine runde Welle um einen Kreis: `teeth` nach aussen gewoelbte Boegen ueber
 * den Koepfen und ebenso viele nach innen gewoelbte in den Luecken, jeder
 * glatt in den naechsten laufend.
 *
 * Das ist die Form von Tinkercads "useful gear": Kleine gedruckte Zahnraeder
 * mit solchen Zaehnen sind nachsichtiger als evolventische - sie verzeihen
 * eine Duese, die etwas zu viel legt - und auf einem Drehknopf geben sie einen
 * angenehmen Griff.
 *
 * Die Welle steht hier fuer sich, weil zwei Formen sie brauchen: die runden
 * Zaehne des Zahnrades und (spaeter) die runde Raendelung. Nach Layerling
 * 1.58.0 (#201), wo sie im Zahnrad wohnt.
 */

/**
 * Der laengste Schritt entlang eines Bogens im gezeichneten Umriss, im
 * Bogenmass: unter den 12 Grad, bei denen das Netz seine Normalen und
 * Kantenlinien bricht - so bleiben die Flanken glatt.
 */
export const ROUND_ARC_STEP = (11 * Math.PI) / 180;

export type RoundWave = {
  teeth: number;
  tipRadius: number;
  rootRadius: number;
  /** Der Kopfbogen: der Abstand seiner Mitte von der Achse, auf der Zahnmitte, und sein Halbmesser. */
  toothCentre: number;
  toothRadius: number;
  /** Der Lueckenbogen, eine halbe Teilung weiter. */
  gapCentre: number;
  gapRadius: number;
  /** Der Winkel der ersten Zahnmitte, von +x nach +z. */
  firstCentre: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Die Welle mit Koepfen auf `tipRadius`, Gruenden auf `rootRadius`, und einem
 * Zahn, der auf `midRadius` zu jeder Seite `halfThickness` breit ist (als
 * Winkel von seiner Mitte).
 *
 * Gesucht wird der Kopfhalbmesser, der diese Dicke ergibt - durch Halbieren,
 * weil der Zusammenhang sich nicht nach ihm aufloesen laesst: Zu jedem
 * Kopfbogen gehoert der Lueckenbogen, der ihn glatt beruehrt, und erst aus
 * beiden ergibt sich die Dicke.
 *
 * Zwei Boegen je Teilung koennen nicht viel tiefer stehen als eine halbe
 * Teilung, ohne am Fuss auszubauchen - die Aufrufer halten ihre Zaehne
 * darunter.
 */
export function roundWave(
  teeth: number,
  tipRadius: number,
  rootRadius: number,
  midRadius: number,
  halfThickness: number,
  firstCentre: number,
): RoundWave {
  const half = Math.PI / teeth;
  const gapCos = Math.cos(half);
  const gapSin = Math.sin(half);
  /** Zu einem Kopfbogen der Lueckenbogen, der ihn von aussen beruehrt. */
  const gapFor = (toothRadius: number) => {
    const toothCentre = tipRadius - toothRadius;
    const miss = (gapRadius: number) => {
      const centre = rootRadius + gapRadius;
      return Math.hypot(centre * gapCos - toothCentre, centre * gapSin) - toothRadius - gapRadius;
    };
    let low = 0;
    let high = tipRadius * 4;
    if (miss(low) <= 0 || miss(high) >= 0) return null;
    for (let step = 0; step < 60; step += 1) {
      const middle = (low + high) / 2;
      if (miss(middle) > 0) low = middle;
      else high = middle;
    }
    return { toothCentre, gapRadius: low, gapCentre: rootRadius + low };
  };
  /** Wie dick der Zahn auf dem mittleren Kreis ist, als Winkel von seiner Mitte. */
  const thickness = (toothRadius: number) => {
    const gap = gapFor(toothRadius);
    if (!gap) return null;
    const { toothCentre, gapCentre, gapRadius } = gap;
    const towards = toothRadius / (toothRadius + gapRadius);
    const touchX = toothCentre + (gapCentre * gapCos - toothCentre) * towards;
    const touchZ = gapCentre * gapSin * towards;
    const angleAt = (centre: number, radius: number) => Math.acos(clamp((midRadius ** 2 + centre ** 2 - radius ** 2) / (2 * midRadius * centre), -1, 1));
    // Je nachdem, ob der Beruehrpunkt innerhalb des mittleren Kreises liegt,
    // schneidet ihn der Kopfbogen oder der Lueckenbogen.
    return Math.hypot(touchX, touchZ) <= midRadius ? angleAt(toothCentre, toothRadius) : half - angleAt(gapCentre, gapRadius);
  };
  const depth = Math.max(1e-6, tipRadius - rootRadius);
  let low = depth * 0.02;
  let high = depth;
  for (let step = 0; step < 60; step += 1) {
    const middle = (low + high) / 2;
    const at = thickness(middle);
    if (at !== null && at < halfThickness) low = middle;
    else high = middle;
  }
  const gap = gapFor(low) ?? { toothCentre: tipRadius - low, gapRadius: depth * 0.02, gapCentre: rootRadius + depth * 0.02 };
  return { teeth, tipRadius, rootRadius, toothCentre: gap.toothCentre, toothRadius: low, gapCentre: gap.gapCentre, gapRadius: gap.gapRadius, firstCentre };
}

/**
 * Die beiden Boegen des Zahnes `index`, als Winkel um ihre **eigenen** Mitten
 * (Bogenmass von +x nach +z): der Kopfbogen von seinem linken Beruehrpunkt
 * ueber den Kopf zum rechten, dann der Lueckenbogen von dort ueber den Grund
 * zum linken Beruehrpunkt des naechsten Zahnes.
 */
export function roundToothArcs(wave: RoundWave, index: number) {
  const { teeth, toothCentre, toothRadius, gapCentre, gapRadius } = wave;
  const centre = wave.firstCentre + (index / teeth) * Math.PI * 2;
  const half = Math.PI / teeth;
  const gapX = gapCentre * Math.cos(half);
  const gapZ = gapCentre * Math.sin(half);
  const towards = toothRadius / (toothRadius + gapRadius);
  const touchX = toothCentre + (gapX - toothCentre) * towards;
  const touchZ = gapZ * towards;
  // Um die Zahnmitte liegt der rechte Beruehrpunkt bei +reach, der linke gespiegelt.
  const reach = Math.atan2(touchZ, touchX - toothCentre);
  // Um die Lueckenmitte: vom Beruehrpunkt ueber den Grund (der zur Achse
  // schaut) zu seinem Spiegelbild.
  let gapStart = Math.atan2(touchZ - gapZ, touchX - gapX);
  const root = half + Math.PI;
  while (gapStart < root - Math.PI) gapStart += Math.PI * 2;
  while (gapStart >= root + Math.PI) gapStart -= Math.PI * 2;
  const turn = (x: number, z: number) => ({ x: x * Math.cos(centre) - z * Math.sin(centre), z: x * Math.sin(centre) + z * Math.cos(centre) });
  return {
    tooth: { ...turn(toothCentre, 0), radius: toothRadius, start: centre - reach, end: centre + reach },
    gap: { ...turn(gapX, gapZ), radius: gapRadius, start: centre + gapStart, end: centre + 2 * root - gapStart },
  };
}

export type RoundWaveCorner = { angle: number; radiusX: number; radiusZ: number };

/** Die Welle als Ecken auf Kreisen, fuer das gezeichnete Netz. */
export function roundWaveCorners(wave: RoundWave): RoundWaveCorner[] {
  const corners: RoundWaveCorner[] = [];
  const push = (x: number, z: number) => {
    const radius = Math.hypot(x, z);
    corners.push({ angle: Math.atan2(z, x), radiusX: radius, radiusZ: radius });
  };
  for (let tooth = 0; tooth < wave.teeth; tooth += 1) {
    const arcs = roundToothArcs(wave, tooth);
    // Eine gerade Anzahl Schritte setzt je eine Ecke genau auf den Kopf und
    // auf den Grund, damit der Umriss sein Mass wirklich erreicht.
    const steps = (span: number) => 2 * Math.max(1, Math.ceil(Math.abs(span) / (2 * ROUND_ARC_STEP)));
    const toothSteps = steps(arcs.tooth.end - arcs.tooth.start);
    const gapSteps = steps(arcs.gap.end - arcs.gap.start);
    for (let step = 0; step <= toothSteps; step += 1) {
      const angle = arcs.tooth.start + ((arcs.tooth.end - arcs.tooth.start) * step) / toothSteps;
      push(arcs.tooth.x + arcs.tooth.radius * Math.cos(angle), arcs.tooth.z + arcs.tooth.radius * Math.sin(angle));
    }
    for (let step = 1; step < gapSteps; step += 1) {
      const angle = arcs.gap.start + ((arcs.gap.end - arcs.gap.start) * step) / gapSteps;
      push(arcs.gap.x + arcs.gap.radius * Math.cos(angle), arcs.gap.z + arcs.gap.radius * Math.sin(angle));
    }
  }
  // Die Winkel muessen rund herum steigen, wie bei den geraden und den
  // evolventischen Ecken - das Netz und die Deckel verlassen sich darauf.
  for (let index = 1; index < corners.length; index += 1) {
    while (corners[index].angle < corners[index - 1].angle - Math.PI) corners[index].angle += Math.PI * 2;
  }
  return corners;
}

/**
 * Der Halbmesser der Welle in Richtung `phi` - dort, wo dieser Strahl aus der
 * Mitte sie trifft.
 *
 * Gebraucht wird das, wo nicht der Umriss abgefahren, sondern an einer
 * bestimmten Richtung gefragt wird: die Fase der Raendelung schneidet als
 * Kegel (`min(Umriss, Kegel)`), und die gekreuzte Raendelung legt zwei
 * verdrehte Wellen uebereinander und nimmt die kleinere.
 *
 * Gerechnet wird der Schnitt des Strahls mit dem Kreis, auf dem das Stueck
 * liegt: |t * d - c| = r. Beim Kopfbogen ist die Flaeche die **aeussere**
 * Loesung, beim Lueckenbogen die innere - sein Mittelpunkt liegt weiter
 * aussen als der Grund, den er beschreibt.
 */
export function roundWaveRadiusAt(wave: RoundWave, phi: number) {
  const { teeth, toothCentre, toothRadius, gapCentre, gapRadius } = wave;
  const step = (Math.PI * 2) / teeth;
  const half = Math.PI / teeth;
  // Der Winkel zur naechsten Zahnmitte, zwischen -half und +half.
  const fromCentre = ((((phi - wave.firstCentre) % step) + step + half) % step) - half;
  const towards = toothRadius / (toothRadius + gapRadius);
  const touchX = toothCentre + (gapCentre * Math.cos(half) - toothCentre) * towards;
  const touchZ = gapCentre * Math.sin(half) * towards;
  const touchAngle = Math.atan2(touchZ, touchX);
  const onTooth = Math.abs(fromCentre) <= touchAngle;
  // Die Mitte des Stuecks, von der Zahnmitte aus gesehen.
  const centreAngle = onTooth ? 0 : half;
  const centreDistance = onTooth ? toothCentre : gapCentre;
  const radius = onTooth ? toothRadius : gapRadius;
  // Richtung des Strahls, relativ zur Mitte des Stuecks.
  const angle = Math.abs(fromCentre) - centreAngle;
  const along = centreDistance * Math.cos(angle);
  const square = along * along - centreDistance * centreDistance + radius * radius;
  if (square < 0) return onTooth ? wave.tipRadius : wave.rootRadius;
  const root = Math.sqrt(square);
  return onTooth ? along + root : along - root;
}
