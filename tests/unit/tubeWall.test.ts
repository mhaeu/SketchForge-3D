import { describe, expect, it } from "vitest";
import { maxTubeInnerDiameter, TUBE_MIN_WALL, tubeInnerDiameter, tubeWallForInnerDiameter } from "@/lib/tubeWall";

describe("Der Innendurchmesser von Rohr und Ring", () => {
  it("ist die Breite weniger zweimal die Wand", () => {
    expect(tubeInnerDiameter(4, 20, 20)).toBe(12);
    expect(tubeInnerDiameter(2.5, 30, 30)).toBe(25);
  });

  /** Eine Buchse fuer eine Welle von 8 mm in einem Rohr von 20 mm: Wand 6. */
  it("setzt die Wand aus dem Innendurchmesser", () => {
    expect(tubeWallForInnerDiameter(8, 20, 20)).toBe(6);
    expect(tubeInnerDiameter(tubeWallForInnerDiameter(8, 20, 20)!, 20, 20)).toBe(8);
  });

  it("laesst immer eine Wand und immer eine Oeffnung", () => {
    // Groesser als aussen: die duennste Wand.
    expect(tubeWallForInnerDiameter(25, 20, 20)).toBe(TUBE_MIN_WALL);
    expect(maxTubeInnerDiameter(20)).toBe(19);
    // Null: so dick, dass innen 0,1 mm Halbmesser bleiben.
    expect(tubeWallForInnerDiameter(0, 20, 20)).toBeCloseTo(9.9, 12);
    expect(tubeWallForInnerDiameter(Number.NaN, 20, 20)).toBeNull();
  });

  /** Zeigt, was das Netz baut - auch wenn die gespeicherte Wand zu dick ist. */
  it("zeigt den Durchmesser, den der Koerper wirklich hat", () => {
    // Wand 20 in einem Rohr von 20 mm: Das Netz kappt auf 9,9.
    expect(tubeInnerDiameter(20, 20, 20)).toBeCloseTo(0.2, 12);
  });

  it("misst ein gestrecktes Rohr ueber die Breite und kappt an der schmaleren Seite", () => {
    expect(tubeInnerDiameter(3, 30, 20)).toBe(24);
    // Die Tiefe von 20 laesst hoechstens eine Wand von 9,9.
    expect(tubeWallForInnerDiameter(0, 30, 20)).toBeCloseTo(9.9, 12);
    // Die duennste Wand haengt nicht an der Tiefe.
    expect(maxTubeInnerDiameter(30)).toBe(29);
    expect(tubeInnerDiameter(TUBE_MIN_WALL, 30, 20)).toBe(29);
  });
});
