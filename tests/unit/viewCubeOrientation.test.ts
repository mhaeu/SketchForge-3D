import { describe, expect, it } from "vitest";
import {
  viewFaceOrientation,
  workplaneCameraOrientation,
  worldCameraOrientation,
} from "@/lib/viewCubeOrientation";
import { horizontalPlacementWorkplane, placementWorkplaneFromSurface } from "@/lib/placementWorkplane";

/**
 * Der Wuerfel oben links zeigt, wie man gerade auf den Entwurf schaut. Bis
 * hierher rechnete er immer gegen die Hauptarbeitsebene - stand die
 * Arbeitsebene auf einer gekippten Flaeche, zeigte er etwas anderes als das,
 * woran gearbeitet wurde.
 */
describe("der Lagewuerfel in der aktuellen Arbeitsebene", () => {
  const base = horizontalPlacementWorkplane();
  // Eine Flaeche, die senkrecht steht: ihre Normale zeigt nach vorn.
  const upright = placementWorkplaneFromSurface({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, { x: 1, y: 0, z: 0 });

  it("laesst die Hauptebene, wie sie war", () => {
    const offset = { x: 30, y: 40, z: 50 };
    expect(workplaneCameraOrientation(offset, base)).toEqual(worldCameraOrientation(offset));
  });

  it("nennt den Blick laengs der Normalen eine Draufsicht", () => {
    // Auf der Hauptebene: die Kamera steht senkrecht darueber. (Der
    // Kleinstwert, mit dem der waagerechte Abstand gegen null abgesichert
    // ist, kostet das letzte Tausendstel Grad.)
    expect(workplaneCameraOrientation({ x: 0, y: 100, z: 0 }, base).pitchDegrees).toBeCloseTo(90, 2);
    // Auf der stehenden Flaeche: dieselbe Draufsicht ist der Blick von vorn.
    expect(workplaneCameraOrientation({ x: 0, y: 0, z: 100 }, upright).pitchDegrees).toBeCloseTo(90, 2);
    // Und von oben schaut man auf diese Flaeche jetzt seitlich.
    expect(Math.abs(workplaneCameraOrientation({ x: 0, y: 100, z: 0 }, upright).pitchDegrees)).toBeLessThan(1);
  });

  it("stellt die Kamera fuer eine Seite senkrecht auf die Ebene", () => {
    const top = viewFaceOrientation("top", upright);
    expect(top.direction.x).toBeCloseTo(0, 6);
    expect(top.direction.y).toBeCloseTo(0, 6);
    expect(top.direction.z).toBeCloseTo(1, 6);
    // Und das Bild steht nicht schief: oben ist die Normale der Ebene.
    expect(top.up.z).toBeCloseTo(1, 6);
  });

  it("bleibt auf der Hauptebene bei den Weltachsen", () => {
    const top = viewFaceOrientation("top", base);
    expect([top.direction.x, top.direction.y, top.direction.z]).toEqual([0, 1, 0]);
    const right = viewFaceOrientation("right", base);
    expect([right.direction.x, right.direction.y, right.direction.z]).toEqual([1, 0, 0]);
    expect([top.up.x, top.up.y, top.up.z]).toEqual([0, 1, 0]);
  });
});
