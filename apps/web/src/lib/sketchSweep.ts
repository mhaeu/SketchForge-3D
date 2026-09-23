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
 * selbst. Ein offener Zug ist immer der Weg - was offen bleibt, umschliesst
 * nichts und kann keine Flaeche sein. Gibt es mehrere, gilt der laengste; die
 * uebrigen sind Reste, keine zweite Absicht.
 *
 * Ist gar nichts offen, darf auch ein geschlossener Zug der Weg sein - ein
 * Ring, ein Rahmen, ein Reifen. Dann gilt der groesste: Der Weg fuehrt die
 * Form herum, also ist er die weite Linie und sie die enge. Dafuer braucht es
 * mindestens zwei geschlossene Zuege, sonst waere die Form selbst ihr eigener
 * Weg.
 */
export function sweepSpinePath(profile: SketchProfile): OrderedCadSketchPath | null {
  const paths = orderedCadSketchPaths(profile);
  // Wer den Weg festgelegt hat, hat recht - die Regel unten ist nur da, wo
  // nichts gesagt wurde. Es genuegt eine ausgezeichnete Kante: Wird der Weg
  // spaeter verlaengert, bleibt er der Weg, ohne dass man ihn neu erklaert.
  const marked = paths.find((candidate) => candidate.steps.some((step) => step.segment.role === "path"));
  if (marked) return marked;
  let longestOpen: OrderedCadSketchPath | null = null;
  const closed: Array<{ path: OrderedCadSketchPath; extent: number }> = [];
  for (const candidate of paths) {
    if (candidate.steps.length === 0) continue;
    if (!candidate.closed) {
      if (!longestOpen || candidate.steps.length > longestOpen.steps.length) longestOpen = candidate;
      continue;
    }
    closed.push({ path: candidate, extent: pathExtent(candidate) });
  }
  if (longestOpen) return longestOpen;
  if (closed.length < 2) return null;
  return closed.reduce((widest, candidate) => candidate.extent > widest.extent ? candidate : widest).path;
}

/** Die Flaeche des Rahmens um einen Zug - das Mass fuer "der groessere". */
function pathExtent(path: OrderedCadSketchPath) {
  const xs = path.points.map((point) => point.x);
  const zs = path.points.map((point) => point.z);
  return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...zs) - Math.min(...zs));
}

/**
 * Einen Zug als Weg festlegen - oder die Auszeichnung wieder wegnehmen.
 *
 * Ausgezeichnet wird der ganze zusammenhaengende Zug, zu dem die Kante
 * gehoert, nicht die eine Kante: Wer auf eine Linie des Weges zeigt, meint
 * den Weg. Und es gibt nur einen - ein zweiter Weg waere eine zweite
 * Bewegung, und die Form kann nur eine ausfuehren -, deshalb verlieren alle
 * uebrigen Kanten ihre Auszeichnung.
 */
export function markSweepPath(profile: SketchProfile, segmentId: string): SketchProfile | null {
  const owner = orderedCadSketchPaths(profile).find((path) => path.steps.some((step) => step.segment.id === segmentId));
  if (!owner) return null;
  const inPath = new Set(owner.steps.map((step) => step.segment.id));
  const alreadyMarked = owner.steps.some((step) => step.segment.role === "path");
  return {
    ...profile,
    segments: profile.segments.map((segment) => {
      const wanted = !alreadyMarked && inPath.has(segment.id);
      if (wanted === (segment.role === "path")) return segment;
      if (wanted) return { ...segment, role: "path" as const };
      const { role: _role, ...rest } = segment;
      return rest;
    }),
  };
}

/** Ob in dieser Zeichnung ein Weg festgelegt wurde. */
export function hasMarkedSweepPath(profile: SketchProfile) {
  return profile.segments.some((segment) => segment.role === "path");
}

export type SweepDrawing = { spine: OrderedCadSketchPath; shape: SketchProfile };

/**
 * Die Zeichnung in Form und Weg zerlegen.
 *
 * Der Weg wird aus der Zeichnung herausgenommen, bevor daraus Flaechen
 * werden: Sonst zaehlte ein geschlossener Weg selbst als Form, und ein Reifen
 * bekaeme seine eigene Bahn als zweiten Koerper mit.
 */
export function splitSweepDrawing(profile: SketchProfile): SweepDrawing | null {
  const drawn = sweepSpinePath(profile);
  if (!drawn) return null;
  const spine = sweepSpineFromLowestEnd(drawn);
  const spineSegments = new Set(spine.steps.map((step) => step.segment.id));
  const segments = profile.segments.filter((segment) => !spineSegments.has(segment.id));
  const used = new Set(segments.flatMap((segment) => [segment.startId, segment.endId]));
  return {
    spine,
    shape: { ...profile, points: profile.points.filter((point) => used.has(point.id)), segments },
  };
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
  // Ein geschlossener Weg hat keine Enden. Wo die Form auf ihm sitzt, ist
  // einerlei - sie laeuft ohnehin einmal herum.
  if (spine.closed) return spine;
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
 * Sie bestimmt, wie die Form am Weg haengt: quer dazu, im rechten Winkel.
 * Nur wenn der Pfad an seinem Anfang keine Laenge hat, gibt es keine
 * Richtung - und dann auch keinen Koerper.
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
