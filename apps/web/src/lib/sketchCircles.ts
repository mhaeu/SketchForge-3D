import { closedLoop, ellipsePoints } from "@/lib/sketchPrimitives";
import type { SketchProfile } from "@/types/sketchforge";

/**
 * Ein echter Kreis in der Skizze.
 *
 * Er steht neben den Punkten und Kanten, nicht darin: Wer einen Kreis zieht,
 * will einen Kreis und keine vier Stuetzpunkte, die sich beim naechsten
 * Anfassen zu einer Delle verziehen. Zu Punkten und Kanten wird er erst dort,
 * wo Geometrie entsteht - beim Bauen des Koerpers.
 */
export type SketchCircle = {
  id: string;
  /** Die Mitte, in Zeichenkoordinaten. */
  x: number;
  z: number;
  radius: number;
};

export const MIN_SKETCH_CIRCLE_RADIUS = 0.05;

function finite(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function normalizeSketchCircle(value: unknown): SketchCircle | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<SketchCircle>;
  if (typeof raw.id !== "string" || !raw.id) return null;
  const radius = finite(raw.radius);
  if (radius < MIN_SKETCH_CIRCLE_RADIUS) return null;
  return { id: raw.id, x: finite(raw.x), z: finite(raw.z), radius };
}

export function normalizeSketchCircles(value: unknown): SketchCircle[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const circles: SketchCircle[] = [];
  for (const entry of value) {
    const circle = normalizeSketchCircle(entry);
    if (!circle || seen.has(circle.id)) continue;
    seen.add(circle.id);
    circles.push(circle);
  }
  return circles;
}

/**
 * Der Kreis ueber einer Strecke: die beiden Punkte liegen auf ihm, gegenueber.
 * Das ist der Kreis, den man meint, wenn man ihn "ueber einer Linie" aufzieht.
 */
export function sketchCircleOverPoints(
  id: string,
  a: { x: number; z: number },
  b: { x: number; z: number },
): SketchCircle | null {
  const radius = Math.hypot(b.x - a.x, b.z - a.z) / 2;
  if (!(radius >= MIN_SKETCH_CIRCLE_RADIUS)) return null;
  return { id, x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, radius };
}

/** Ob ein Punkt nah genug am Rand liegt, um den Kreis dort zu fassen. */
export function pointOnSketchCircleEdge(circle: SketchCircle, point: { x: number; z: number }, tolerance: number) {
  return Math.abs(Math.hypot(point.x - circle.x, point.z - circle.z) - circle.radius) <= tolerance;
}

/**
 * Der Kreis als geschlossener Zug aus vier Bogen - so, wie ihn auch das
 * Formenmenue zeichnet, damit nicht zwei Beschreibungen derselben Kurve
 * nebeneinanderstehen.
 *
 * Die Kennungen leiten sich aus der des Kreises ab. Damit kommt bei jedem
 * Ausklappen dasselbe heraus, und ein Stand, der sich nur im Zufall der
 * Kennungen unterscheidet, gilt nicht als geaendert.
 */
export function sketchCirclePath(circle: SketchCircle) {
  let counter = 0;
  const makeId = (prefix: string) => `${circle.id}-${prefix === "sketch-point" ? "p" : "s"}${counter++ % 4}`;
  const points = ellipsePoints(makeId, circle.x, circle.z, circle.radius, circle.radius);
  counter = 0;
  return { points, segments: closedLoop(makeId, points, "bezier") };
}

/**
 * Die Kreise in Punkte und Kanten ausklappen. Nur hier wird aus einem Kreis
 * eine Kurve - der Datensatz der Skizze behaelt ihn als Kreis, sonst waere er
 * beim naechsten Oeffnen keiner mehr.
 */
export function expandSketchCircles(profile: SketchProfile): SketchProfile {
  const circles = profile.circles ?? [];
  if (circles.length === 0) return profile;
  const expanded = circles.map(sketchCirclePath);
  return {
    ...profile,
    points: [...profile.points, ...expanded.flatMap((path) => path.points)],
    segments: [...profile.segments, ...expanded.flatMap((path) => path.segments)],
    circles: undefined,
  };
}
