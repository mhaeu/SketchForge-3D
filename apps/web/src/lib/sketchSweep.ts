import { orderedCadSketchPaths, type OrderedCadSketchPath } from "@/lib/sketchCadProfile";
import type { SketchProfile } from "@/types/sketchforge";

export type SweepPoint3D = { x: number; y: number; z: number };

/**
 * Die zweite Ebene des Folgen-Modus.
 *
 * Gezeichnet wird beides im selben Fenster, also in denselben zwei Zahlen.
 * Die Form liegt in der Arbeitsebene - dort wird aus (u, v) ein Punkt (u, 0,
 * v), genau wie beim Extrudieren. Der Pfad liegt senkrecht dazu, in der
 * Ebene, die die Querachse der Zeichnung und die Hochachse aufspannen: aus
 * (u, v) wird (u, -v, 0). Das Minus, weil die Tiefe im Zeichenfenster nach
 * unten zaehlt und die Hoehe im Raum nach oben.
 *
 * Damit ist die waagerechte Achse in beiden Ansichten dieselbe: Ein Strich
 * nach oben im Pfad zieht die Form gerade nach oben, ein Bogen biegt sie ab.
 */
export function sweepPathPoint(point: { x: number; z: number }): SweepPoint3D {
  return { x: point.x, y: -point.z, z: 0 };
}

/**
 * Der Zug, dem die Form folgt.
 *
 * Beides steht in derselben Zeichnung, und was wofuer gilt, sagt die Form
 * selbst: Was geschlossen ist, ist die Form - daraus wird die Flaeche. Was
 * offen bleibt, ist der Weg. Gibt es mehrere offene Zuege, gilt der laengste;
 * die uebrigen sind Reste, keine zweite Absicht.
 */
export function sweepSpinePath(profile: SketchProfile): OrderedCadSketchPath | null {
  let longest: OrderedCadSketchPath | null = null;
  for (const candidate of orderedCadSketchPaths(profile)) {
    if (candidate.closed || candidate.steps.length === 0) continue;
    if (!longest || candidate.steps.length > longest.steps.length) longest = candidate;
  }
  return longest;
}

/**
 * Den Zug so herum legen, dass er unten anfaengt.
 *
 * Welches Ende ein Pfad als Anfang bekommt, haengt sonst daran, wo er
 * gezeichnet wurde - und die Form sitzt beim Bauen am Anfang. Bei einem
 * geraden Pfad ist das einerlei, bei einem gebogenen nicht: Der Koerper
 * kaeme auf dem Kopf heraus. Unten heisst hier: der groessere z-Wert im
 * Zeichenfenster, denn dort zaehlt die Tiefe nach unten.
 */
export function sweepSpineFromLowestEnd(spine: OrderedCadSketchPath): OrderedCadSketchPath {
  const first = spine.steps[0];
  const last = spine.steps[spine.steps.length - 1];
  if (!first || !last) return spine;
  if (first.from.z >= last.to.z) return spine;
  return {
    ...spine,
    points: [...spine.points].reverse(),
    steps: [...spine.steps].reverse().map((step) => ({ segment: step.segment, from: step.to, to: step.from })),
  };
}

/**
 * Die Richtung, in die der Pfad aus seinem Anfang herauslaeuft.
 *
 * Sie entscheidet, ob sich ueberhaupt etwas bauen laesst: Laeuft der Pfad an
 * seinem Anfang in der Ebene der Form, gaebe es keinen Koerper - die Form
 * wuerde in sich selbst geschoben. Gemessen wird deshalb der Anteil quer zu
 * dieser Ebene, also die Hoehe.
 */
export function sweepStartDirection(spine: OrderedCadSketchPath): SweepPoint3D | null {
  const first = spine.steps[0];
  if (!first) return null;
  const forward = first.segment.startId === first.from.id;
  const handle = forward ? first.from.handleOut : first.from.handleIn;
  const target = first.segment.kind !== "line" && handle ? handle : first.to;
  const from = sweepPathPoint(first.from);
  const to = sweepPathPoint(target);
  const direction = { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z };
  const length = Math.hypot(direction.x, direction.y, direction.z);
  if (length < 1e-9) return null;
  return { x: direction.x / length, y: direction.y / length, z: direction.z / length };
}

/** So schraeg darf der Anfang des Pfades hoechstens zur Formebene liegen. */
export const MIN_SWEEP_START_RISE = 0.08;

export function sweepStartLeavesProfilePlane(spine: OrderedCadSketchPath) {
  const direction = sweepStartDirection(spine);
  return Boolean(direction && Math.abs(direction.y) >= MIN_SWEEP_START_RISE);
}
