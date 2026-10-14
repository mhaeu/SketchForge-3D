import { describe, expect, it } from "vitest";
import {
  normalizeSketchImageRotation,
  rotateSketchPoint,
  sketchImageCalibrationPatch,
  sketchImageCentredPatch,
  sketchImageCorners,
} from "@/lib/sketchImageAlign";

/**
 * Ein Referenzbild ausrichten.
 *
 * Gemessen wird, was das Kalibrieren verspricht: Danach haben die beiden
 * angeklickten Punkte genau den eingetippten Abstand, der erste steht noch,
 * wo er stand - und das gilt auch fuer ein gedrehtes Bild.
 */

const image = { x: 10, z: 5, width: 40, depth: 30 };

describe("Die Drehung eines Bildes", () => {
  it("bleibt in -180..180, auf ein Zehntelgrad", () => {
    expect(normalizeSketchImageRotation(0)).toBe(0);
    expect(normalizeSketchImageRotation(370)).toBe(10);
    expect(normalizeSketchImageRotation(-190)).toBe(170);
    expect(normalizeSketchImageRotation(12.345)).toBe(12.3);
    expect(normalizeSketchImageRotation(Number.NaN)).toBe(0);
    expect(normalizeSketchImageRotation(undefined)).toBe(0);
  });

  /**
   * Positiv im Uhrzeigersinn auf dem Bildschirm, wie SVG und die
   * Bezugskoerper: Die Skizze zeichnet z nach unten, also wandert ein Punkt
   * rechts der Mitte bei +90 Grad nach unten.
   */
  it("dreht im Sinn von SVG", () => {
    const turned = rotateSketchPoint({ x: 10, z: 0 }, { x: 0, z: 0 }, 90);
    expect(turned.x).toBeCloseTo(0, 9);
    expect(turned.z).toBeCloseTo(10, 9);
  });

  it("legt die Ecken eines gedrehten Bildes um seine Mitte", () => {
    const corners = sketchImageCorners({ ...image, rotation: 90 });
    // Um 90 Grad gedreht tauschen Breite und Tiefe die Richtung.
    const xs = corners.map((corner) => corner.x);
    const zs = corners.map((corner) => corner.z);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(30, 9);
    expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(40, 9);
    // Die Mitte bleibt.
    expect(xs.reduce((sum, x) => sum + x, 0) / 4).toBeCloseTo(10, 9);
    expect(zs.reduce((sum, z) => sum + z, 0) / 4).toBeCloseTo(5, 9);
  });
});

describe("Das Bild mittig setzen", () => {
  it("setzt die Mitte auf die gewuenschte Achse und laesst die andere", () => {
    expect(sketchImageCentredPatch("x")).toEqual({ x: 0 });
    expect(sketchImageCentredPatch("z")).toEqual({ z: 0 });
  });
});

describe("Das Bild kalibrieren", () => {
  const distance = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(b.x - a.x, b.z - a.z);

  /**
   * Zwei Punkte im Bild, gemessen 12,5 mm auseinander, in Wahrheit 50 mm:
   * Das Bild wird viermal so gross, und danach liegen dieselben beiden
   * Bildstellen genau 50 mm auseinander. Der erste Punkt steht dabei still.
   */
  it("gibt zwei Punkten den bekannten Abstand und laesst den ersten stehen", () => {
    const first = { x: 0, z: 0 };
    const second = { x: 7.5, z: 10 };
    expect(distance(first, second)).toBeCloseTo(12.5, 9);
    const patch = sketchImageCalibrationPatch(image, first, second, 50)!;
    expect(patch.width).toBeCloseTo(160, 9);
    expect(patch.depth).toBeCloseTo(120, 9);

    // Dieselben Bildstellen nach dem Skalieren: relativ zur Bildmitte um den
    // Faktor gewachsen.
    const scale = patch.width! / image.width;
    const follow = (point: { x: number; z: number }) => ({
      x: patch.x! + (point.x - image.x) * scale,
      z: patch.z! + (point.z - image.z) * scale,
    });
    expect(follow(first).x).toBeCloseTo(first.x, 9);
    expect(follow(first).z).toBeCloseTo(first.z, 9);
    expect(distance(follow(first), follow(second))).toBeCloseTo(50, 9);
  });

  /**
   * Und dasselbe fuer ein gedrehtes Bild: Ein gleichmaessiges Skalieren um
   * einen Punkt vertauscht sich mit einer Drehung um die Bildmitte, also gilt
   * dieselbe Rechnung. Gemessen an den gedrehten Ecken vorher und nachher.
   */
  it("gilt genauso fuer ein gedrehtes Bild", () => {
    const rotated = { ...image, rotation: 33 };
    const [cornerA, cornerB] = sketchImageCorners(rotated);
    const patch = sketchImageCalibrationPatch(rotated, cornerA, cornerB, 100)!;
    const after = sketchImageCorners({ ...rotated, ...patch });
    // Die angeklickte Ecke steht noch, und die beiden Ecken liegen 100 mm auseinander.
    expect(after[0].x).toBeCloseTo(cornerA.x, 9);
    expect(after[0].z).toBeCloseTo(cornerA.z, 9);
    expect(distance(after[0], after[1])).toBeCloseTo(100, 9);
  });

  it("lehnt zusammenfallende Punkte und einen unbrauchbaren Abstand ab", () => {
    expect(sketchImageCalibrationPatch(image, { x: 1, z: 1 }, { x: 1, z: 1 }, 50)).toBeNull();
    expect(sketchImageCalibrationPatch(image, { x: 0, z: 0 }, { x: 5, z: 0 }, 0)).toBeNull();
    expect(sketchImageCalibrationPatch(image, { x: 0, z: 0 }, { x: 5, z: 0 }, Number.NaN)).toBeNull();
  });
});
