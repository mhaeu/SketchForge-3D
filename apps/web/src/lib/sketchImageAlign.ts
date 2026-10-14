import type { SketchImage } from "@/types/sketchforge";

/**
 * sketchImageAlign.ts
 *
 * Ein Referenzbild unter der Skizze ausrichten: drehen, mittig setzen und
 * kalibrieren.
 *
 * Ein Foto liess sich bisher nur verschieben und skalieren. Damit ist es eine
 * Vorlage zum Nachzeichnen, aber kein Mass: Ein schraeg fotografiertes Teil
 * steht schraeg zur Drehachse, und wie gross es wirklich ist, weiss niemand.
 * Kalibrieren loest das zweite - zwei Punkte im Bild, deren Abstand man kennt,
 * und das Bild hat danach den richtigen Massstab. Wie in Fusion.
 *
 * Gedreht wird um die Mitte des Bildes, im Sinn von SVG: positiv heisst im
 * Uhrzeigersinn auf dem Bildschirm, wie bei den Bezugskoerpern der Skizze.
 *
 * Nach Layerling 1.61.0 (#216).
 */

export type SketchImagePoint = { x: number; z: number };

/** Grad, auf eine Nachkommastelle, in -180..180. */
export function normalizeSketchImageRotation(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  let degrees = ((value % 360) + 360) % 360;
  if (degrees > 180) degrees -= 360;
  const rounded = Math.round(degrees * 10) / 10;
  return rounded === 0 ? 0 : rounded;
}

/** Ein Punkt, um eine Mitte gedreht. */
export function rotateSketchPoint(point: SketchImagePoint, centre: SketchImagePoint, degrees: number): SketchImagePoint {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = point.x - centre.x;
  const dz = point.z - centre.z;
  return { x: centre.x + dx * cos - dz * sin, z: centre.z + dx * sin + dz * cos };
}

/** Die vier Ecken des Bildes, so wie es gedreht auf der Skizze liegt. */
export function sketchImageCorners(image: Pick<SketchImage, "x" | "z" | "width" | "depth" | "rotation">): SketchImagePoint[] {
  const centre = { x: image.x, z: image.z };
  const halfWidth = image.width / 2;
  const halfDepth = image.depth / 2;
  return [
    { x: image.x - halfWidth, z: image.z - halfDepth },
    { x: image.x + halfWidth, z: image.z - halfDepth },
    { x: image.x + halfWidth, z: image.z + halfDepth },
    { x: image.x - halfWidth, z: image.z + halfDepth },
  ].map((corner) => rotateSketchPoint(corner, centre, image.rotation ?? 0));
}

/**
 * Das Bild mittig auf eine Achse setzen.
 *
 * X = 0 ist bei einem Drehteil die Drehachse: Ein Flaschenprofil, das dort
 * mittig sitzt, laesst sich halb nachzeichnen und drehen.
 */
export function sketchImageCentredPatch(axis: "x" | "z"): Partial<SketchImage> {
  return axis === "x" ? { x: 0 } : { z: 0 };
}

/**
 * Das Bild so skalieren, dass zwei Punkte darin den bekannten Abstand haben.
 *
 * Skaliert wird gleichmaessig um den **ersten** Punkt: Er bleibt, wo er ist,
 * und der zweite rueckt so weit, bis der Abstand stimmt. Das ist der Punkt,
 * den man zuerst angeklickt hat und an dem man ausgerichtet hat - er soll
 * nicht wegwandern.
 *
 * Die Drehung stoert dabei nicht: Ein gleichmaessiges Skalieren um einen
 * Punkt vertauscht sich mit einer Drehung um die Bildmitte, also gilt
 * dieselbe Rechnung fuer ein gedrehtes Bild. Der Seitenverhaeltnis bleibt,
 * auch wenn es entsperrt war - kalibriert wird der Massstab, nicht die Form.
 *
 * `null`, wenn die beiden Punkte zusammenfallen oder der Abstand keiner ist.
 */
export function sketchImageCalibrationPatch(
  image: Pick<SketchImage, "x" | "z" | "width" | "depth">,
  first: SketchImagePoint,
  second: SketchImagePoint,
  realDistance: number,
): Partial<SketchImage> | null {
  const measured = Math.hypot(second.x - first.x, second.z - first.z);
  if (!(measured > 1e-9) || !(Number.isFinite(realDistance) && realDistance > 0)) return null;
  const scale = realDistance / measured;
  return {
    x: first.x + (image.x - first.x) * scale,
    z: first.z + (image.z - first.z) * scale,
    width: image.width * scale,
    depth: image.depth * scale,
  };
}

/**
 * Wie viel vom Bild an jeder Seite weggeschnitten ist, als Anteil der ganzen
 * Bildbreite bzw. -hoehe. Links und oben im Rahmen des Bildes, ungedreht.
 */
export type SketchImageCrop = { left: number; top: number; right: number; bottom: number };

const NO_CROP: SketchImageCrop = { left: 0, top: 0, right: 0, bottom: 0 };

/** Mindestens so viel bleibt sichtbar, als Anteil - sonst verschwaende das Bild. */
const MIN_VISIBLE_SHARE = 0.02;

export function normalizeSketchImageCrop(value: unknown): SketchImageCrop | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Partial<SketchImageCrop>;
  const part = (entry: unknown) => (typeof entry === "number" && Number.isFinite(entry) ? Math.min(1, Math.max(0, entry)) : 0);
  const crop = { left: part(raw.left), top: part(raw.top), right: part(raw.right), bottom: part(raw.bottom) };
  if (crop.left + crop.right > 1 - MIN_VISIBLE_SHARE || crop.top + crop.bottom > 1 - MIN_VISIBLE_SHARE) return undefined;
  return crop.left === 0 && crop.top === 0 && crop.right === 0 && crop.bottom === 0 ? undefined : crop;
}

/**
 * Das ganze Bild, so wie es ohne Beschnitt laege: Mitte (in der Skizze),
 * Breite und Tiefe. Der sichtbare Ausschnitt ist `image.x/z/width/depth`;
 * weggeschnitten ist nichts verloren, es steht nur nicht im Bild.
 */
export function sketchImageFullFrame(image: Pick<SketchImage, "x" | "z" | "width" | "depth" | "rotation" | "crop">) {
  const crop = image.crop ?? NO_CROP;
  const fullWidth = image.width / Math.max(MIN_VISIBLE_SHARE, 1 - crop.left - crop.right);
  const fullDepth = image.depth / Math.max(MIN_VISIBLE_SHARE, 1 - crop.top - crop.bottom);
  // Im Rahmen des Bildes: um wie viel die ganze Mitte neben der sichtbaren liegt.
  const offset = {
    x: image.x + ((crop.right - crop.left) * fullWidth) / 2,
    z: image.z + ((crop.bottom - crop.top) * fullDepth) / 2,
  };
  const centre = rotateSketchPoint(offset, { x: image.x, z: image.z }, image.rotation ?? 0);
  return { x: centre.x, z: centre.z, width: fullWidth, depth: fullDepth };
}

/**
 * An einem Griff beschneiden: Die Kante dieses Griffs wandert, das ganze Bild
 * bleibt, wo es ist, und mit ihm der Massstab.
 *
 * Gerechnet wird im Rahmen des Bildes - wie beim Skalieren eines gedrehten
 * Bildes. Eine Kante kann nicht ueber das ganze Bild hinaus und nicht naeher
 * als `MIN_VISIBLE_SHARE` an die gegenueberliegende.
 */
export function croppedSketchImagePatch(
  image: Pick<SketchImage, "x" | "z" | "width" | "depth" | "rotation" | "crop">,
  handle: string,
  point: SketchImagePoint,
): Partial<SketchImage> {
  const full = sketchImageFullFrame(image);
  const rotation = image.rotation ?? 0;
  // Der Zeiger im Rahmen des ganzen Bildes, ungedreht, Ursprung in seiner Mitte.
  const local = rotateSketchPoint(point, { x: full.x, z: full.z }, -rotation);
  const u = (local.x - full.x) / full.width + 0.5;
  const v = (local.z - full.z) / full.depth + 0.5;
  const crop = { ...(image.crop ?? NO_CROP) };
  if (handle.includes("w")) crop.left = Math.min(Math.max(0, u), 1 - crop.right - MIN_VISIBLE_SHARE);
  if (handle.includes("e")) crop.right = Math.min(Math.max(0, 1 - u), 1 - crop.left - MIN_VISIBLE_SHARE);
  if (handle.includes("n")) crop.top = Math.min(Math.max(0, v), 1 - crop.bottom - MIN_VISIBLE_SHARE);
  if (handle.includes("s")) crop.bottom = Math.min(Math.max(0, 1 - v), 1 - crop.top - MIN_VISIBLE_SHARE);
  return frameForCrop(full, rotation, crop);
}

/** Der sichtbare Ausschnitt zu einem ganzen Bild und seinem Beschnitt. */
function frameForCrop(full: { x: number; z: number; width: number; depth: number }, rotation: number, crop: SketchImageCrop): Partial<SketchImage> {
  const width = full.width * (1 - crop.left - crop.right);
  const depth = full.depth * (1 - crop.top - crop.bottom);
  const localCentre = {
    x: full.x + ((crop.left - crop.right) * full.width) / 2,
    z: full.z + ((crop.top - crop.bottom) * full.depth) / 2,
  };
  const centre = rotateSketchPoint(localCentre, { x: full.x, z: full.z }, rotation);
  return { x: centre.x, z: centre.z, width, depth, crop: normalizeSketchImageCrop(crop) };
}

/** Den Beschnitt aufheben: Das ganze Bild steht wieder da, am selben Ort. */
export function uncroppedSketchImagePatch(image: Pick<SketchImage, "x" | "z" | "width" | "depth" | "rotation" | "crop">): Partial<SketchImage> {
  const full = sketchImageFullFrame(image);
  return { x: full.x, z: full.z, width: full.width, depth: full.depth, crop: undefined };
}

/**
 * Wo das ganze Bild liegt, im **ungedrehten** Rahmen um die sichtbare Mitte -
 * so, wie es gezeichnet wird: Das Bild steht ungedreht da, ein Ausschnitt
 * schneidet es zu, und um die sichtbare Mitte wird das Ganze gedreht.
 */
export function sketchImageFullLocalFrame(image: Pick<SketchImage, "x" | "z" | "width" | "depth" | "crop">) {
  const crop = image.crop ?? NO_CROP;
  const width = image.width / Math.max(MIN_VISIBLE_SHARE, 1 - crop.left - crop.right);
  const depth = image.depth / Math.max(MIN_VISIBLE_SHARE, 1 - crop.top - crop.bottom);
  return {
    x: image.x + ((crop.right - crop.left) * width) / 2,
    z: image.z + ((crop.bottom - crop.top) * depth) / 2,
    width,
    depth,
  };
}
