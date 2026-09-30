import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { dropTogetherTranslation, layFlatAngleDegrees, layFlatRotation } from "@/lib/layFlat";
import { horizontalPlacementWorkplane, placementWorkplaneFromSurface, type PlacementPoint } from "@/lib/placementWorkplane";

const BASE = horizontalPlacementWorkplane();

function turned(normal: PlacementPoint, workplane = BASE) {
  const rotation = layFlatRotation(normal, workplane)!;
  return new THREE.Vector3(normal.x, normal.y, normal.z).normalize().applyQuaternion(rotation);
}

describe("Auf eine Flaeche legen", () => {
  it("dreht die gezeigte Flaeche nach unten", () => {
    // Eine Flaeche, die nach vorn oben zeigt: danach zeigt sie nach unten.
    const after = turned({ x: 0.3, y: 0.8, z: -0.5 });
    expect(after.x).toBeCloseTo(0, 6);
    expect(after.y).toBeCloseTo(-1, 6);
    expect(after.z).toBeCloseTo(0, 6);
  });

  it("laesst eine Flaeche, die schon unten liegt, in Ruhe", () => {
    const rotation = layFlatRotation({ x: 0, y: -1, z: 0 }, BASE)!;
    expect(layFlatAngleDegrees(rotation)).toBeCloseTo(0, 6);
  });

  /**
   * Der unangenehme Fall: Die Flaeche zeigt genau nach oben, es gibt also
   * unendlich viele Achsen, um die man den Koerper umschlagen kann. Eine davon
   * muss herauskommen, und die Flaeche muss danach unten liegen.
   */
  it("schlaegt eine Flaeche um, die genau nach oben zeigt", () => {
    const after = turned({ x: 0, y: 1, z: 0 });
    expect(after.y).toBeCloseTo(-1, 6);
    expect(layFlatAngleDegrees(layFlatRotation({ x: 0, y: 1, z: 0 }, BASE)!)).toBeCloseTo(180, 4);
  });

  it("richtet sich nach der Arbeitsebene, die gerade gilt", () => {
    // Eine Ebene, deren Normale nach +x zeigt: "unten" ist dann -x.
    const wall = placementWorkplaneFromSurface({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
    const after = turned({ x: 0, y: 1, z: 0 }, wall);
    expect(after.x).toBeCloseTo(-1, 6);
    expect(after.y).toBeCloseTo(0, 6);
  });

  it("sagt ab, wenn eine der Richtungen keine ist", () => {
    expect(layFlatRotation({ x: 0, y: 0, z: 0 }, BASE)).toBeNull();
  });

  it("nennt den Winkel, um den gedreht wird", () => {
    const rotation = layFlatRotation({ x: 1, y: 0, z: 0 }, BASE)!;
    expect(layFlatAngleDegrees(rotation)).toBeCloseTo(90, 4);
  });
});

describe("Gemeinsam absetzen", () => {
  it("nimmt den tiefsten Punkt von allen", () => {
    const translation = dropTogetherTranslation(BASE, [
      { x: 0, y: 12, z: 0 },
      { x: 5, y: 4, z: 1 },
      { x: -5, y: 30, z: 2 },
    ]);
    expect(translation).toEqual({ x: 0, y: -4, z: 0 });
  });

  /**
   * Der Sinn der ganzen Funktion: Je Koerper abzusetzen wuerde eine Baugruppe
   * zusammenschieben - jeder Teil landete mit seiner eigenen Unterseite auf
   * der Platte, und die Lage zueinander waere verloren.
   */
  it("gibt eine Verschiebung fuer alle und nicht eine je Koerper", () => {
    const low = [{ x: 0, y: 3, z: 0 }];
    const high = [{ x: 0, y: 20, z: 0 }];
    const together = dropTogetherTranslation(BASE, [...low, ...high]);
    expect(together.y).toBeCloseTo(-3, 6);
    expect(dropTogetherTranslation(BASE, high).y).toBeCloseTo(-20, 6);
  });

  it("setzt auf die Ebene ab, die gerade gilt", () => {
    const wall = placementWorkplaneFromSurface({ x: 10, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
    const translation = dropTogetherTranslation(wall, [{ x: 18, y: 0, z: 0 }, { x: 14, y: 5, z: 0 }]);
    expect(translation.x).toBeCloseTo(-4, 6);
  });

  it("verschiebt nichts, wenn es nichts zu messen gibt", () => {
    expect(dropTogetherTranslation(BASE, [])).toEqual({ x: 0, y: 0, z: 0 });
  });
});
