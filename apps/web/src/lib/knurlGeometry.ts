import * as THREE from "three";
import type { KnurlPattern } from "@/types/sketchforge";
import { roundWave, roundWaveCorners, roundWaveRadiusAt } from "@/lib/roundWave";

/**
 * knurlGeometry.ts
 *
 * Die Raendelung: ein runder Griff mit Rillen ringsherum, laengs der Achse
 * oder gekreuzt zu kleinen Rauten. Fuer Drehknoepfe, Raendelschrauben und
 * Werkzeuggriffe.
 *
 * Der Querschnitt ist ein Ring aus V-Rillen: ein Grat auf dem aeusseren
 * Halbmesser, ein Rillengrund `depth` weiter innen, dazwischen gerade Flanken.
 * Die gerade Raendelung zieht diesen Umriss hoch. Die gekreuzte ist das, was
 * zwei gegeneinander verdrehte Abzuege davon gemeinsam haben - an jeder
 * Stelle also der kleinere der beiden Halbmesser.
 *
 * Der Rahmen wie beim Zahnrad: mittig auf x und z, von y = 0 bis zur Hoehe,
 * Winkel von +x nach +z.
 *
 * Nach Layerling. Dort ist die gerade Raendelung ein genauer CAD-Koerper
 * (ueber deren Profilhochziehung, die wir nicht haben) - bei uns ist sie,
 * wie jede Form ausser den Grundkoerpern, ein Netz.
 */

export type { KnurlPattern };

export const DEFAULT_KNURL_DIAMETER = 20;
export const DEFAULT_KNURL_HEIGHT = 15;
export const DEFAULT_KNURL_PATTERN: KnurlPattern = "straight";
export const DEFAULT_KNURL_COUNT = 30;
export const DEFAULT_KNURL_DEPTH = 0.6;
export const DEFAULT_KNURL_ANGLE = 30;
export const DEFAULT_KNURL_CHAMFER = 0.5;
export const MIN_KNURL_COUNT = 6;
export const MAX_KNURL_COUNT = 180;
export const MIN_KNURL_DEPTH = 0.1;
export const MIN_KNURL_ANGLE = 10;
export const MAX_KNURL_ANGLE = 60;

export function normalizeKnurlPattern(value: unknown): KnurlPattern {
  return value === "diamond" || value === "round" ? value : "straight";
}

/**
 * Der engste Rillenabstand rund um den Griff, in Millimetern. Feiner zeigt
 * kein Schmelzschichtdrucker - die Duese ist breiter als die Rille.
 */
export const MIN_KNURL_PITCH = 0.8;

/** Wie viele Rillen bei diesem Durchmesser hoechstens ringsherum passen. */
export function maxKnurlCount(diameter?: number) {
  if (!(typeof diameter === "number" && diameter > 0)) return MAX_KNURL_COUNT;
  return Math.max(MIN_KNURL_COUNT, Math.min(MAX_KNURL_COUNT, Math.floor((Math.PI * diameter) / MIN_KNURL_PITCH)));
}

export function normalizeKnurlCount(value: unknown, diameter?: number) {
  const count = typeof value === "number" && Number.isFinite(value) ? Math.round(value) : DEFAULT_KNURL_COUNT;
  return Math.min(maxKnurlCount(diameter), Math.max(MIN_KNURL_COUNT, count));
}

/**
 * Wie tief eine Rille gehen darf: ein Drittel des Wegs zur Achse, und nie
 * unter das Mindestmass.
 *
 * Runde Rillen koennen nicht so tief: Zwei Boegen je Teilung bauchen am Fuss
 * aus, wenn sie tiefer stehen als etwa die halbe Teilung - die Rille waere
 * dort breiter als ihre Muendung. Darum bleiben sie unter 0,45 der Teilung
 * rund um den Griff; eine groessere Angabe gibt nach.
 */
export function maxKnurlDepth(diameter: number, count?: number, pattern?: unknown) {
  const limit = Math.max(MIN_KNURL_DEPTH, (diameter / 2) / 3);
  if (normalizeKnurlPattern(pattern) !== "round") return limit;
  const pitch = (Math.PI * Math.max(0.001, diameter)) / normalizeKnurlCount(count, diameter);
  return Math.max(MIN_KNURL_DEPTH, Math.min(limit, pitch * 0.45));
}

export function normalizeKnurlDepth(value: unknown, diameter: number, count?: number, pattern?: unknown) {
  const depth = typeof value === "number" && Number.isFinite(value) ? value : DEFAULT_KNURL_DEPTH;
  return Math.min(maxKnurlDepth(diameter, count, pattern), Math.max(MIN_KNURL_DEPTH, depth));
}

/** Wie steil die gekreuzten Rillen laufen, in Grad von der Achse. */
export function normalizeKnurlAngle(value: unknown) {
  const angle = typeof value === "number" && Number.isFinite(value) ? value : DEFAULT_KNURL_ANGLE;
  return Math.min(MAX_KNURL_ANGLE, Math.max(MIN_KNURL_ANGLE, angle));
}

/**
 * Die Fase von 45 Grad an beiden Enden, in Millimetern: hoechstens ein
 * Viertel des Durchmessers und etwas unter der halben Hoehe, damit die beiden
 * sich nie treffen.
 */
export function maxKnurlChamfer(diameter: number, height: number) {
  return Math.max(0, Math.min(diameter / 4, height / 2 - 0.05));
}

export function normalizeKnurlChamfer(value: unknown, diameter: number, height: number) {
  const chamfer = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return Math.min(maxKnurlChamfer(diameter, height), Math.max(0, chamfer));
}

export type KnurlCorner = { angle: number; radius: number };

/**
 * Die Welle der runden Raendelung: Grate und Rillen gleich breit, Koepfe auf
 * dem aeusseren Halbmesser, Gruende eine Rillentiefe darunter.
 */
export function knurlWave(diameter: number, count: number, depth: number) {
  const radius = diameter / 2;
  const grooves = normalizeKnurlCount(count, diameter);
  const half = Math.PI / grooves;
  // Gleich breit heisst: der Grat nimmt die Haelfte der halben Teilung ein.
  return roundWave(grooves, radius, radius - depth, radius - depth / 2, half / 2, 0);
}

/** Die Ecken des Umrisses: Grate auf dem aeusseren Halbmesser, Rillengruende dazwischen. */
export function knurlCorners(diameter: number, count: number, depth: number, pattern?: unknown): KnurlCorner[] {
  if (normalizeKnurlPattern(pattern) === "round") {
    return roundWaveCorners(knurlWave(diameter, count, depth)).map(({ angle, radiusX }) => ({ angle, radius: radiusX }));
  }
  const radius = diameter / 2;
  const grooves = normalizeKnurlCount(count, diameter);
  const step = (Math.PI * 2) / grooves;
  const corners: KnurlCorner[] = [];
  for (let index = 0; index < grooves; index += 1) {
    corners.push({ angle: index * step, radius });
    corners.push({ angle: index * step + step / 2, radius: radius - depth });
  }
  return corners;
}

/**
 * Wie weit sich eine Rille vom Fuss bis zum Kopf herumdreht, wenn sie unter
 * `angle` Grad zur Achse steigt - im Bogenmass.
 */
export function knurlTwist(diameter: number, height: number, angle: number) {
  return (height * Math.tan(THREE.MathUtils.degToRad(normalizeKnurlAngle(angle)))) / (diameter / 2);
}

export type KnurlShapeFields = {
  width: number;
  height: number;
  knurlPattern?: KnurlPattern;
  knurlCount?: number;
  knurlDepth?: number;
  knurlAngle?: number;
  knurlChamfer?: number;
};

export function knurlSettings(shape: KnurlShapeFields) {
  const diameter = Math.max(1, shape.width);
  const height = Math.max(0.1, shape.height);
  return {
    diameter,
    height,
    pattern: normalizeKnurlPattern(shape.knurlPattern),
    count: normalizeKnurlCount(shape.knurlCount, diameter),
    depth: normalizeKnurlDepth(shape.knurlDepth, diameter, shape.knurlCount, shape.knurlPattern),
    angle: normalizeKnurlAngle(shape.knurlAngle),
    chamfer: normalizeKnurlChamfer(shape.knurlChamfer, diameter, height),
  };
}

/**
 * Der Halbmesser des geraden Umrisses in Richtung `phi`: dort, wo dieser
 * Strahl die Flanke zwischen einem Grat und einem Rillengrund trifft.
 */
function outlineRadiusAt(phi: number, radius: number, depth: number, count: number) {
  const step = (Math.PI * 2) / count;
  const local = ((phi % step) + step) % step;
  // Grat bei 0, Rille bei step/2, wieder Grat bei step: die zweite Haelfte
  // ist die gespiegelte erste.
  const toward = local <= step / 2 ? local : step - local;
  const ridge = { x: radius, z: 0 };
  const groove = { x: Math.cos(step / 2) * (radius - depth), z: Math.sin(step / 2) * (radius - depth) };
  const direction = { x: Math.cos(toward), z: Math.sin(toward) };
  const edge = { x: groove.x - ridge.x, z: groove.z - ridge.z };
  const cross = (a: { x: number; z: number }, b: { x: number; z: number }) => a.x * b.z - a.z * b.x;
  return cross(ridge, edge) / cross(direction, edge);
}

export function createKnurlGeometry(shape: KnurlShapeFields): THREE.BufferGeometry {
  const { diameter, height, pattern, count, depth, angle, chamfer } = knurlSettings(shape);
  const radius = diameter / 2;
  const positions: number[] = [];
  const indices: number[] = [];

  if (pattern !== "diamond" && chamfer <= 0) {
    // Genau der Umriss, hochgezogen: ein Ring am Fuss, einer oben.
    const corners = knurlCorners(diameter, count, depth, pattern);
    [0, height].forEach((y) => corners.forEach(({ angle: a, radius: r }) => positions.push(Math.cos(a) * r, y, Math.sin(a) * r)));
    const n = corners.length;
    for (let i = 0; i < n; i += 1) {
      const j = (i + 1) % n;
      indices.push(i, n + i, j, j, n + i, n + j);
    }
    addCaps(positions, indices, 0, n, n, height);
  } else {
    /*
     * Sechs Spalten je Flanke, weniger dort, wo viele Rillen auf einem langen,
     * steilen Griff ueber etwa 200.000 Zellen kaemen: Eine Spalte je Flanke
     * legt immer noch jeden Grat und jeden Rillengrund auf das Gitter, die
     * Flaeche bekommt nur weniger Facetten.
     */
    const diamond = pattern === "diamond";
    const twistGuess = diamond ? Math.abs(knurlTwist(diameter, height, angle)) : 0;
    const columnBudget = Math.sqrt((200000 * Math.PI * 2) / Math.max(twistGuess, 1e-6));
    const columnsPerHalfGroove = Math.max(1, Math.min(6, Math.floor(columnBudget / (count * 2))));
    const columns = count * columnsPerHalfGroove * 2;
    const columnStep = (Math.PI * 2) / columns;
    /*
     * Gekreuzt liegt das Gitter entlang der Rillen: Jede Reihe dreht beide
     * Rillenscharen um genau eine Spalte weiter, also laeuft jede Rillenlinie
     * durch Gitterpunkte, schnurgerade eine Diagonale hoch, und jede Zelle
     * wird entlang der Diagonale jener Schar geteilt, die hier die Flaeche
     * bildet. So gibt es keine Treppe an den Graten; der Winkel verschiebt
     * sich dafuer um ein Haar.
     *
     * Gerade braucht es Reihen nur dort, wo die Fase schneidet - zwischen den
     * Enden laufen die Rillen gerade durch.
     */
    const levels: Array<{ y: number; turn: number }> = [];
    if (diamond) {
      const rows = Math.max(1, Math.min(2000, Math.round(knurlTwist(diameter, height, angle) / columnStep)));
      for (let row = 0; row <= rows; row += 1) levels.push({ y: (row / rows) * height, turn: row * columnStep });
    } else {
      const steps = 8;
      for (let step = 0; step <= steps; step += 1) levels.push({ y: (step / steps) * chamfer, turn: 0 });
      for (let step = 0; step <= steps; step += 1) levels.push({ y: height - chamfer + (step / steps) * chamfer, turn: 0 });
    }
    /*
     * Der Halbmesser in einer Richtung - fuer die Fase (die als Kegel
     * schneidet) und fuer die gekreuzte Raendelung (zwei verdrehte Wellen,
     * die kleinere gilt). Bei runden Rillen fragt derselbe Strahl die Welle.
     */
    const wave = pattern === "round" ? knurlWave(diameter, count, depth) : null;
    const outline = (phi: number) => (wave ? roundWaveRadiusAt(wave, phi) : outlineRadiusAt(phi, radius, depth, count));
    // Die Fase ist ein Kegel unter 45 Grad: kein Punkt steht weiter aussen als
    // der volle Halbmesser minus der Fase, plus dem Abstand zum naeheren Ende.
    const cone = (y: number) => (chamfer > 0 ? radius - chamfer + Math.min(y, height - y) : Infinity);
    levels.forEach(({ y, turn }) => {
      for (let column = 0; column < columns; column += 1) {
        const phi = column * columnStep;
        const r = Math.min(outline(phi - turn), outline(phi + turn), cone(y));
        positions.push(Math.cos(phi) * r, y, Math.sin(phi) * r);
      }
    });
    for (let level = 0; level + 1 < levels.length; level += 1) {
      const turn = (levels[level].turn + levels[level + 1].turn) / 2;
      for (let column = 0; column < columns; column += 1) {
        const a = level * columns + column;
        const b = level * columns + ((column + 1) % columns);
        const phi = (column + 0.5) * columnStep;
        // Hier bildet die mit der Hoehe mitdrehende Schar die Flaeche: ihre
        // Rillen laufen nach rechts oben.
        if (outline(phi - turn) <= outline(phi + turn)) indices.push(a, a + columns, b + columns, a, b + columns, b);
        else indices.push(a, a + columns, b, b, a + columns, b + columns);
      }
    }
    addCaps(positions, indices, 0, columns, (levels.length - 1) * columns, height);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  const flat = geometry.toNonIndexed();
  geometry.dispose();
  flat.computeVertexNormals();
  return flat;
}

/** Flache Enden: ein Faecher von der Achse zu jedem Ring, unten nach unten, oben nach oben. */
function addCaps(positions: number[], indices: number[], footStart: number, ringSize: number, topStart: number, height: number) {
  const foot = positions.length / 3;
  positions.push(0, 0, 0);
  const top = foot + 1;
  positions.push(0, height, 0);
  for (let i = 0; i < ringSize; i += 1) {
    const j = (i + 1) % ringSize;
    indices.push(foot, footStart + i, footStart + j);
    indices.push(top, topStart + j, topStart + i);
  }
}
