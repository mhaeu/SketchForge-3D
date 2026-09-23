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
