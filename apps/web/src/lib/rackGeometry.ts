/**
 * rackGeometry.ts
 *
 * Die Zahnstange: das Zahnrad mit unendlich grossem Teilkreis.
 *
 * Darum sind ihre Flanken gerade Strecken - unter genau dem Eingriffswinkel,
 * mit dem die Evolvente eines Rades am Teilkreis ansetzt. Ein Evolventenrad
 * desselben Moduls waelzt auf ihr ab, und aus einer Drehung wird eine
 * Strecke: Zahnstangenantrieb, Schublade, Linearachse, Hubtisch.
 *
 * Gebaut wie das Zahnrad: Modul und Zaehnezahl bestimmen alles, und die
 * Groesse folgt daraus und nicht umgekehrt. Die Laenge einer Zahnstange ist
 * **genau** ein ganzzahliges Vielfaches der Teilung, denn der erste Zahn
 * steht eine halbe Teilung vom Ende. Zwei Zahnstangen hintereinander ergeben
 * darum eine durchgehende Zahnreihe, ohne dass man etwas nachrechnet.
 *
 * Nach Layerling 1.58.1.
 */

import * as THREE from "three";
import {
  MAX_GEAR_MODULE,
  MIN_GEAR_MODULE,
  normalizeGearBacklash,
  normalizeGearPressureAngle,
} from "@/lib/gearGeometry";
import type { WorkplaneShape } from "@/types/sketchforge";

export const DEFAULT_RACK_TEETH = 12;
export const MIN_RACK_TEETH = 2;
export const MAX_RACK_TEETH = 120;

/**
 * Wie viel Material hinter dem Zahnfuss bleibt, in Modulen.
 *
 * Der Zahn selbst ist 2,25 Modul hoch (ein Modul Kopf, 1,25 Fuss). Ein Modul
 * Ruecken dahinter ist das Wenigste, was eine Zahnstange tragen kann - duenner
 * bricht sie an der Zahnreihe, und gedruckt steht sie dann auf nichts.
 */
export const RACK_BACK_MODULES = 1;

/** Die gesamte Zahnhoehe in Modulen: ein Modul Kopf, 1,25 Modul Fuss. */
export const RACK_TOOTH_MODULES = 2.25;

export function normalizeRackTeeth(value?: number) {
  if (!Number.isFinite(value)) return DEFAULT_RACK_TEETH;
  return Math.min(MAX_RACK_TEETH, Math.max(MIN_RACK_TEETH, Math.round(value as number)));
}

/** Das Modul, das zu dieser Laenge und Zaehnezahl gehoert: Laenge = Zaehne x Teilung. */
export function rackModule(length: number, teeth?: number) {
  const count = normalizeRackTeeth(teeth);
  return Math.min(MAX_GEAR_MODULE, Math.max(MIN_GEAR_MODULE, Math.max(0.01, length) / (count * Math.PI)));
}

/** Und zurueck: die Laenge zu Modul und Zaehnezahl. */
export function rackLength(module: number, teeth?: number) {
  return Math.max(MIN_GEAR_MODULE, module) * normalizeRackTeeth(teeth) * Math.PI;
}

/** Die kleinste Tiefe, in der Zahn und Ruecken Platz haben. */
export function minRackDepth(module: number) {
  return (RACK_TOOTH_MODULES + RACK_BACK_MODULES) * Math.max(MIN_GEAR_MODULE, module);
}

export function normalizeRackDepth(value: number | undefined, module: number) {
  const least = minRackDepth(module);
  if (!Number.isFinite(value)) return least;
  return Math.max(least, value as number);
}

/**
 * Ab wie vielen Zaehnen ein Rad auf dieser Zahnstange sauber laeuft.
 *
 * Die Flanke der Stange ist eine Gerade; der Zahnkopf der Stange steht ein
 * Modul ueber der Waelzlinie. Unterhalb des Beruehrpunktes der Eingriffslinie
 * mit dem Grundkreis des Rades gibt es keine Evolvente mehr - greift der
 * Zahnkopf der Stange dort hinein, muesste der Zahnfuss des Rades
 * ausgeschnitten sein (Unterschnitt). Dieser Punkt liegt
 * `Teilkreishalbmesser x sin^2(Eingriffswinkel)` unter dem Teilkreis, also
 * ist die Grenze `1 Modul = (Modul x Zaehne / 2) x sin^2(a)`, und das ist
 * `Zaehne = 2 / sin^2(a)`: 17,1 bei 20 Grad, 11,2 bei 25 Grad.
 *
 * Unser Zahnfuss ist nicht unterschnitten, sondern eine gerade Strecke zum
 * Fusskreis - darum ist diese Grenze keine Theorie, sondern gemessen: Bei 20
 * Grad dringt die Zahnspitze der Stange bei 14 Zaehnen 0,006 mm ein, bei 12
 * Zaehnen 0,021 mm und bei 8 Zaehnen 0,099 mm. Bis etwa zwei Hundertstel
 * steckt das im Spiel und unter dem, was ein Drucker aufloest; ein Zehntel
 * nicht mehr.
 */
export function rackPinionLimitTeeth(pressureAngle?: number) {
  const radians = THREE.MathUtils.degToRad(normalizeGearPressureAngle(pressureAngle));
  return 2 / Math.sin(radians) ** 2;
}

export type RackMeasures = {
  teeth: number;
  module: number;
  /** Teilung: der Abstand zweier Zahnmitten. */
  pitch: number;
  /** Die Laenge der Zahnstange - genau `teeth x pitch`. */
  length: number;
  depth: number;
  /** Wo die Waelzlinie liegt, in z. Auf ihr rollt der Teilkreis des Rades ab. */
  pitchLine: number;
  /** Die Spitzen der Zaehne, in z - sie liegen auf der Vorderkante des Rahmens. */
  tipLine: number;
  /** Der Zahnfuss, in z. */
  rootLine: number;
  /** Der Ruecken, in z. */
  backLine: number;
  /** Die halbe Zahnbreite auf der Waelzlinie, auf dem Kopf und im Fuss. */
  pitchHalf: number;
  tipHalf: number;
  rootHalf: number;
};

/**
 * Alle Masse einer Zahnstange.
 *
 * Auf der Waelzlinie ist der Zahn die halbe Teilung dick, abzueglich der
 * halben Spielbreite - dieselbe Rechnung wie beim Rad, damit ein Paar mit
 * genau dem eingestellten Spiel kaemmt und nicht mit dem doppelten. Nach
 * aussen nimmt die Dicke um `tan(Eingriffswinkel)` je Millimeter Hoehe ab,
 * nach innen genauso zu: Das **ist** die gerade Flanke.
 */
export function rackMeasures(
  length: number,
  depth: number,
  options: Pick<WorkplaneShape, "teeth" | "gearPressureAngle" | "gearBacklash">,
): RackMeasures {
  const teeth = normalizeRackTeeth(options.teeth);
  const module = rackModule(length, teeth);
  const pressure = THREE.MathUtils.degToRad(normalizeGearPressureAngle(options.gearPressureAngle));
  const backlash = normalizeGearBacklash(options.gearBacklash, module);
  const pitch = Math.PI * module;
  const safeDepth = normalizeRackDepth(depth, module);
  const tipLine = safeDepth / 2;
  const pitchLine = tipLine - module;
  const rootLine = pitchLine - 1.25 * module;
  const slope = Math.tan(pressure);
  const pitchHalf = pitch / 4 - backlash / 4;
  /*
   * Zwei Grenzen, die bei weiten Eingriffswinkeln greifen. Der Kopf darf
   * nicht spitz zulaufen (ein Zehntel Modul Flaeche bleibt stehen), und der
   * Fuss darf nicht breiter werden als die halbe Teilung - sonst kreuzten
   * sich die Fuesse zweier Nachbarn, und der Umriss schlaege eine Schleife.
   */
  const tipHalf = Math.max(0.05 * module, pitchHalf - module * slope);
  const rootHalf = Math.min(pitch / 2 - 0.05 * module, pitchHalf + 1.25 * module * slope);
  return {
    teeth,
    module,
    pitch,
    length: teeth * pitch,
    depth: safeDepth,
    pitchLine,
    tipLine,
    rootLine,
    backLine: -safeDepth / 2,
    pitchHalf,
    tipHalf,
    rootHalf,
  };
}

/** Die Mitte des Zahnes mit dieser Nummer, in x - eine halbe Teilung vom Ende. */
export function rackToothCentre(measures: Pick<RackMeasures, "pitch" | "length">, index: number) {
  return (index + 0.5) * measures.pitch - measures.length / 2;
}

/**
 * Der Umriss der Zahnstange, in der Ebene, in der auch das Zahnrad liegt:
 * `x` laengs der Stange, `z` zu den Zaehnen hin.
 *
 * Eine Stelle fuer das Netz und fuer den genauen Koerper - sonst zeichnete
 * das eine etwas anderes als das andere. Der Rundlauf geht aussen herum:
 * erst die Zahnreihe von links nach rechts, dann um den Ruecken zurueck.
 */
export function rackOutlineCorners(
  length: number,
  depth: number,
  options: Pick<WorkplaneShape, "teeth" | "gearPressureAngle" | "gearBacklash">,
): { x: number; z: number }[] {
  const measures = rackMeasures(length, depth, options);
  const { teeth, rootLine, tipLine, backLine, tipHalf, rootHalf } = measures;
  const half = measures.length / 2;
  const corners: { x: number; z: number }[] = [{ x: -half, z: rootLine }];
  for (let tooth = 0; tooth < teeth; tooth += 1) {
    const centre = rackToothCentre(measures, tooth);
    corners.push({ x: centre - rootHalf, z: rootLine });
    corners.push({ x: centre - tipHalf, z: tipLine });
    corners.push({ x: centre + tipHalf, z: tipLine });
    corners.push({ x: centre + rootHalf, z: rootLine });
  }
  corners.push({ x: half, z: rootLine });
  corners.push({ x: half, z: backLine });
  corners.push({ x: -half, z: backLine });
  return corners;
}

export type RackGeometryOptions = {
  width: number;
  depth: number;
  height: number;
  teeth?: number;
  gearPressureAngle?: number;
  gearBacklash?: number;
};

/**
 * Die Zahnstange als Netz: der Umriss, hochgezogen.
 *
 * Der Querschnitt liegt in der XY-Ebene mit den Zaehnen nach **-y**; nach
 * `rotateX(-90 Grad)` zeigen sie nach +z und die Hoehe laeuft von 0 nach +y,
 * so wie bei jedem anderen Koerper.
 */
export function createRackGeometry({ width, depth, height, ...options }: RackGeometryOptions) {
  const corners = rackOutlineCorners(width, depth, options as Pick<WorkplaneShape, "teeth" | "gearPressureAngle" | "gearBacklash">);
  const shape = new THREE.Shape(corners.map(({ x, z }) => new THREE.Vector2(x, -z)));
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.01, height),
    bevelEnabled: false,
    steps: 1,
  });
  geometry.rotateX(-Math.PI / 2);
  return geometry.toNonIndexed();
}
