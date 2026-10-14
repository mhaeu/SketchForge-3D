import { describe, expect, it } from "vitest";
import {
  croppedSketchImagePatch,
  normalizeSketchImageCrop,
  normalizeSketchImageRotation,
  sketchImageFullFrame,
  uncroppedSketchImagePatch,
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

/**
 * Beschneiden: Die Rahmengriffe schneiden das Bild zu, statt es zu
 * skalieren. Die Zusage, auf die es ankommt: Das ganze Bild bleibt, wo es
 * ist, mit seinem Massstab - ein kalibriertes Foto bleibt kalibriert -, und
 * das Weggeschnittene kommt unveraendert zurueck.
 */
describe("Das Bild beschneiden", () => {
  const photo = { x: 0, z: 0, width: 40, depth: 20 };

  it("schneidet an einer Kante zu und laesst den Massstab", () => {
    // Die rechte Kante auf die Mitte ziehen.
    const patch = croppedSketchImagePatch(photo, "e", { x: 0, z: 0 });
    expect(patch.width).toBeCloseTo(20, 9);
    expect(patch.depth).toBeCloseTo(20, 9);
    expect(patch.x).toBeCloseTo(-10, 9);
    expect(patch.crop).toEqual({ left: 0, top: 0, right: 0.5, bottom: 0 });
    // Das ganze Bild steht noch am selben Ort, gleich gross.
    const full = sketchImageFullFrame({ ...photo, ...patch });
    expect(full.x).toBeCloseTo(0, 9);
    expect(full.width).toBeCloseTo(40, 9);
  });

  it("bringt das Weggeschnittene unveraendert zurueck", () => {
    const cropped = { ...photo, ...croppedSketchImagePatch(photo, "nw", { x: -10, z: -5 }) };
    expect(cropped.crop).toEqual({ left: 0.25, top: 0.25, right: 0, bottom: 0 });
    const restored = { ...cropped, ...uncroppedSketchImagePatch(cropped) };
    expect(restored.x).toBeCloseTo(0, 9);
    expect(restored.z).toBeCloseTo(0, 9);
    expect(restored.width).toBeCloseTo(40, 9);
    expect(restored.depth).toBeCloseTo(20, 9);
    expect(restored.crop).toBeUndefined();
  });

  /**
   * Ein gedrehtes Bild wird in seinem eigenen Rahmen beschnitten: Das ganze
   * Bild bleibt dabei stehen, auch wenn der sichtbare Ausschnitt seine Mitte
   * verschiebt - und Zuruecknehmen trifft es wieder genau.
   */
  it("beschneidet ein gedrehtes Bild in seinem eigenen Rahmen", () => {
    const turned = { ...photo, x: 7, z: -3, rotation: 30 };
    const [, , cornerC] = sketchImageCorners(turned);
    // Die rechte untere Ecke halb zur Mitte ziehen.
    const pull = { x: (cornerC.x + turned.x) / 2, z: (cornerC.z + turned.z) / 2 };
    const cropped = { ...turned, ...croppedSketchImagePatch(turned, "se", pull) };
    expect(cropped.crop!.right).toBeCloseTo(0.25, 9);
    expect(cropped.crop!.bottom).toBeCloseTo(0.25, 9);
    const full = sketchImageFullFrame(cropped);
    expect(full.x).toBeCloseTo(7, 9);
    expect(full.z).toBeCloseTo(-3, 9);
    expect(full.width).toBeCloseTo(40, 9);
    const restored = { ...cropped, ...uncroppedSketchImagePatch(cropped) };
    expect(restored.x).toBeCloseTo(7, 9);
    expect(restored.z).toBeCloseTo(-3, 9);
  });

  it("kommt nicht ueber das ganze Bild hinaus und nicht ueber die Gegenkante", () => {
    // Weit nach aussen gezogen: bleibt beim ganzen Bild.
    expect(croppedSketchImagePatch(photo, "e", { x: 500, z: 0 }).crop).toBeUndefined();
    // Ueber die linke Kante hinaus: ein Rest bleibt stehen.
    const squeezed = croppedSketchImagePatch(photo, "e", { x: -500, z: 0 });
    expect(squeezed.width).toBeGreaterThan(0);
    expect(squeezed.crop!.right).toBeCloseTo(0.98, 9);
  });

  it("haelt den gespeicherten Beschnitt in seinen Grenzen", () => {
    expect(normalizeSketchImageCrop(undefined)).toBeUndefined();
    expect(normalizeSketchImageCrop({ left: 0, top: 0, right: 0, bottom: 0 })).toBeUndefined();
    expect(normalizeSketchImageCrop({ left: 0.1, top: 0.2, right: 0.3, bottom: 0 })).toEqual({ left: 0.1, top: 0.2, right: 0.3, bottom: 0 });
    // Nichts mehr sichtbar: verworfen.
    expect(normalizeSketchImageCrop({ left: 0.6, top: 0, right: 0.6, bottom: 0 })).toBeUndefined();
  });
});
