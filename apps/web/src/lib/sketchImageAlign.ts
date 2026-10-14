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
