/**
 * boreGeometry.ts
 *
 * Drei Bohrformen, die man beim Drucken dauernd braucht und bisher aus zwei
 * oder drei Koerpern zusammensetzen musste:
 *
 * - **Zylindersenkung**: das Loch fuer eine Zylinderkopfschraube, deren Kopf
 *   in einer weiteren Bohrung verschwindet.
 * - **Senkung**: dasselbe fuer eine Senkkopfschraube - ein Kegel ueber dem
 *   Schaft, ueblicherweise mit 90 Grad.
 * - **Tropfenloch**: ein liegendes Loch mit einer Spitze oben. Der Drucker
 *   muss oben nicht ueber die Waagerechte bauen, und darum bleibt das Loch
 *   rund, statt oben zusammenzufallen.
 *
 * Alle drei sind als Abzugskoerper gedacht: hinstellen, mit dem Werkstueck
 * verschneiden, fertig.
 *
 * Die Zahlen werden hier gerechnet, die Netze auch - die Profile bleiben
 * dabei fuer sich pruefbar, denn an ihnen haengt die Form.
 *
 * Nach Layerling 1.23.0.
 */

import * as THREE from "three";

/** Wie viele Seiten die Bohrung bekommt. */
export const DEFAULT_BORE_SIDES = 64;
export const MIN_BORE_SIDES = 3;
export const MAX_BORE_SIDES = 256;

/** Der Kegelwinkel einer Senkung. 90 Grad ist die Norm fuer Senkkopfschrauben. */
export const DEFAULT_COUNTERSINK_ANGLE = 90;
export const MIN_COUNTERSINK_ANGLE = 30;
export const MAX_COUNTERSINK_ANGLE = 170;

/** Der Spitzenwinkel eines Tropfenlochs. 90 Grad steht auf 45 Grad Ueberhang. */
export const DEFAULT_TEARDROP_TIP_ANGLE = 90;
export const MIN_TEARDROP_TIP_ANGLE = 30;
export const MAX_TEARDROP_TIP_ANGLE = 150;

/** Ob diese Art eine der drei Bohrformen ist. */
export function isBoreKind(kind: string) {
  return kind === "counterbore" || kind === "countersink" || kind === "teardrop";
}

export type ProfilePoint = { r: number; y: number };
export type SectionPoint = { x: number; y: number };

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function finite(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function normalizeBoreSides(value: unknown) {
  return Math.round(clamp(finite(value, DEFAULT_BORE_SIDES), MIN_BORE_SIDES, MAX_BORE_SIDES));
}

export function normalizeCountersinkAngle(value: unknown) {
  return clamp(finite(value, DEFAULT_COUNTERSINK_ANGLE), MIN_COUNTERSINK_ANGLE, MAX_COUNTERSINK_ANGLE);
}

export function normalizeTeardropTipAngle(value: unknown) {
  return clamp(finite(value, DEFAULT_TEARDROP_TIP_ANGLE), MIN_TEARDROP_TIP_ANGLE, MAX_TEARDROP_TIP_ANGLE);
}

/**
 * Der Kopfdurchmesser. Er muss groesser sein als der Schaft, sonst ist es
 * keine Senkung mehr - und er bleibt in der Naehe des Schafts, damit der
 * Regler etwas zu regeln hat.
 */
export function normalizeBoreHeadDiameter(value: unknown, width: number) {
  const shaft = Math.max(0.2, width);
  return clamp(finite(value, shaft * 1.8), shaft * 1.05, shaft * 6);
}

/** Die Kopftiefe einer Zylindersenkung: mehr als nichts, weniger als alles. */
export function normalizeBoreHeadDepth(value: unknown, height: number) {
  const total = Math.max(0.2, height);
  return clamp(finite(value, total * 0.4), total * 0.02, total * 0.95);
}

/**
 * Das Profil einer Zylindersenkung, von der Achse aus.
 *
 * Unten der Schaft, oben die weitere Bohrung fuer den Kopf. Das Profil
 * beginnt und endet auf der Achse: So macht die Drehung daraus einen
 * geschlossenen Koerper, Deckel und Boden inbegriffen.
 */
export function counterboreProfile(
  width: number,
  height: number,
  headDiameter: unknown,
  headDepth: unknown,
): ProfilePoint[] {
  const shaft = Math.max(0.1, width) / 2;
  const total = Math.max(0.2, height);
  const head = normalizeBoreHeadDiameter(headDiameter, width) / 2;
  const depth = normalizeBoreHeadDepth(headDepth, total);
  return [
    { r: 0, y: 0 },
    { r: shaft, y: 0 },
    { r: shaft, y: total - depth },
    { r: head, y: total - depth },
    { r: head, y: total },
    { r: 0, y: total },
  ];
}

/**
 * Wie tief der Kegel einer Senkung reicht.
 *
 * `angle` ist der ganze Kegelwinkel, also der Winkel zwischen den beiden
 * Flanken. Die halbe Flanke steht damit unter `angle / 2` zur Achse, und
 * ueber den Radiusunterschied ergibt sich die Tiefe.
 */
export function countersinkConeDepth(width: number, headDiameter: unknown, angle: unknown) {
  const shaft = Math.max(0.1, width) / 2;
  const head = normalizeBoreHeadDiameter(headDiameter, width) / 2;
  const half = THREE.MathUtils.degToRad(normalizeCountersinkAngle(angle) / 2);
  return (head - shaft) / Math.tan(half);
}

/**
 * Das Profil einer Senkung: Schaft, dann der Kegel bis zur Oberseite.
 *
 * Ist der Kegel tiefer als der Koerper, bleibt vom Schaft nichts uebrig - dann
 * beginnt der Kegel unten und endet trotzdem oben, damit die Form nicht
 * umklappt.
 */
export function countersinkProfile(
  width: number,
  height: number,
  headDiameter: unknown,
  angle: unknown,
): ProfilePoint[] {
  const shaft = Math.max(0.1, width) / 2;
  const total = Math.max(0.2, height);
  const head = normalizeBoreHeadDiameter(headDiameter, width) / 2;
  const cone = Math.min(total, countersinkConeDepth(width, headDiameter, angle));
  return [
    { r: 0, y: 0 },
    { r: shaft, y: 0 },
    { r: shaft, y: total - cone },
    { r: head, y: total },
    { r: 0, y: total },
  ];
}

/**
 * Wie weit die Spitze eines Tropfenlochs ueber die Kreismitte reicht, fuer
 * einen Kreis mit Radius 1.
 *
 * Die beiden Flanken sind Tangenten an den Kreis. Steht die Flanke unter
 * `angle / 2` zur Hochachse, liegt die Spitze im Abstand 1 / sin(angle / 2)
 * von der Mitte - bei 90 Grad also 1,41 statt 1.
 */
export function teardropApexDistance(angle: unknown) {
  const half = THREE.MathUtils.degToRad(normalizeTeardropTipAngle(angle) / 2);
  return 1 / Math.sin(half);
}

/**
 * Wie tief ein Tropfenloch insgesamt ist - Loch samt Spitze.
 *
 * Die Tiefe des Koerpers folgt der Breite: Das Loch soll rund bleiben, und
 * die Spitze kommt oben dazu. Wer an der Tiefe drehen koennte, machte aus dem
 * runden Loch ein ovales, und genau das soll ein Tropfenloch nicht sein.
 */
export function teardropDepthFor(width: number, angle: unknown) {
  return (Math.max(0.1, width) / 2) * (1 + teardropApexDistance(angle));
}

/**
 * Der Querschnitt eines Tropfenlochs fuer einen Kreis mit Radius 1: der Bogen
 * um die Kreismitte und darueber die Spitze.
 *
 * Die Mitte des Kreises liegt bei (0, 0), die Spitze auf der Hochachse. Wer
 * die Form in Millimetern braucht, streckt sie - eine Streckung macht aus
 * Tangenten wieder Tangenten, die Flanken bleiben also gerade.
 */
export function teardropSection(angle: unknown, segments = DEFAULT_BORE_SIDES): SectionPoint[] {
  const half = THREE.MathUtils.degToRad(normalizeTeardropTipAngle(angle) / 2);
  const apex = teardropApexDistance(angle);
  // Der Beruehrpunkt der Tangente, gemessen von der Hochachse aus.
  const touch = Math.PI / 2 - half;
  const steps = Math.max(6, Math.round(segments));
  const points: SectionPoint[] = [];
  /*
   * Der Bogen laeuft von der rechten Beruehrstelle ueber unten zur linken.
   * Gezaehlt wird im Uhrzeigersinn um die Hochachse, damit die Spitze am
   * Ende dazukommt und die Umrandung geschlossen ist.
   */
  const sweep = 2 * Math.PI - 2 * touch;
  for (let step = 0; step <= steps; step += 1) {
    const around = touch + (step / steps) * sweep;
    points.push({ x: Math.sin(around), y: Math.cos(around) });
  }
  points.push({ x: 0, y: apex });
  return points;
}

/** Das Netz einer Zylindersenkung. */
export function createCounterboreGeometry(options: {
  width: number;
  depth: number;
  height: number;
  headDiameter?: number;
  headDepth?: number;
  sides?: number;
}) {
  return latheFromProfile(
    counterboreProfile(options.width, options.height, options.headDiameter, options.headDepth),
    options.width,
    options.depth,
    options.sides,
  );
}

/** Das Netz einer Senkung. */
export function createCountersinkGeometry(options: {
  width: number;
  depth: number;
  height: number;
  headDiameter?: number;
  headAngle?: number;
  sides?: number;
}) {
  return latheFromProfile(
    countersinkProfile(options.width, options.height, options.headDiameter, options.headAngle),
    options.width,
    options.depth,
    options.sides,
  );
}

/**
 * Aus einem Profil einen Drehkoerper machen.
 *
 * Das Profil steht in Millimetern und rechnet mit der halben Breite als
 * Radius. Eine abweichende Tiefe wird nachtraeglich gestreckt - so wie beim
 * Kegel und beim Zylinder auch.
 */
function latheFromProfile(profile: ProfilePoint[], width: number, depth: number, sides?: number) {
  const segments = normalizeBoreSides(sides);
  const geometry = new THREE.LatheGeometry(
    profile.map((point) => new THREE.Vector2(point.r, point.y)),
    segments,
  );
  const stretch = Math.max(0.001, depth) / Math.max(0.001, width);
  if (Math.abs(stretch - 1) > 1e-6) geometry.scale(1, 1, stretch);
  return geometry.toNonIndexed();
}

/**
 * Das Netz eines Tropfenlochs.
 *
 * Die Bohrachse ist die Hochachse des Koerpers, wie beim Zylinder; die Spitze
 * zeigt nach hinten (+Z). Wer ein liegendes Loch braucht, legt den Koerper hin
 * und dreht die Spitze nach oben - dort, wo der Drucker sie braucht.
 */
export function createTeardropGeometry(options: {
  width: number;
  height: number;
  tipAngle?: number;
  sides?: number;
}) {
  const radius = Math.max(0.05, options.width / 2);
  const segments = normalizeBoreSides(options.sides);
  const section = teardropSection(options.tipAngle, segments);
  const shape = new THREE.Shape(section.map((point) => new THREE.Vector2(point.x * radius, point.y * radius)));
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.05, options.height),
    bevelEnabled: false,
    steps: 1,
  });
  /*
   * Die Kreismitte ist nicht die Mitte der Form: Die Spitze steht nur auf
   * einer Seite. Damit der Koerper in seinem Rahmen sitzt, wird um die halbe
   * Spitzenhoehe zurueckgeschoben.
   */
  const apex = teardropApexDistance(options.tipAngle) * radius;
  geometry.translate(0, -(apex - radius) / 2, 0);
  // Der Querschnitt liegt in XY und wird nach XZ gedreht: Die Hochachse des
  // Koerpers ist die Bohrachse, und die Spitze zeigt danach nach +Z.
  geometry.rotateX(Math.PI / 2);
  return geometry.toNonIndexed();
}
