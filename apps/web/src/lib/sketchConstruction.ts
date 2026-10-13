import { expandSketchCircles } from "@/lib/sketchCircles";
import type { SketchProfile, SketchSegment } from "@/types/sketchforge";

/**
 * sketchConstruction.ts
 *
 * Hilfslinien in der Skizze: gestrichelt gezeichnet, nie Teil des Umrisses.
 *
 * Wozu: Eine Ecke soll auf die Mitte einer Kante, ein Loch einen festen
 * Abstand vom Rand haben - ohne zu rechnen. Eine Hilfslinie laeuft dafuer so
 * weit ueber die Form hinaus, wie sie muss, und macht den Koerper trotzdem
 * nicht groesser; ein Drehteil darf eine rechts von der Achse haben, wo ein
 * Umriss nicht hinduerfte.
 *
 * Gebaut wird das an genau einer Stelle: `sketchGeometryProfile`. Jeder Weg
 * von der Skizze zur Geometrie - Hochziehen, Drehen, Fuehren, Aushoehlen, der
 * genaue Koerper wie das Netz - lief schon durch das Ausklappen der Kreise;
 * dort fallen jetzt auch die Hilfslinien heraus. Eine zweite Stelle waere eine
 * zweite Gelegenheit, eine zu vergessen.
 *
 * Nach Layerling 1.62.0 (#229).
 */

export function isConstructionSegment(segment: Pick<SketchSegment, "construction">) {
  return segment.construction === true;
}

/**
 * Die Skizze ohne ihre Hilfslinien.
 *
 * Mit ihnen fallen die Punkte, die nur an Hilfslinien hingen. Ein Punkt, an
 * dem auch eine Umrisskante haengt, bleibt - eine Hilfslinie darf an einer
 * Ecke des Umrisses beginnen, und die Ecke gehoert weiter zum Umriss.
 */
export function withoutConstructionLines(profile: SketchProfile): SketchProfile {
  if (!profile.segments.some(isConstructionSegment)) return profile;
  const segments = profile.segments.filter((segment) => !isConstructionSegment(segment));
  const used = new Set(segments.flatMap((segment) => [segment.startId, segment.endId]));
  const onlyOnConstruction = new Set(
    profile.segments
      .filter(isConstructionSegment)
      .flatMap((segment) => [segment.startId, segment.endId])
      .filter((pointId) => !used.has(pointId)),
  );
  return {
    ...profile,
    points: profile.points.filter((point) => !onlyOnConstruction.has(point.id)),
    segments,
  };
}

/**
 * Die Skizze, wie die Geometrie sie sieht: ohne Hilfslinien, die Kreise zu
 * Kurven ausgeklappt. Der Datensatz der Skizze behaelt beides - sonst waeren
 * Kreise beim naechsten Oeffnen keine mehr und Hilfslinien weg.
 */
export function sketchGeometryProfile(profile: SketchProfile): SketchProfile {
  return expandSketchCircles(withoutConstructionLines(profile));
}

type Flat = { x: number; z: number };

/** Wo zwei Strecken sich kreuzen - `null`, wenn sie parallel laufen oder einander verfehlen. */
function segmentCrossing(a: Flat, b: Flat, c: Flat, d: Flat): Flat | null {
  const rx = b.x - a.x;
  const rz = b.z - a.z;
  const sx = d.x - c.x;
  const sz = d.z - c.z;
  const denominator = rx * sz - rz * sx;
  if (Math.abs(denominator) < 1e-12) return null;
  const t = ((c.x - a.x) * sz - (c.z - a.z) * sx) / denominator;
  const u = ((c.x - a.x) * rz - (c.z - a.z) * rx) / denominator;
  const inside = (value: number) => value >= -1e-9 && value <= 1 + 1e-9;
  if (!inside(t) || !inside(u)) return null;
  return { x: a.x + rx * t, z: a.z + rz * t };
}

/**
 * Die Stellen, an denen eine Hilfslinie eine andere gerade Linie kreuzt - die
 * Fangpunkte, die sie mitbringt.
 *
 * Das ist der eigentliche Nutzen einer Hilfslinie: Eine Diagonale durch ein
 * Rechteck liefert seine Mitte, eine Parallele im Abstand von 3 mm die Stelle,
 * an der ein Loch hinsoll. Die Enden einer Hilfslinie sind gewoehnliche
 * Punkte und fangen ohnehin; hier kommen die Kreuzungen dazu. Sie werden nicht
 * als Punkte in die Skizze gesetzt - dann schnitte die Hilfslinie den Umriss
 * doch auf -, sondern nur beim Zeichnen angeboten.
 */
export function constructionSnapPoints(profile: SketchProfile): Flat[] {
  const pointById = new Map(profile.points.map((point) => [point.id, point]));
  const straight = profile.segments.filter((segment) => (!segment.kind || segment.kind === "line")
    && pointById.has(segment.startId)
    && pointById.has(segment.endId));
  const construction = straight.filter(isConstructionSegment);
  if (construction.length === 0) return [];

  const found: Flat[] = [];
  const add = (point: Flat) => {
    if (found.some((known) => Math.hypot(known.x - point.x, known.z - point.z) < 1e-6)) return;
    found.push(point);
  };
  construction.forEach((guide) => {
    const a = pointById.get(guide.startId)!;
    const b = pointById.get(guide.endId)!;
    straight.forEach((other) => {
      if (other.id === guide.id) return;
      const c = pointById.get(other.startId)!;
      const d = pointById.get(other.endId)!;
      const crossing = segmentCrossing(a, b, c, d);
      if (!crossing) return;
      // Ein gemeinsamer Endpunkt ist schon ein Punkt der Skizze und fangt
      // von sich aus; er muss hier nicht noch einmal stehen.
      const atEnd = [a, b, c, d].some((end) => Math.hypot(end.x - crossing.x, end.z - crossing.z) < 1e-6);
      if (!atEnd) add(crossing);
    });
  });
  return found;
}

/** Der naechste Fangpunkt innerhalb der Reichweite, oder `null`. */
export function nearestSketchSnapPoint(position: Flat, candidates: ReadonlyArray<Flat>, reach: number): Flat | null {
  let best: Flat | null = null;
  let bestDistance = reach;
  candidates.forEach((candidate) => {
    const distance = Math.hypot(candidate.x - position.x, candidate.z - position.z);
    if (distance <= bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  });
  return best;
}
