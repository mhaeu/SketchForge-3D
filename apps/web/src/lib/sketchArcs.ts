import type { SketchPoint, SketchSegment } from "@/types/sketchforge";

export type ArcPoint = { x: number; z: number };

/**
 * Ein Kreisbogen zwischen zwei Punkten.
 *
 * Er haengt an den beiden Punkten und laesst sie nie los: Was sich aendern
 * laesst, ist allein seine Woelbung. Die steht als `bulge` an der Kante - die
 * Hoehe des Bogens ueber der Sehne, mit Vorzeichen, gemessen in Richtung der
 * um 90 Grad gedrehten Sehne. Damit ist der Bogen durch die beiden Punkte und
 * eine Zahl beschrieben, und nicht durch Griffe, die sich zu einer beliebigen
 * Kurve verziehen lassen.
 *
 * Die Woelbung gilt immer in der Richtung der Kante, also von `startId` nach
 * `endId`. Wird die Kante andersherum durchlaufen, kehrt sich das Vorzeichen
 * um - darum geht jede Rechnung hier von der Kante aus und nicht vom Weg.
 */

/** Darunter ist ein Bogen keiner mehr, sondern eine Strecke. */
export const MIN_ARC_BULGE = 1e-4;

/**
 * So weit darf sich ein Bogen hoechstens woelben - gemessen an seiner Sehne.
 * Bei dem Vierfachen ist der Bogen schon fast ein geschlossener Kreis; noch
 * mehr, und die beiden Punkte lassen sich nicht mehr auseinanderhalten.
 */
export const MAX_ARC_BULGE_RATIO = 4;

function chordFrame(from: ArcPoint, to: ArcPoint) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dz);
  if (!(length > 1e-9)) return null;
  return {
    length,
    middle: { x: (from.x + to.x) / 2, z: (from.z + to.z) / 2 },
    // Die Sehne um 90 Grad gedreht. In diese Richtung zaehlt eine
    // positive Woelbung.
    normal: { x: -dz / length, z: dx / length },
  };
}

/** Die Woelbung auf ein Mass bringen, das sich noch zeichnen laesst. */
export function clampArcBulge(bulge: number, chordLength: number) {
  if (!Number.isFinite(bulge)) return 0;
  const limit = chordLength * MAX_ARC_BULGE_RATIO;
  return Math.min(limit, Math.max(-limit, bulge));
}

/** Der Scheitel: der Punkt des Bogens, der am weitesten von der Sehne weg liegt. */
export function arcApex(from: ArcPoint, to: ArcPoint, bulge: number): ArcPoint | null {
  const frame = chordFrame(from, to);
  if (!frame) return null;
  return { x: frame.middle.x + frame.normal.x * bulge, z: frame.middle.z + frame.normal.z * bulge };
}

/**
 * Die Woelbung, die den Bogen durch einen gegriffenen Punkt legt. So wird aus
 * dem Ziehen am Scheitel eine Groesse.
 */
export function arcBulgeThrough(from: ArcPoint, to: ArcPoint, through: ArcPoint) {
  const frame = chordFrame(from, to);
  if (!frame) return 0;
  const bulge = (through.x - frame.middle.x) * frame.normal.x + (through.z - frame.middle.z) * frame.normal.z;
  return clampArcBulge(bulge, frame.length);
}

export type ArcGeometry = {
  centre: ArcPoint;
  radius: number;
  apex: ArcPoint;
  /** Der Winkel, den der Bogen ueberstreicht, mit Vorzeichen, im Bogenmass. */
  sweep: number;
  startAngle: number;
};

/**
 * Mittelpunkt und Halbmesser des Bogens.
 *
 * Aus Sehne und Woelbung: Der Halbmesser folgt aus `r = (h^2 + (c/2)^2) /
 * (2h)`, und der Mittelpunkt liegt vom Scheitel aus um genau diesen Halbmesser
 * zurueck auf der Mittelsenkrechten. Bei einem Halbkreis faellt er mit der
 * Mitte der Sehne zusammen, bei einer flachen Woelbung liegt er weit dahinter.
 */
export function arcGeometry(from: ArcPoint, to: ArcPoint, bulge: number): ArcGeometry | null {
  const frame = chordFrame(from, to);
  if (!frame) return null;
  const height = clampArcBulge(bulge, frame.length);
  if (Math.abs(height) < MIN_ARC_BULGE) return null;
  const half = frame.length / 2;
  const radius = (height * height + half * half) / (2 * Math.abs(height));
  const back = height - radius * Math.sign(height);
  const centre = { x: frame.middle.x + frame.normal.x * back, z: frame.middle.z + frame.normal.z * back };
  const apex = { x: frame.middle.x + frame.normal.x * height, z: frame.middle.z + frame.normal.z * height };
  const angleAt = (point: ArcPoint) => Math.atan2(point.z - centre.z, point.x - centre.x);
  const startAngle = angleAt(from);
  const endAngle = angleAt(to);
  const apexAngle = angleAt(apex);
  const positive = (value: number) => {
    const wrapped = value % (Math.PI * 2);
    return wrapped < 0 ? wrapped + Math.PI * 2 : wrapped;
  };
  // Welche der beiden Haelften des Kreises gemeint ist, sagt der Scheitel:
  // Der Bogen laeuft in die Richtung, in der er vor dem Endpunkt liegt.
  const forward = positive(apexAngle - startAngle) < positive(endAngle - startAngle);
  const sweep = forward ? positive(endAngle - startAngle) : -positive(startAngle - endAngle);
  return { centre, radius, apex, sweep, startAngle };
}

export function arcPointAt(geometry: ArcGeometry, amount: number): ArcPoint {
  const angle = geometry.startAngle + geometry.sweep * amount;
  return {
    x: geometry.centre.x + Math.cos(angle) * geometry.radius,
    z: geometry.centre.z + Math.sin(angle) * geometry.radius,
  };
}

export type ArcCubic = { from: ArcPoint; control1: ArcPoint; control2: ArcPoint; to: ArcPoint };

/**
 * Der Bogen als Folge kubischer Stuecke.
 *
 * Gerechnet und gezeichnet wird ueberall dasselbe: Wo ein Kreisbogen nicht
 * unmittelbar gebaut werden kann, tritt diese Naeherung an seine Stelle. In
 * Stuecken von hoechstens einem Viertelkreis bleibt der Fehler unter einem
 * Zehntausendstel des Halbmessers - weit unter allem, was eine Duese druckt.
 */
export function arcCubics(from: ArcPoint, to: ArcPoint, bulge: number): ArcCubic[] {
  const geometry = arcGeometry(from, to, bulge);
  if (!geometry) return [];
  const pieces = Math.max(1, Math.ceil(Math.abs(geometry.sweep) / (Math.PI / 2)));
  const step = geometry.sweep / pieces;
  const handle = (4 / 3) * Math.tan(step / 4) * geometry.radius;
  const cubics: ArcCubic[] = [];
  for (let index = 0; index < pieces; index += 1) {
    const startAngle = geometry.startAngle + step * index;
    const endAngle = startAngle + step;
    const start = { x: geometry.centre.x + Math.cos(startAngle) * geometry.radius, z: geometry.centre.z + Math.sin(startAngle) * geometry.radius };
    const end = { x: geometry.centre.x + Math.cos(endAngle) * geometry.radius, z: geometry.centre.z + Math.sin(endAngle) * geometry.radius };
    cubics.push({
      from: start,
      control1: { x: start.x - Math.sin(startAngle) * handle, z: start.z + Math.cos(startAngle) * handle },
      control2: { x: end.x + Math.sin(endAngle) * handle, z: end.z - Math.cos(endAngle) * handle },
      to: end,
    });
  }
  // Anfang und Ende sollen genau auf den Punkten sitzen, an denen der Bogen
  // haengt, und nicht auf dem, was der Kosinus daraus macht.
  cubics[0].from = { ...from };
  cubics[cubics.length - 1].to = { ...to };
  return cubics;
}

/** Der Bogen als Punktzug - fuer alles, was nur einen Umriss braucht. */
export function arcSamples(from: ArcPoint, to: ArcPoint, bulge: number, steps = 24): ArcPoint[] {
  const geometry = arcGeometry(from, to, bulge);
  if (!geometry) return [{ ...to }];
  const count = Math.max(2, Math.ceil((steps * Math.abs(geometry.sweep)) / Math.PI));
  const samples: ArcPoint[] = [];
  for (let index = 1; index <= count; index += 1) samples.push(arcPointAt(geometry, index / count));
  samples[samples.length - 1] = { ...to };
  return samples;
}

export function isArcSegment(segment: SketchSegment): boolean {
  return segment.kind === "arc" && Math.abs(segment.bulge ?? 0) >= MIN_ARC_BULGE;
}

/**
 * Die Woelbung so, wie sie fuer den gerade gegangenen Weg gilt. Wer die Kante
 * rueckwaerts durchlaeuft, sieht den Bogen spiegelverkehrt.
 */
export function arcBulgeAlong(segment: SketchSegment, from: SketchPoint): number {
  const bulge = segment.bulge ?? 0;
  return segment.startId === from.id ? bulge : -bulge;
}

/** Die Geometrie einer Bogenkante, in der Richtung, in der sie durchlaufen wird. */
export function segmentArcGeometry(segment: SketchSegment, from: SketchPoint, to: SketchPoint) {
  if (!isArcSegment(segment)) return null;
  return arcGeometry(from, to, arcBulgeAlong(segment, from));
}

/**
 * Ob ein zurueckgekehrter Zug eine Flaeche umschliesst.
 *
 * Drei Strecken sind das Mindeste, was sich aus Geraden schliessen laesst -
 * zwei zwischen denselben beiden Punkten laegen aufeinander und umschloessen
 * nichts. Gekruemmt ist das anders: Zwei Boegen zwischen denselben Punkten
 * ergeben einen Kreis, und ein Bogen und eine Sehne einen Halbkreis. Deshalb
 * zaehlt hier nicht die Anzahl allein.
 */
export function stepsEncloseArea(steps: readonly { segment: SketchSegment }[]): boolean {
  if (steps.length >= 3) return true;
  if (steps.length < 2) return false;
  return steps.some((step) => step.segment.kind && step.segment.kind !== "line");
}

/**
 * Die Boegen mitziehen, wenn ihre Punkte sich bewegt haben.
 *
 * Die Woelbung steht als Laenge an der Kante, nicht als Verhaeltnis, und sie
 * gilt quer zur Sehne in einer bestimmten Richtung. Beides macht sie von den
 * beiden Punkten abhaengig: Wird die Sehne kuerzer und die Woelbung bleibt,
 * so waelbt sich der Bogen staerker heraus, als er sollte. Und wird die
 * Zeichnung gespiegelt, liegt dieselbe Zahl ploetzlich auf der anderen Seite
 * der Sehne - der Bogen stuelpt sich nach innen.
 *
 * Deshalb wird die Woelbung mitgezogen: im Verhaeltnis der Sehnenlaengen, und
 * mit umgekehrtem Vorzeichen, wenn die Abbildung den Umlaufsinn umkehrt. Das
 * haelt den Bogen bei einer gleichmaessigen Aenderung genau auf seinem Kreis.
 * Wird ungleich in Breite und Tiefe gezogen, entstuende ein Ellipsenbogen,
 * den diese Beschreibung nicht kennt; dort bleibt der ueberstrichene Winkel
 * erhalten, und die Rundung trifft ihre Schenkel noch, aber nicht mehr genau
 * im rechten Winkel.
 */
export function retargetSketchArcs(
  segments: readonly SketchSegment[],
  before: ReadonlyMap<string, ArcPoint>,
  after: ReadonlyMap<string, ArcPoint>,
  flipped = false,
): SketchSegment[] {
  const chord = (points: ReadonlyMap<string, ArcPoint>, segment: SketchSegment) => {
    const from = points.get(segment.startId);
    const to = points.get(segment.endId);
    return from && to ? Math.hypot(to.x - from.x, to.z - from.z) : null;
  };
  return segments.map((segment) => {
    if (segment.kind !== "arc" || !segment.bulge) return segment;
    const was = chord(before, segment);
    const now = chord(after, segment);
    if (!was || now === null) return segment;
    const bulge = segment.bulge * (now / was) * (flipped ? -1 : 1);
    return bulge === segment.bulge ? segment : { ...segment, bulge };
  });
}

/**
 * Ist diese Kurve in Wahrheit ein Kreisbogen?
 *
 * Ein gezeichneter Kreis liegt in der Skizze als vier Kurven - vier
 * Bezierstuecke mit dem ueblichen Faktor 0,5523 -, und eine Kurve wird im Kern
 * eine Freiformflaeche. Vier davon statt einer Zylinderwand heisst: fleckige
 * Schattierung, ein Netz aus Streudreiecken, und ein Kantenwerkzeug, das auf
 * einer Annaeherung arbeitet.
 *
 * Darum wird hier nachgesehen, ob die Kurve ein Bogen ist, und wenn ja, ihr
 * Scheitel zurueckgegeben - der Kern baut daraus einen echten Bogen.
 *
 * Geprueft wird gegen den Kreis durch Anfang, Mitte und Ende der Kurve: Liegen
 * auch die Zwischenpunkte auf ihm, ist es ein Bogen. Die Grenze ist relativ
 * zum Halbmesser, weil der Fehler einer Bezierannaeherung es auch ist -
 * gemessen weicht das Viertelstueck mit 0,5523 um 2,7e-4 Halbmesser vom Kreis
 * ab (bei 10 mm also 2,7 Mikrometer). Mit 5e-4 ist es angenommen, und eine
 * wirklich freie Kurve bleibt draussen.
 *
 * Was dabei gewonnen wird, ist nicht nur die Flaechenart: Der Bogen ist der
 * Kreis, den der Benutzer gezogen hat, die Kurve nur seine Annaeherung - und
 * zwar eine, die nach aussen woelbt. Gemessen an einem Kreis mit Halbmesser
 * 12: die vier Bezierstuecke umschliessen 452,5149 mm^2 gegen 452,3893 des
 * Kreises, also 0,277 Promille zu viel.
 *
 * Nach Layerling 1.62.3.
 */
export const BEZIER_ARC_TOLERANCE = 5e-4;

type FlatPoint = { x: number; z: number };

function bezierPoint(from: FlatPoint, first: FlatPoint, second: FlatPoint, to: FlatPoint, amount: number): FlatPoint {
  const inverse = 1 - amount;
  return {
    x: inverse ** 3 * from.x + 3 * inverse ** 2 * amount * first.x + 3 * inverse * amount ** 2 * second.x + amount ** 3 * to.x,
    z: inverse ** 3 * from.z + 3 * inverse ** 2 * amount * first.z + 3 * inverse * amount ** 2 * second.z + amount ** 3 * to.z,
  };
}

/** Die Mitte des Kreises durch drei Punkte - `null`, wenn sie auf einer Gerade liegen. */
function circleThrough(a: FlatPoint, b: FlatPoint, c: FlatPoint) {
  const determinant = 2 * (a.x * (b.z - c.z) + b.x * (c.z - a.z) + c.x * (a.z - b.z));
  if (Math.abs(determinant) < 1e-12) return null;
  const aa = a.x * a.x + a.z * a.z;
  const bb = b.x * b.x + b.z * b.z;
  const cc = c.x * c.x + c.z * c.z;
  const x = (aa * (b.z - c.z) + bb * (c.z - a.z) + cc * (a.z - b.z)) / determinant;
  const z = (aa * (c.x - b.x) + bb * (a.x - c.x) + cc * (b.x - a.x)) / determinant;
  return { x, z, radius: Math.hypot(a.x - x, a.z - z) };
}

export function bezierArcGeometry(
  from: FlatPoint,
  first: FlatPoint,
  second: FlatPoint,
  to: FlatPoint,
  tolerance = BEZIER_ARC_TOLERANCE,
): { apex: FlatPoint; radius: number } | null {
  const apex = bezierPoint(from, first, second, to, 0.5);
  const circle = circleThrough(from, apex, to);
  if (!circle || !(circle.radius > 0)) return null;
  // Dort, wo eine Bezierannaeherung am weitesten vom Kreis abliegt, und ein
  // paar Stellen dazwischen.
  for (const amount of [0.125, 0.21, 0.25, 0.375, 0.625, 0.75, 0.79, 0.875]) {
    const point = bezierPoint(from, first, second, to, amount);
    const offset = Math.abs(Math.hypot(point.x - circle.x, point.z - circle.z) - circle.radius);
    if (offset > tolerance * circle.radius) return null;
  }
  return { apex, radius: circle.radius };
}

/**
 * Der Bogen durch drei Punkte: von `from` nach `to`, durch `through`. Die
 * Woelbung ist der Abstand des Scheitels von der Sehne; der Scheitel liegt
 * auf der Seite von `through`. Mit dem Mittelpunkt C des Kreises durch die
 * drei Punkte, h = (C - Sehnenmitte) in Richtung der Normalen und dem
 * Halbmesser r ist sie h + r auf der positiven Seite und h - r auf der
 * negativen. Liegen die drei Punkte auf einer Geraden, gibt es keinen Bogen.
 * Nach layerling 1.94.0 (#643).
 */
export function arcThroughThreePoints(from: ArcPoint, to: ArcPoint, through: ArcPoint): { bulge: number; radius: number } | null {
  const frame = chordFrame(from, to);
  if (!frame) return null;
  const ax = from.x;
  const az = from.z;
  const bx = to.x;
  const bz = to.z;
  const cx = through.x;
  const cz = through.z;
  const d = 2 * (ax * (bz - cz) + bx * (cz - az) + cx * (az - bz));
  if (Math.abs(d) < 1e-9 * Math.max(1, frame.length * frame.length)) return null;
  const a2 = ax * ax + az * az;
  const b2 = bx * bx + bz * bz;
  const c2 = cx * cx + cz * cz;
  const centre = {
    x: (a2 * (bz - cz) + b2 * (cz - az) + c2 * (az - bz)) / d,
    z: (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d,
  };
  const radius = Math.hypot(ax - centre.x, az - centre.z);
  const side = (through.x - frame.middle.x) * frame.normal.x + (through.z - frame.middle.z) * frame.normal.z;
  if (Math.abs(side) < 1e-12) return null;
  const h = (centre.x - frame.middle.x) * frame.normal.x + (centre.z - frame.middle.z) * frame.normal.z;
  const bulge = clampArcBulge(side > 0 ? h + radius : h - radius, frame.length);
  return Math.abs(bulge) < MIN_ARC_BULGE ? null : { bulge, radius };
}
