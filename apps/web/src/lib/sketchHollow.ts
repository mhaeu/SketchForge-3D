import { cadSketchRegions } from "@/lib/sketchCadProfile";
import { expandSketchCircles } from "@/lib/sketchCircles";
import type { SketchProfile } from "@/types/sketchforge";

/**
 * Die Zeichnung ohne ihre Loecher - der volle Koerper zum hohlen.
 *
 * Bei einem Rohr steht die Wandstaerke am Koerper, und der Innenraum laesst
 * sich daraus ausrechnen. Ein selbst gezeichneter hohler Koerper hat keine
 * Wandstaerke; sein Hohlraum steckt als innerer geschlossener Zug in der
 * Zeichnung. Zieht man dieselbe Zeichnung ohne diese inneren Zuege hoch, so
 * kommt der volle Koerper heraus - und was er mehr hat als der hohle, ist
 * genau der Hohlraum.
 *
 * Der Weg ueber den aeusseren Umriss ist dabei kein Umweg, sondern der
 * Grund, warum es ohne Ausmessen geht: Der aeussere Umriss bestimmt den
 * Kasten um den Koerper, voll und hohl haben also denselben. Der volle
 * Koerper laesst sich damit einfach in den Rahmen des hohlen setzen. Baute
 * man statt dessen den Innenraum aus den inneren Zuegen neu, haette er einen
 * anderen Kasten, und man muesste die Verschiebung ausrechnen.
 *
 * Offene Zuege bleiben stehen: Sie umschliessen nichts, koennen also kein
 * Loch sein - beim Folgen ist ein solcher Zug der Weg, und ohne ihn gaebe es
 * nichts, dem die Form folgen koennte.
 */
export function filledSketchProfile(profile: SketchProfile): SketchProfile | null {
  const expanded = expandSketchCircles(profile);
  const holeSegments = new Set(
    cadSketchRegions(expanded).flatMap((region) => region.holes.flatMap((hole) => hole.steps.map((step) => step.segment.id))),
  );
  if (holeSegments.size === 0) return null;
  const segments = expanded.segments.filter((segment) => !holeSegments.has(segment.id));
  const used = new Set(segments.flatMap((segment) => [segment.startId, segment.endId]));
  return {
    ...expanded,
    points: expanded.points.filter((point) => used.has(point.id)),
    segments,
  };
}

/** Ob diese Zeichnung ueberhaupt einen Hohlraum beschreibt. */
export function sketchHasHoles(profile: SketchProfile) {
  return cadSketchRegions(expandSketchCircles(profile)).some((region) => region.holes.length > 0);
}
