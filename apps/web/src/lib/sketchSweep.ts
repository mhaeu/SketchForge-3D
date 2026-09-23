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

/**
 * Wie die Form an den Anfang des Weges gesetzt wird.
 *
 * Zwei Dinge muessen dafuer geschehen. Die Form liegt gezeichnet flach in der
 * Arbeitsebene, ihre Flaechennormale zeigt nach oben; sie wird auf dem
 * kuerzesten Weg so gekippt, dass diese Normale in die Richtung des Weges
 * zeigt - damit steht die Form im rechten Winkel auf dem Pfad, ganz gleich,
 * wohin er laeuft. Und sie wird verschoben, bis ihre Mitte am Anfang des
 * Weges sitzt.
 *
 * Herauskommt eine Abbildung als 3x4-Matrix, zeilenweise: erst die drei
 * Zeilen der Drehung, jede mit ihrer Verschiebung am Ende.
 */
export function sweepProfilePlacement(spine: OrderedCadSketchPath, centre: { x: number; z: number }): number[] | null {
  const direction = sweepStartDirection(spine);
  if (!direction) return null;
  const start = sweepPathPoint(spine.steps[0].from);

  // Die Drehung von der Hochachse auf die Richtung des Weges, um die Achse,
  // die auf beiden senkrecht steht. Laeuft der Weg schon hinauf, bleibt die
  // Form, wie sie liegt; laeuft er genau hinab, wird sie umgeschlagen - eine
  // Achse gaebe das Kreuzprodukt dort nicht mehr her.
  const dot = direction.y;
  let rotation: number[][];
  if (dot > 1 - 1e-12) {
    rotation = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  } else if (dot < -1 + 1e-12) {
    rotation = [[1, 0, 0], [0, -1, 0], [0, 0, -1]];
  } else {
    // Kreuzprodukt der Hochachse (0,1,0) mit der Richtung.
    const axis = { x: direction.z, y: 0, z: -direction.x };
    const length = Math.hypot(axis.x, axis.y, axis.z);
    const unit = { x: axis.x / length, y: axis.y / length, z: axis.z / length };
    const cosine = dot;
    const sine = length;
    const inverse = 1 - cosine;
    rotation = [
      [cosine + unit.x * unit.x * inverse, unit.x * unit.y * inverse - unit.z * sine, unit.x * unit.z * inverse + unit.y * sine],
      [unit.y * unit.x * inverse + unit.z * sine, cosine + unit.y * unit.y * inverse, unit.y * unit.z * inverse - unit.x * sine],
      [unit.z * unit.x * inverse - unit.y * sine, unit.z * unit.y * inverse + unit.x * sine, cosine + unit.z * unit.z * inverse],
    ];
  }

  const anchor = [centre.x, 0, centre.z];
  const moved = rotation.map((row) => row[0] * anchor[0] + row[1] * anchor[1] + row[2] * anchor[2]);
  const target = [start.x, start.y, start.z];
  return rotation.flatMap((row, index) => [...row, target[index] - moved[index]]);
}
