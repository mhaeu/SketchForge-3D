/**
 * ringGearGeometry.ts
 *
 * Das Hohlrad: ein Ring mit Zaehnen nach innen.
 *
 * Es ist das Gegenstueck zum Zahnrad und nicht nur ein umgedrehtes - was beim
 * Rad der Zahn ist, ist hier die Luecke. Darum sind seine Zaehne innen spitz
 * und aussen breit, der Kopfkreis liegt **unter** dem Teilkreis und der
 * Fusskreis darueber. Und der Achsabstand ist eine Differenz statt einer
 * Summe: `Modul x (Zaehne_Hohlrad - Zaehne_Rad) / 2`.
 *
 * Damit ist das Planetengetriebe gebaut: Hohlrad, Planeten, Sonne - alle
 * demselben Modul, und die Zaehnezahlen bestimmen den Rest.
 *
 * Gerechnet wird mit derselben Evolvente wie beim Zahnrad (`gearGeometry.ts`),
 * nur dass die Luecke die Form traegt. Die Flanken einer Luecke konvergieren
 * nach aussen - genau wie die eines Zahnes beim Rad, und das muss so sein: Die
 * Luecke muss den Zahn des Gegenrades aufnehmen, und der ist an seinem Kopf
 * (hier aussen) am schmalsten.
 *
 * Nach Layerling 1.58.1.
 */

import * as THREE from "three";
import {
  involuteToothCentre,
  MAX_GEAR_MODULE,
  MIN_GEAR_MODULE,
  normalizeGearBacklash,
  normalizeGearModule,
  normalizeGearPressureAngle,
  normalizeGearTeeth,
} from "@/lib/gearGeometry";
import type { WorkplaneShape } from "@/types/sketchforge";

/** Ein neues Hohlrad: 30 Zaehne sind ein brauchbarer Ring fuer drei Planeten. */
export const DEFAULT_RING_GEAR_TEETH = 30;

/**
 * Der Kranz hinter dem Zahnfuss, in Modulen.
 *
 * Duenner als anderthalb Modul traegt ein gedruckter Ring die Zahnkraefte
 * nicht - er wird an der Zahnreihe weich. Das ist die Vorgabe, nicht die
 * Grenze: Wer den Ring in ein Gehaeuse setzt, braucht oft einen bestimmten
 * Aussendurchmesser und darf den Kranz darum frei waehlen.
 */
export const DEFAULT_RING_RIM_MODULES = 1.5;
export const MIN_RING_RIM = 0.4;

/**
 * Wie viele Module der Aussendurchmesser auf die Zaehnezahl legt, ohne den
 * Kranz: Fusskreis = Teilkreis + 1,25 Modul, also Zaehne + 2,5.
 */
const RING_ROOT_TEETH_OFFSET = 2.5;

/** Punkte je Flanke im gezeichneten Umriss - wie beim Zahnrad. */
const INVOLUTE_FLANK_STEPS = 12;

function involuteFunction(angle: number) {
  return Math.tan(angle) - angle;
}

export function normalizeRingRim(value: number | undefined, module: number) {
  if (!Number.isFinite(value)) return Math.max(MIN_RING_RIM, DEFAULT_RING_RIM_MODULES * module);
  return Math.max(MIN_RING_RIM, value as number);
}

/** Der Aussendurchmesser zu Modul, Zaehnezahl und Kranz. */
export function ringGearOuterDiameter(module: number, teeth?: number, rim?: number) {
  const safeModule = Math.max(MIN_GEAR_MODULE, module);
  return safeModule * (normalizeGearTeeth(teeth) + RING_ROOT_TEETH_OFFSET) + 2 * normalizeRingRim(rim, safeModule);
}

/** Und zurueck: das Modul, das zu diesem Aussendurchmesser und Kranz gehoert. */
export function ringGearModule(outerDiameter: number, teeth?: number, rim?: number) {
  const count = normalizeGearTeeth(teeth);
  // Der Kranz haengt selbst am Modul, wenn keiner gesetzt ist - dann ist die
  // Rechnung einmal rueckwaerts: d = m (z + 2,5 + 2 x 1,5).
  if (!Number.isFinite(rim)) {
    return normalizeGearModule(Math.max(0.01, outerDiameter) / (count + RING_ROOT_TEETH_OFFSET + 2 * DEFAULT_RING_RIM_MODULES));
  }
  const inner = Math.max(0.01, outerDiameter) - 2 * Math.max(MIN_RING_RIM, rim as number);
  return Math.min(MAX_GEAR_MODULE, Math.max(MIN_GEAR_MODULE, inner / (count + RING_ROOT_TEETH_OFFSET)));
}

/**
 * Der Achsabstand, bei dem ein Rad in diesem Hohlrad kaemmt: die **Differenz**
 * der beiden Teilkreishalbmesser. Daran erkennt man ein Hohlrad - beim Paar
 * aus zwei Raedern ist es die Summe.
 */
export function ringGearCentreDistance(module: number, ringTeeth?: number, pinionTeeth?: number) {
  return (Math.max(MIN_GEAR_MODULE, module) * (normalizeGearTeeth(ringTeeth) - normalizeGearTeeth(pinionTeeth))) / 2;
}

/**
 * Um wie viele Zaehne sich Hohlrad und Rad mindestens unterscheiden muessen.
 *
 * Beim Hohlrad gibt es eine Grenze, die zwei Raeder nicht haben: Liegen die
 * Zaehnezahlen zu nah beieinander, stossen die Zahnkoepfe aneinander, statt
 * dass die Flanken abwaelzen - die beiden Kopfkreise schneiden sich dann in
 * einem Bereich, den keine Evolvente mehr ueberbrueckt.
 *
 * Zehn ist gemessen, nicht ueberliefert: Bei einem Ring mit 40 Zaehnen gibt es
 * bei einem Unterschied von 10 und mehr keine Ueberdeckung, bei 8 noch
 * 0,013 mm und bei 6 schon 0,219 mm. Bei einem Ring mit 60 Zaehnen ist 8 noch
 * frei und 6 greift 0,156 mm ein. Zehn liegt also auf der sicheren Seite jeder
 * gemessenen Groesse.
 */
export const RING_GEAR_MIN_TEETH_DIFFERENCE = 10;

export type RingGearMeasures = {
  teeth: number;
  module: number;
  rim: number;
  pitchRadius: number;
  baseRadius: number;
  /** Der Kopfkreis liegt **innen**: die Zahnspitzen zeigen zur Mitte. */
  tipRadius: number;
  /** Der Fusskreis liegt **aussen**: dort hat die Luecke ihren Grund. */
  rootRadius: number;
  /** Die Aussenkante des Kranzes. */
  outerRadius: number;
  /** Wo die Evolvente der Luecke anfaengt: am Kopfkreis, oder am Grundkreis, wenn der weiter aussen liegt. */
  flankRadius: number;
  /** Die halbe Winkelbreite der Luecke am Teilkreis, auf den Grundkreis zurueckgerechnet. */
  spaceTurn: number;
};

/**
 * Alle Masse eines Hohlrades.
 *
 * Die Luecke ist am Teilkreis so breit wie der Zahn eines Rades dort dick ist,
 * `pi x Modul / 2`, plus die halbe Spielbreite - dann hat das Paar genau das
 * eingestellte Spiel. Der Kopf steht ein Modul **unter** dem Teilkreis, der
 * Grund 1,25 Modul darueber: So bleibt dem Kopf des Gegenrades ein
 * Viertelmodul Luft, und dem Kopf des Hohlrades genauso.
 */
export function ringGearMeasures(
  outerDiameter: number,
  options: Pick<WorkplaneShape, "teeth" | "gearPressureAngle" | "gearBacklash" | "ringRim">,
): RingGearMeasures {
  const teeth = normalizeGearTeeth(options.teeth);
  const module = ringGearModule(outerDiameter, teeth, options.ringRim);
  const rim = normalizeRingRim(options.ringRim, module);
  const pressure = THREE.MathUtils.degToRad(normalizeGearPressureAngle(options.gearPressureAngle));
  const backlash = normalizeGearBacklash(options.gearBacklash, module);
  const pitchRadius = (module * teeth) / 2;
  const baseRadius = pitchRadius * Math.cos(pressure);
  const tipRadius = Math.max(pitchRadius * 0.2, pitchRadius - module);
  const rootRadius = pitchRadius + 1.25 * module;
  const space = (Math.PI * module) / 2 + backlash / 2;
  const spaceTurn = space / (2 * pitchRadius) + involuteFunction(pressure);
  return {
    teeth,
    module,
    rim,
    pitchRadius,
    baseRadius,
    tipRadius,
    rootRadius,
    outerRadius: rootRadius + rim,
    flankRadius: Math.max(baseRadius, tipRadius),
    spaceTurn,
  };
}

/** Der Winkel, unter dem die Flanke einer Luecke diesen Halbmesser trifft. */
export function ringFlankAngle(measures: RingGearMeasures, centre: number, side: -1 | 1, radius: number) {
  const { baseRadius, spaceTurn } = measures;
  const roll = Math.sqrt(Math.max(0, (Math.max(radius, baseRadius) / baseRadius) ** 2 - 1));
  return centre + side * (spaceTurn - (roll - Math.atan(roll)));
}

/**
 * Der innere Umriss des Hohlrades, als Ecken auf Kreisen.
 *
 * Je Luecke: die Flanke davor vom Kopfkreis nach aussen bis zum Grund, der
 * Grund, die Flanke danach zurueck - und dann die Spitze des naechsten Zahnes
 * auf dem Kopfkreis. Liegt der Grundkreis aussen vor dem Kopfkreis, laeuft von
 * dort eine gerade Strecke nach innen: Eine Evolvente gibt es dort nicht.
 */
export function ringGearInnerCorners(
  outerDiameter: number,
  options: Pick<WorkplaneShape, "teeth" | "gearPressureAngle" | "gearBacklash" | "ringRim">,
): { x: number; z: number }[] {
  const measures = ringGearMeasures(outerDiameter, options);
  const { teeth, tipRadius, rootRadius, flankRadius, baseRadius } = measures;
  const corners: { x: number; z: number }[] = [];
  const push = (angle: number, radius: number) => corners.push({ x: Math.cos(angle) * radius, z: Math.sin(angle) * radius });
  const radii = Array.from({ length: INVOLUTE_FLANK_STEPS + 1 }, (_, step) => {
    const share = step / INVOLUTE_FLANK_STEPS;
    return flankRadius + (rootRadius - flankRadius) * share;
  });
  const radial = tipRadius < flankRadius - 1e-9;
  for (let space = 0; space < teeth; space += 1) {
    const centre = involuteToothCentre(teeth, space);
    if (radial) push(ringFlankAngle(measures, centre, -1, flankRadius), tipRadius);
    for (const radius of radii) push(ringFlankAngle(measures, centre, -1, radius), radius);
    push(centre, rootRadius);
    for (const radius of [...radii].reverse()) push(ringFlankAngle(measures, centre, 1, radius), radius);
    if (radial) push(ringFlankAngle(measures, centre, 1, flankRadius), tipRadius);
    // Die Spitze des Zahnes zwischen dieser Luecke und der naechsten.
    push(centre + Math.PI / teeth, tipRadius);
  }
  return corners;
}

export type RingGearGeometryOptions = {
  width: number;
  height: number;
  teeth?: number;
  gearPressureAngle?: number;
  gearBacklash?: number;
  ringRim?: number;
};

/** Wie viele Ecken der aeussere Kreis des Ringes im Netz bekommt. */
export const RING_GEAR_OUTER_SIDES = 96;

/**
 * Die Winkel eines Umrisses, aufgewickelt: streng steigend von seinem ersten
 * Punkt an, ueber den Sprung bei pi hinweg.
 *
 * Darauf beruht das Vernaehen der beiden Ringe weiter unten - und es gilt nur,
 * weil der innere Umriss sternfoermig um die Mitte ist: Jeder Strahl aus der
 * Mitte trifft ihn genau einmal. Ein Hohlradzahn ueberhaengt nicht.
 */
function unwrappedAngles(points: ReadonlyArray<{ x: number; z: number }>) {
  const angles: number[] = [];
  let previous = 0;
  points.forEach((point, index) => {
    const raw = Math.atan2(point.z, point.x);
    if (index === 0) {
      previous = raw;
      angles.push(raw);
      return;
    }
    let value = raw;
    while (value < previous) value += Math.PI * 2;
    previous = value;
    angles.push(value);
  });
  return angles;
}

/**
 * Das Hohlrad als Netz: der Kreisring mit dem gezahnten Loch, hochgezogen.
 *
 * Von Hand gebaut und nicht mit `THREE.ExtrudeGeometry`, und zwar aus einem
 * gemessenen Grund: Dessen Ohrenschneiden ist in der Zahl der Punkte
 * quadratisch, und das Loch eines Hohlrades hat viele - 900 bei 30 Zaehnen.
 * Gemessen hat ein Ring damit **vier Sekunden** gebraucht. Die Deckel eines
 * Ringes brauchen das gar nicht: Aussen- und Innenrand sind beide
 * sternfoermig um die Mitte, also lassen sie sich nach dem Winkel
 * zusammennaehen - ein Durchgang statt einer Schleife ueber alle Paare.
 *
 * Gebaut wird gleich in Weltmassen: `x` und `z` wie gerechnet, die Hoehe von
 * 0 nach oben. Damit gibt es keine Drehung und keine Spiegelung, bei der ein
 * Umlaufsinn kippen koennte.
 */
export function createRingGearGeometry({ width, height, ...options }: RingGearGeometryOptions) {
  const settings = options as Pick<WorkplaneShape, "teeth" | "gearPressureAngle" | "gearBacklash" | "ringRim">;
  const measures = ringGearMeasures(width, settings);
  const top = Math.max(0.01, height);
  const inner = ringGearInnerCorners(width, settings);
  const innerAngles = unwrappedAngles(inner);
  // Der aeussere Kreis faengt beim selben Winkel an wie das Loch, dann
  // laufen beide Reihen von Anfang an nebeneinander.
  const outer = Array.from({ length: RING_GEAR_OUTER_SIDES }, (_, step) => {
    const angle = innerAngles[0] + (step / RING_GEAR_OUTER_SIDES) * Math.PI * 2;
    return { x: Math.cos(angle) * measures.outerRadius, z: Math.sin(angle) * measures.outerRadius, angle };
  });

  const positions: number[] = [];
  const push = (point: { x: number; z: number }, y: number) => positions.push(point.x, y, point.z);
  /**
   * Ein Dreieck des Deckels, mit der Normale nach oben oder nach unten.
   *
   * Die Reihenfolge aussen -> innen -> weiter ergibt eine Normale nach
   * **oben** (nachgerechnet an einem Dreieck bei Winkel null: der Kreuzprodukt
   * zeigt nach +y) - fuer den unteren Deckel wird darum getauscht.
   */
  const triangle = (
    a: { x: number; z: number },
    b: { x: number; z: number },
    c: { x: number; z: number },
    y: number,
    up: boolean,
  ) => {
    if (up) {
      push(a, y);
      push(b, y);
      push(c, y);
      return;
    }
    push(a, y);
    push(c, y);
    push(b, y);
  };

  /*
   * Die Deckel: Beide Raender werden nach dem Winkel zusammengenaeht. Es
   * laeuft immer der weiter, dessen naechster Punkt den kleineren Winkel hat -
   * so bleibt jedes Dreieck schmal und keines schlaegt ueber den anderen Rand.
   */
  let outerIndex = 0;
  let innerIndex = 0;
  const outerCount = outer.length;
  const innerCount = inner.length;
  const span = Math.PI * 2;
  while (outerIndex < outerCount || innerIndex < innerCount) {
    const nextOuterAngle = outerIndex < outerCount ? outer[(outerIndex + 1) % outerCount].angle + (outerIndex + 1 >= outerCount ? span : 0) : Number.POSITIVE_INFINITY;
    const nextInnerAngle = innerIndex < innerCount ? (innerIndex + 1 < innerCount ? innerAngles[innerIndex + 1] : innerAngles[0] + span) : Number.POSITIVE_INFINITY;
    const stepOuter = nextOuterAngle <= nextInnerAngle;
    const a = outer[outerIndex % outerCount];
    const b = inner[innerIndex % innerCount];
    const c = stepOuter ? outer[(outerIndex + 1) % outerCount] : inner[(innerIndex + 1) % innerCount];
    triangle(a, b, c, 0, false);
    triangle(a, b, c, top, true);
    if (stepOuter) outerIndex += 1;
    else innerIndex += 1;
  }

  /*
   * Die Waende: aussen zeigt die Normale von der Achse weg, am Loch zu ihr
   * hin - dort liegt das Material ja aussen.
   */
  const wall = (points: ReadonlyArray<{ x: number; z: number }>, outward: boolean) => {
    for (let index = 0; index < points.length; index += 1) {
      const a = points[index];
      const b = points[(index + 1) % points.length];
      if (outward) {
        push(a, 0); push(b, top); push(b, 0);
        push(a, 0); push(a, top); push(b, top);
      } else {
        push(a, 0); push(b, 0); push(b, top);
        push(a, 0); push(b, top); push(a, top);
      }
    }
  };
  wall(outer, true);
  wall(inner, false);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}
