import * as THREE from "three";
import { toCreasedNormals } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { GearProfile, GearType, WorkplaneShape } from "@/types/sketchforge";
import { roundWave, roundWaveCorners, type RoundWave } from "@/lib/roundWave";

export const DEFAULT_GEAR_TEETH = 12;
export const DEFAULT_GEAR_TOOTH_SIZE = 2.5;
export const DEFAULT_GEAR_CENTER_HOLE_SIZE = 6;
export const DEFAULT_GEAR_TYPE: GearType = "spur";
export const DEFAULT_GEAR_HELIX_ANGLE = 22.5;
export const DEFAULT_GEAR_HELIX_QUALITY = 16;
export const MIN_GEAR_TEETH = 6;
export const MAX_GEAR_TEETH = 64;
export const MIN_GEAR_HELIX_ANGLE = -45;
export const MAX_GEAR_HELIX_ANGLE = 45;
export const MIN_GEAR_HELIX_QUALITY = 4;
export const MAX_GEAR_HELIX_QUALITY = 32;

/*
 * Evolventenzaehne (nach Layerling 1.56.0, #201).
 *
 * Ein Zahnrad mit geraden Flanken sieht wie ein Zahnrad aus, kaemmt aber
 * nicht: Zwei davon haken und klemmen, weil ihre Flanken beim Abrollen
 * aneinander kratzen. Die Evolvente ist die Kurve, die das loest - sie
 * ueberwaelzt sich bei gleichbleibendem Uebersetzungsverhaeltnis, und zwei
 * Raeder mit demselben Modul kaemmen bei einem Achsabstand, der nur von
 * ihren Zaehnezahlen abhaengt.
 *
 * Eingestellt wird darum wie bei jedem Zahnradrechner: Zaehnezahl und Modul.
 * Daraus folgt alles andere - der Teilkreis ist Modul x Zaehnezahl, der
 * Aussendurchmesser Modul x (Zaehnezahl + 2).
 *
 * Alte Zahnraeder behalten ihre geraden Zaehne; die heissen jetzt "einfach".
 */

/** Der Eingriffswinkel, in Grad. 20 Grad ist die Norm. */
export const DEFAULT_GEAR_PRESSURE_ANGLE = 20;
export const MIN_GEAR_PRESSURE_ANGLE = 14.5;
export const MAX_GEAR_PRESSURE_ANGLE = 30;

/**
 * Das Spiel eines kaemmenden Paares, in Millimetern - je Rad die Haelfte von
 * der Zahnbreite abgenommen. Ohne Spiel klemmt ein gedrucktes Paar: Die Duese
 * legt mehr Material ab, als die Zeichnung sagt.
 */
export const DEFAULT_GEAR_BACKLASH = 0.2;
export const MAX_GEAR_BACKLASH = 2;

/** Mit diesem Modul faengt ein neues Evolventenrad an. */
export const DEFAULT_GEAR_MODULE = 2;

export const MIN_GEAR_MODULE = 0.2;
export const MAX_GEAR_MODULE = 20;

/**
 * Punkte je Flanke im gezeichneten Umriss. Zwoelf Schritte halten die Sehne
 * unter einem Hundertstel Millimeter - feiner als ein Drucker legt.
 */
const INVOLUTE_FLANK_STEPS = 12;

export function normalizeGearProfile(value?: string): GearProfile {
  // Ein Zahnrad, das vor den Evolventenzaehnen gespeichert wurde, hat kein
  // Profil und behaelt seine geraden Zaehne.
  return value === "involute" || value === "round" ? value : "simple";
}

/**
 * Runde Zaehne stehen niedriger als evolventische: Ein Modul ueber dem
 * Teilkreis wuerden sie am Fuss ausbauchen - dort waeren sie breiter als die
 * Muendung der Luecke, und zwei Boegen je Teilung geben das nicht her.
 */
export const ROUND_GEAR_ADDENDUM = 0.6;
export const ROUND_GEAR_DEDENDUM = 0.85;

/** Wie viele Module der Aussendurchmesser auf die Zaehnezahl legt. */
function gearDiameterTeethOffset(profile?: string) {
  return normalizeGearProfile(profile) === "round" ? ROUND_GEAR_ADDENDUM * 2 : 2;
}

export function normalizeGearPressureAngle(value?: number) {
  return clamp(Number.isFinite(value) ? value as number : DEFAULT_GEAR_PRESSURE_ANGLE, MIN_GEAR_PRESSURE_ANGLE, MAX_GEAR_PRESSURE_ANGLE);
}

/** Das Spiel, hoechstens ein halbes Modul - darueber bleibt kein Zahn uebrig. */
export function normalizeGearBacklash(value: number | undefined, module: number) {
  return clamp(Number.isFinite(value) ? value as number : DEFAULT_GEAR_BACKLASH, 0, Math.min(MAX_GEAR_BACKLASH, module * 0.5));
}

export function normalizeGearModule(value?: number) {
  return clamp(Number.isFinite(value) ? value as number : DEFAULT_GEAR_MODULE, MIN_GEAR_MODULE, MAX_GEAR_MODULE);
}

/** Der Aussendurchmesser zu Modul und Zaehnezahl - Breite und Tiefe des Koerpers. */
export function involuteGearDiameter(module: number, teeth?: number, profile?: string) {
  return Math.max(MIN_GEAR_MODULE, module) * (normalizeGearTeeth(teeth) + gearDiameterTeethOffset(profile));
}

/** Und zurueck: das Modul, das zu diesem Aussendurchmesser gehoert. */
export function involuteGearModule(diameter: number, teeth?: number, profile?: string) {
  return Math.max(0.001, diameter) / (normalizeGearTeeth(teeth) + gearDiameterTeethOffset(profile));
}

/**
 * Der Achsabstand, bei dem zwei Evolventenraeder desselben Moduls kaemmen:
 * die Summe ihrer Teilkreishalbmesser. Das ist die Zusage, um die es bei
 * diesen Zaehnen ueberhaupt geht.
 */
export function involuteCentreDistance(module: number, teethA?: number, teethB?: number) {
  return (Math.max(MIN_GEAR_MODULE, module) * (normalizeGearTeeth(teethA) + normalizeGearTeeth(teethB))) / 2;
}

/** Die Evolventenfunktion: tan(a) - a. */
function involuteFunction(angle: number) {
  return Math.tan(angle) - angle;
}

export type InvoluteGearMeasures = {
  teeth: number;
  module: number;
  pitchRadius: number;
  baseRadius: number;
  tipRadius: number;
  rootRadius: number;
  /** Wo die Evolvente anfaengt: am Grundkreis, oder am Fusskreis, wenn der weiter aussen liegt. */
  flankRadius: number;
  /** Wie weit eine Flanke von der Zahnmitte weggedreht am Grundkreis ansetzt. */
  flankTurn: number;
  /** Die Abwickelwinkel, bei denen die Flanke anfaengt und den Kopf trifft. */
  rollStart: number;
  rollEnd: number;
};

/**
 * Alle Masse eines Evolventenzahnes aus Zaehnezahl, Modul, Eingriffswinkel
 * und Spiel.
 *
 * Der Kopf steht ein Modul ueber dem Teilkreis, der Fuss 1,25 Modul darunter
 * (die 0,25 sind das Kopfspiel). Die Zahnbreite auf dem Teilkreis ist die
 * halbe Teilung, abzueglich der halben Spielbreite - deshalb kaemmt ein Paar
 * mit genau dem eingestellten Spiel und nicht mit dem doppelten.
 */
export function involuteGearMeasures(
  width: number,
  options: Pick<WorkplaneShape, "teeth" | "gearPressureAngle" | "gearBacklash">,
): InvoluteGearMeasures {
  const teeth = normalizeGearTeeth(options.teeth);
  const module = involuteGearModule(Math.max(0.01, width), teeth);
  const pressure = THREE.MathUtils.degToRad(normalizeGearPressureAngle(options.gearPressureAngle));
  const backlash = normalizeGearBacklash(options.gearBacklash, module);
  const pitchRadius = (module * teeth) / 2;
  const baseRadius = pitchRadius * Math.cos(pressure);
  const rootRadius = Math.max(pitchRadius * 0.2, pitchRadius - 1.25 * module);
  const flankRadius = Math.max(baseRadius, rootRadius);
  const thickness = (Math.PI * module) / 2 - backlash / 2;
  // Die halbe Zahnbreite auf dem Teilkreis, auf den Grundkreis zurueckgerechnet.
  const flankTurn = thickness / (2 * pitchRadius) + involuteFunction(pressure);
  const roll = (radius: number) => Math.sqrt(Math.max(0, (radius / baseRadius) ** 2 - 1));
  const turnAt = (radius: number) => flankTurn - (roll(radius) - Math.atan(roll(radius)));
  /*
   * Die beiden Flanken laufen nach aussen aufeinander zu und treffen sich,
   * wo die Drehung verbraucht ist - bei wenigen Zaehnen schon unter dem
   * Kopfkreis. Dann wird der Kopf dorthin zurueckgenommen, statt einen Zahn
   * zu zeichnen, dessen Flanken sich kreuzen. Gesucht wird die Stelle durch
   * Halbieren; 50 Schritte reichen weit ueber jede Fertigungsgenauigkeit.
   */
  let tipRadius = pitchRadius + module;
  if (turnAt(tipRadius) < flankTurn * 0.08) {
    let low = flankRadius;
    let high = tipRadius;
    for (let step = 0; step < 50; step += 1) {
      const middle = (low + high) / 2;
      if (turnAt(middle) < flankTurn * 0.08) high = middle;
      else low = middle;
    }
    tipRadius = low;
  }
  return { teeth, module, pitchRadius, baseRadius, tipRadius, rootRadius, flankRadius, flankTurn, rollStart: roll(flankRadius), rollEnd: roll(tipRadius) };
}

/**
 * Ein Punkt auf einer Flanke, beim Abwickelwinkel `roll`.
 *
 * `centre` ist die Mitte des Zahnes (im Bogenmass von +x nach +z), `side` -1
 * die Flanke davor und +1 die danach. Die Evolvente wickelt sich vom
 * Grundkreis weg von der Zahnmitte ab.
 */
export function involuteFlankPoint(measures: InvoluteGearMeasures, centre: number, side: -1 | 1, roll: number) {
  const { baseRadius, flankTurn } = measures;
  const turn = centre + side * flankTurn;
  const localX = baseRadius * (Math.cos(roll) + roll * Math.sin(roll));
  const localZ = -side * baseRadius * (Math.sin(roll) - roll * Math.cos(roll));
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  return { x: localX * cos - localZ * sin, z: localX * sin + localZ * cos };
}

/** Der Winkel, unter dem eine Flanke diesen Halbmesser trifft. */
function involuteFlankAngle(measures: InvoluteGearMeasures, centre: number, side: -1 | 1, radius: number) {
  const roll = Math.sqrt(Math.max(0, (Math.max(radius, measures.baseRadius) / measures.baseRadius) ** 2 - 1));
  return centre + side * (measures.flankTurn - (roll - Math.atan(roll)));
}

/** Die Mitte des Zahnes mit dieser Nummer - dieselbe Teilung wie bei den geraden Zaehnen. */
export function involuteToothCentre(teeth: number, index: number) {
  return ((index + 0.5) / teeth) * Math.PI * 2;
}

export type RoundGearMeasures = RoundWave & { module: number; pitchRadius: number };

/**
 * Runde Zaehne nach Modul und Zaehnezahl.
 *
 * Der Kopf steht 0,6 Modul ueber dem Teilkreis, der Grund 0,85 darunter - ein
 * Viertelmodul Luft fuer den Kopf des Gegenrades. Auf dem Teilkreis ist der
 * Zahn so dick wie die halbe Teilung minus die halbe Spielbreite, also kaemmen
 * zwei runde Raeder desselben Moduls beim gewohnten Achsabstand.
 */
export function roundGearMeasures(width: number, options: Pick<WorkplaneShape, "teeth" | "gearBacklash">): RoundGearMeasures {
  const teeth = normalizeGearTeeth(options.teeth);
  const module = involuteGearModule(Math.max(0.01, width), teeth, "round");
  const backlash = normalizeGearBacklash(options.gearBacklash, module);
  const pitchRadius = (module * teeth) / 2;
  const tipRadius = pitchRadius + ROUND_GEAR_ADDENDUM * module;
  const rootRadius = Math.max(pitchRadius * 0.2, pitchRadius - ROUND_GEAR_DEDENDUM * module);
  const halfThickness = Math.PI / teeth / 2 - backlash / (4 * pitchRadius);
  const wave = roundWave(teeth, tipRadius, rootRadius, pitchRadius, halfThickness, involuteToothCentre(teeth, 0));
  return { ...wave, module, pitchRadius };
}

export type GearOutlineCorner = { angle: number; radiusX: number; radiusZ: number };

/**
 * Der Umriss eines Evolventenrades als Ecken auf Kreisen.
 *
 * Je Zahn: die Flanke davor von ihrem Fuss bis zum Kopf, der Kopfpunkt, die
 * Flanke danach zurueck, und die Luecke bis zur naechsten Zahnmitte. Liegt
 * der Fusskreis innerhalb des Grundkreises, laeuft von dort eine gerade
 * Strecke nach innen - eine Evolvente gibt es dort nicht.
 */
function involuteOutlineCorners(measures: InvoluteGearMeasures): GearOutlineCorner[] {
  const { teeth, rootRadius, flankRadius, tipRadius, rollStart, rollEnd, baseRadius } = measures;
  const corners: GearOutlineCorner[] = [];
  const push = (angle: number, radius: number) => corners.push({ angle, radiusX: radius, radiusZ: radius });
  const radii = Array.from({ length: INVOLUTE_FLANK_STEPS + 1 }, (_, step) => {
    const roll = rollStart + ((rollEnd - rollStart) * step) / INVOLUTE_FLANK_STEPS;
    return baseRadius * Math.sqrt(1 + roll * roll);
  });
  radii[0] = flankRadius;
  radii[radii.length - 1] = tipRadius;
  const radial = rootRadius < flankRadius - 1e-9;
  for (let tooth = 0; tooth < teeth; tooth += 1) {
    const centre = involuteToothCentre(teeth, tooth);
    if (radial) push(involuteFlankAngle(measures, centre, -1, flankRadius), rootRadius);
    for (const radius of radii) push(involuteFlankAngle(measures, centre, -1, radius), radius);
    push(centre, tipRadius);
    for (const radius of [...radii].reverse()) push(involuteFlankAngle(measures, centre, 1, radius), radius);
    if (radial) push(involuteFlankAngle(measures, centre, 1, flankRadius), rootRadius);
    push(centre + Math.PI / teeth, rootRadius);
  }
  return corners;
}

/**
 * Der Umriss des Zahnrades: evolventisch oder einfach.
 *
 * Eine Stelle fuer beide Profile, aus der sich das Netz und der genaue
 * Koerper bedienen - sonst zeichnete das eine etwas anderes als das andere.
 */
export function gearOutlineCorners(
  width: number,
  depth: number,
  options: Pick<WorkplaneShape, "teeth" | "toothSize" | "toothWidth" | "gearProfile" | "gearPressureAngle" | "gearBacklash">,
): GearOutlineCorner[] {
  const safeWidth = Math.max(0.01, width);
  const safeDepth = Math.max(0.01, depth);
  if (normalizeGearProfile(options.gearProfile) === "involute") {
    return involuteOutlineCorners(involuteGearMeasures(safeWidth, options));
  }
  if (normalizeGearProfile(options.gearProfile) === "round") {
    return roundWaveCorners(roundGearMeasures(safeWidth, options));
  }
  const teeth = normalizeGearTeeth(options.teeth);
  const toothSize = normalizeGearToothSize(options.toothSize, safeWidth, safeDepth);
  const toothFraction = normalizeGearToothWidth(options.toothWidth, safeWidth, safeDepth, teeth) / gearToothPitch(safeWidth, safeDepth, teeth);
  const outerX = safeWidth / 2;
  const outerZ = safeDepth / 2;
  const rootX = Math.max(outerX * 0.34, outerX - toothSize);
  const rootZ = Math.max(outerZ * 0.34, outerZ - toothSize);
  const toothPhases = [0.05, (1 - toothFraction) / 2, (1 + toothFraction) / 2, 0.95] as const;
  const corners: GearOutlineCorner[] = [];
  for (let tooth = 0; tooth < teeth; tooth += 1) {
    toothPhases.forEach((phase, phaseIndex) => {
      const isOuter = phaseIndex === 1 || phaseIndex === 2;
      corners.push({ angle: ((tooth + phase) / teeth) * Math.PI * 2, radiusX: isOuter ? outerX : rootX, radiusZ: isOuter ? outerZ : rootZ });
    });
  }
  return corners;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function normalizeGearTeeth(value?: number) {
  return clamp(Math.round(Number.isFinite(value) ? value as number : DEFAULT_GEAR_TEETH), MIN_GEAR_TEETH, MAX_GEAR_TEETH);
}

export function normalizeGearType(value?: string): GearType {
  return value === "helical" || value === "bevel" ? value : DEFAULT_GEAR_TYPE;
}

export function normalizeGearToothSize(value: number | undefined, width: number, depth: number) {
  const maximum = Math.max(0.2, Math.min(width, depth) * 0.22);
  return clamp(Number.isFinite(value) ? value as number : DEFAULT_GEAR_TOOTH_SIZE, 0.2, maximum);
}

export function gearToothPitch(width: number, depth: number, teeth?: number) {
  return Math.PI * Math.max(0.01, Math.min(width, depth)) / normalizeGearTeeth(teeth);
}

export function normalizeGearToothWidth(value: number | undefined, width: number, depth: number, teeth?: number) {
  const pitch = gearToothPitch(width, depth, teeth);
  return clamp(Number.isFinite(value) ? value as number : pitch * 0.54, pitch * 0.12, pitch * 0.82);
}

export function gearCenterHoleLimits(width: number, depth: number, toothSize?: number) {
  const outerRadius = Math.max(0.005, Math.min(width, depth) / 2);
  const normalizedToothSize = normalizeGearToothSize(toothSize, width, depth);
  const rootRadius = Math.max(outerRadius * 0.34, outerRadius - normalizedToothSize);
  const max = Math.max(0.01, rootRadius * 1.5);
  return { min: 0, max };
}

export function normalizeGearCenterHoleSize(value: number | undefined, width: number, depth: number, toothSize?: number) {
  const limits = gearCenterHoleLimits(width, depth, toothSize);
  const outerRadius = Math.max(0.005, Math.min(width, depth) / 2);
  const normalizedToothSize = normalizeGearToothSize(toothSize, width, depth);
  const rootRadius = Math.max(outerRadius * 0.34, outerRadius - normalizedToothSize);
  const defaultSize = Math.min(outerRadius * 0.4, rootRadius * 1.1);
  return clamp(Number.isFinite(value) ? value as number : defaultSize, limits.min, limits.max);
}

export function normalizeGearHelixAngle(value?: number) {
  return clamp(
    Number.isFinite(value) ? value as number : DEFAULT_GEAR_HELIX_ANGLE,
    MIN_GEAR_HELIX_ANGLE,
    MAX_GEAR_HELIX_ANGLE,
  );
}

export function normalizeGearHelixQuality(value?: number) {
  return clamp(
    Math.round(Number.isFinite(value) ? value as number : DEFAULT_GEAR_HELIX_QUALITY),
    MIN_GEAR_HELIX_QUALITY,
    MAX_GEAR_HELIX_QUALITY,
  );
}

export function gearSettings(shape: Pick<WorkplaneShape, "width" | "depth" | "teeth" | "toothSize" | "toothWidth" | "centerHoleSize" | "gearType" | "helixAngle" | "helixQuality">) {
  return {
    teeth: normalizeGearTeeth(shape.teeth),
    toothSize: normalizeGearToothSize(shape.toothSize, shape.width, shape.depth),
    toothWidth: normalizeGearToothWidth(shape.toothWidth, shape.width, shape.depth, shape.teeth),
    centerHoleSize: normalizeGearCenterHoleSize(shape.centerHoleSize, shape.width, shape.depth, shape.toothSize),
    gearType: normalizeGearType(shape.gearType),
    helixAngle: normalizeGearHelixAngle(shape.helixAngle),
    helixQuality: normalizeGearHelixQuality(shape.helixQuality),
  };
}

type GearGeometryOptions = {
  width: number;
  depth: number;
  height: number;
  teeth?: number;
  toothSize?: number;
  toothWidth?: number;
  centerHoleSize?: number;
  gearType?: GearType;
  helixAngle?: number;
  helixQuality?: number;
  gearProfile?: GearProfile;
  gearPressureAngle?: number;
  gearBacklash?: number;
};

export function createGearGeometry({
  width,
  depth,
  height,
  teeth: requestedTeeth,
  toothSize: requestedToothSize,
  toothWidth: requestedToothWidth,
  centerHoleSize: requestedCenterHoleSize,
  gearType: requestedType,
  helixAngle: requestedHelixAngle,
  helixQuality: requestedHelixQuality,
  gearProfile: requestedProfile,
  gearPressureAngle: requestedPressureAngle,
  gearBacklash: requestedBacklash,
}: GearGeometryOptions) {
  const safeWidth = Math.max(0.01, width);
  const safeDepth = Math.max(0.01, depth);
  const safeHeight = Math.max(0.01, height);
  const teeth = normalizeGearTeeth(requestedTeeth);
  const toothSize = normalizeGearToothSize(requestedToothSize, safeWidth, safeDepth);
  const toothPitch = gearToothPitch(safeWidth, safeDepth, teeth);
  const toothWidth = normalizeGearToothWidth(requestedToothWidth, safeWidth, safeDepth, teeth);
  const centerHoleSize = normalizeGearCenterHoleSize(requestedCenterHoleSize, safeWidth, safeDepth, toothSize);
  const hasCenterHole = centerHoleSize > 0;
  const gearType = normalizeGearType(requestedType);
  const helixAngle = normalizeGearHelixAngle(requestedHelixAngle);
  const helixQuality = normalizeGearHelixQuality(requestedHelixQuality);
  /*
   * Der Umriss kommt aus `gearOutlineCorners` - einfache oder evolventische
   * Zaehne, eine Stelle fuer beide. Das Netz zieht ihn nur hoch (und dreht
   * ihn beim Schraegrad mit).
   */
  const corners = gearOutlineCorners(safeWidth, safeDepth, {
    teeth: requestedTeeth,
    toothSize: requestedToothSize,
    toothWidth: requestedToothWidth,
    gearProfile: requestedProfile,
    gearPressureAngle: requestedPressureAngle,
    gearBacklash: requestedBacklash,
  } as Pick<WorkplaneShape, "teeth" | "toothSize" | "toothWidth" | "gearProfile" | "gearPressureAngle" | "gearBacklash">);
  const outlineCount = corners.length;
  const ringCount = gearType === "helical" ? helixQuality : 2;
  const twist = gearType === "helical" ? THREE.MathUtils.degToRad(helixAngle) : 0;
  const topScale = gearType === "bevel" ? 0.68 : 1;
  const outerX = safeWidth / 2;
  const outerZ = safeDepth / 2;
  const boreX = centerHoleSize / 2;
  const boreZ = centerHoleSize / 2;
  const positions: number[] = [];
  const indices: number[] = [];

  const outerIndex = (ring: number, point: number) => ring * outlineCount * 2 + point;
  const innerIndex = (ring: number, point: number) => ring * outlineCount * 2 + outlineCount + point;

  for (let ring = 0; ring < ringCount; ring += 1) {
    const progress = ring / (ringCount - 1);
    const y = progress * safeHeight;
    const ringTwist = progress * twist;
    const scale = 1 + (topScale - 1) * progress;

    corners.forEach((corner) => {
      const angle = corner.angle + ringTwist;
      positions.push(Math.cos(angle) * corner.radiusX * scale, y, Math.sin(angle) * corner.radiusZ * scale);
    });

    for (let point = 0; point < outlineCount; point += 1) {
      const angle = (point / outlineCount) * Math.PI * 2;
      positions.push(Math.cos(angle) * boreX, y, Math.sin(angle) * boreZ);
    }
  }

  let outlineMinX = Number.POSITIVE_INFINITY;
  let outlineMaxX = Number.NEGATIVE_INFINITY;
  let outlineMinZ = Number.POSITIVE_INFINITY;
  let outlineMaxZ = Number.NEGATIVE_INFINITY;
  for (let ring = 0; ring < ringCount; ring += 1) {
    for (let point = 0; point < outlineCount; point += 1) {
      const offset = outerIndex(ring, point) * 3;
      outlineMinX = Math.min(outlineMinX, positions[offset]);
      outlineMaxX = Math.max(outlineMaxX, positions[offset]);
      outlineMinZ = Math.min(outlineMinZ, positions[offset + 2]);
      outlineMaxZ = Math.max(outlineMaxZ, positions[offset + 2]);
    }
  }
  /*
   * Der Umriss wird auf die Rahmengroesse gezogen - aber nur bei geraden
   * Zaehnen, deren Form keine Zusage traegt.
   *
   * Bei Evolventenzaehnen waere das Ziehen der Tod der ganzen Sache: Der
   * Aussendurchmesser ist der **Kopfkreis**, und bei zwoelf Zaehnen zeigt
   * keiner von ihnen genau nach +x - die Breite des Umrisses ist darum
   * 27,05 mm statt 28. Wer sie auf 28 zieht, dehnt das Rad um 3,4 Prozent und
   * damit sein Modul, und zwei Raeder "mit demselben Modul" kaemmen nicht
   * mehr. Gemessen: 2.521 mm^3 gezogen gegen 2.391 mm^3 im Mass. Also bleibt
   * ein Evolventenrad bei seinem Modul und ist ein paar Prozent schmaler als
   * sein Rahmen. Fuer runde Zaehne gilt dasselbe - auch sie kaemmen nach
   * Modul.
   */
  if (normalizeGearProfile(requestedProfile) === "simple") {
    const outlineScaleX = safeWidth / Math.max(Number.EPSILON, outlineMaxX - outlineMinX);
    const outlineScaleZ = safeDepth / Math.max(Number.EPSILON, outlineMaxZ - outlineMinZ);
    for (let ring = 0; ring < ringCount; ring += 1) {
      for (let point = 0; point < outlineCount; point += 1) {
        const offset = outerIndex(ring, point) * 3;
        positions[offset] *= outlineScaleX;
        positions[offset + 2] *= outlineScaleZ;
      }
    }
  }

  for (let ring = 0; ring < ringCount - 1; ring += 1) {
    for (let point = 0; point < outlineCount; point += 1) {
      const next = (point + 1) % outlineCount;
      const outerBottom = outerIndex(ring, point);
      const outerNextBottom = outerIndex(ring, next);
      const outerTop = outerIndex(ring + 1, point);
      const outerNextTop = outerIndex(ring + 1, next);
      indices.push(outerBottom, outerTop, outerNextTop, outerBottom, outerNextTop, outerNextBottom);

      if (hasCenterHole) {
        const innerBottom = innerIndex(ring, point);
        const innerNextBottom = innerIndex(ring, next);
        const innerTop = innerIndex(ring + 1, point);
        const innerNextTop = innerIndex(ring + 1, next);
        indices.push(innerBottom, innerNextBottom, innerNextTop, innerBottom, innerNextTop, innerTop);
      }
    }
  }

  const topRing = ringCount - 1;
  for (let point = 0; point < outlineCount; point += 1) {
    const next = (point + 1) % outlineCount;
    const bottomOuter = outerIndex(0, point);
    const bottomOuterNext = outerIndex(0, next);
    const bottomInner = innerIndex(0, point);
    const bottomInnerNext = innerIndex(0, next);
    if (hasCenterHole) {
      indices.push(bottomOuter, bottomOuterNext, bottomInnerNext, bottomOuter, bottomInnerNext, bottomInner);
    } else {
      indices.push(bottomOuter, bottomOuterNext, innerIndex(0, 0));
    }

    const topOuter = outerIndex(topRing, point);
    const topOuterNext = outerIndex(topRing, next);
    const topInner = innerIndex(topRing, point);
    const topInnerNext = innerIndex(topRing, next);
    if (hasCenterHole) {
      indices.push(topOuter, topInner, topInnerNext, topOuter, topInnerNext, topOuterNext);
    } else {
      indices.push(topOuter, innerIndex(topRing, 0), topOuterNext);
    }
  }

  const indexed = new THREE.BufferGeometry();
  indexed.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  indexed.setIndex(indices);
  const geometry = toCreasedNormals(indexed, THREE.MathUtils.degToRad(12));
  indexed.dispose();
  geometry.computeBoundingBox();
  return geometry;
}
