import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  PATTERN_MAX_COUNT,
  PATTERN_MIN_COUNT,
  circleStepDegrees,
  clampPatternCount,
  defaultPatternSettings,
  patternPlacement,
  rowOffset,
  turnedAroundUp,
  type PatternSettings,
} from "@/lib/shapePattern";

describe("Die Stueckzahl eines Musters", () => {
  it("bleibt zwischen zwei und hundert", () => {
    expect(clampPatternCount(1)).toBe(PATTERN_MIN_COUNT);
    expect(clampPatternCount(0)).toBe(PATTERN_MIN_COUNT);
    expect(clampPatternCount(-5)).toBe(PATTERN_MIN_COUNT);
    expect(clampPatternCount(1000)).toBe(PATTERN_MAX_COUNT);
    expect(clampPatternCount(7.4)).toBe(7);
    expect(clampPatternCount(Number.NaN)).toBe(PATTERN_MIN_COUNT);
  });
});

describe("Die Reihe", () => {
  it("versetzt entlang der gewaehlten Achse, in unseren Achsen", () => {
    /*
     * X nach rechts, Y nach oben, Z nach hinten - wie im Eigenschaftsfeld.
     * Bei Layerling ist Z die Hoehe und Y negiert; wer das uebernimmt, schickt
     * die Reihe in die falsche Richtung.
     */
    expect(rowOffset({ spacing: 10, axis: "x" }, 3)).toEqual({ dx: 30, dy: 0, dz: 0 });
    expect(rowOffset({ spacing: 10, axis: "y" }, 3)).toEqual({ dx: 0, dy: 30, dz: 0 });
    expect(rowOffset({ spacing: 10, axis: "z" }, 3)).toEqual({ dx: 0, dy: 0, dz: 30 });
  });

  it("laeuft bei negativem Abstand nach der anderen Seite", () => {
    expect(rowOffset({ spacing: -12, axis: "x" }, 2)).toEqual({ dx: -24, dy: 0, dz: 0 });
  });

  it("laesst das Original stehen, wo es steht", () => {
    expect(rowOffset({ spacing: 10, axis: "x" }, 0)).toEqual({ dx: 0, dy: 0, dz: 0 });
  });
});

describe("Der Kreis", () => {
  it("teilt den vollen Kreis unter allen Stuecken auf", () => {
    // Vier Stuecke im Vollkreis stehen 90 Grad auseinander - die vierte Kopie
    // darf nicht auf dem Original landen.
    expect(circleStepDegrees(4, 360)).toBeCloseTo(90, 9);
    expect(circleStepDegrees(6, 360)).toBeCloseTo(60, 9);
  });

  it("setzt bei einem Bogen das erste und letzte Stueck auf seine Enden", () => {
    // Vier Stuecke ueber 90 Grad: drei Luecken von 30 Grad.
    expect(circleStepDegrees(4, 90)).toBeCloseTo(30, 9);
    expect(circleStepDegrees(2, 180)).toBeCloseTo(180, 9);
  });

  it("dreht bei negativem Winkel herum", () => {
    expect(circleStepDegrees(4, -360)).toBeCloseTo(-90, 9);
    expect(circleStepDegrees(4, -90)).toBeCloseTo(-30, 9);
  });

  it("behandelt mehr als eine ganze Umdrehung wie den Vollkreis", () => {
    expect(circleStepDegrees(4, 720)).toBeCloseTo(90, 9);
  });
});

describe("Das Drehen um die senkrechte Achse", () => {
  it("dreht genauso, wie der Drehwinkel eines Koerpers es tut", () => {
    /*
     * Das ist die tragende Eigenschaft: Eine mitgedrehte Kopie bekommt
     * `rotation + Winkel`, und ihre Stelle muss sich um genau dieselbe Drehung
     * bewegen. Sonst stimmen Lage und Ausrichtung nicht zusammen.
     */
    const centre = { x: 5, z: -3 };
    const point = { x: 25, z: 7 };
    for (const degrees of [0, 30, 90, -45, 180, 270]) {
      const own = turnedAroundUp(point, centre, degrees);
      const byQuaternion = new THREE.Vector3(point.x - centre.x, 0, point.z - centre.z)
        .applyQuaternion(new THREE.Quaternion().setFromEuler(
          new THREE.Euler(0, THREE.MathUtils.degToRad(degrees), 0, "XYZ"),
        ));
      expect(own.x).toBeCloseTo(centre.x + byQuaternion.x, 9);
      expect(own.z).toBeCloseTo(centre.z + byQuaternion.z, 9);
    }
  });

  it("laesst die Mitte selbst liegen und haelt den Abstand", () => {
    const centre = { x: 2, z: 4 };
    expect(turnedAroundUp(centre, centre, 57).x).toBeCloseTo(2, 9);
    expect(turnedAroundUp(centre, centre, 57).z).toBeCloseTo(4, 9);
    const moved = turnedAroundUp({ x: 12, z: 4 }, centre, 33);
    expect(Math.hypot(moved.x - centre.x, moved.z - centre.z)).toBeCloseTo(10, 9);
  });

  it("kommt nach einer ganzen Umdrehung wieder an", () => {
    const back = turnedAroundUp({ x: 9, z: -2 }, { x: 1, z: 1 }, 360);
    expect(back.x).toBeCloseTo(9, 9);
    expect(back.z).toBeCloseTo(-2, 9);
  });
});

describe("Die Vorgabe", () => {
  it("steht auf einer brauchbaren Reihe", () => {
    const settings = defaultPatternSettings();
    expect(settings.mode).toBe("row");
    expect(clampPatternCount(settings.count)).toBe(settings.count);
    expect(settings.spacing).toBeGreaterThan(0);
  });
});

describe("Wo ein Stueck des Musters steht", () => {
  const at = { x: 40, z: 0, elevation: 5 };
  const row: PatternSettings = { ...defaultPatternSettings(), mode: "row", count: 4, spacing: 12, axis: "z" };
  const circle: PatternSettings = {
    mode: "circle", count: 4, spacing: 0, axis: "x", angle: 360, centreX: 0, centreZ: 0, turnCopies: true,
  };

  it("laesst das Original genau dort, wo es steht", () => {
    expect(patternPlacement(row, 0, at)).toEqual({ x: 40, z: 0, elevation: 5, turn: 0 });
    expect(patternPlacement(circle, 0, at)).toEqual({ x: 40, z: 0, elevation: 5, turn: 0 });
  });

  it("schiebt die Reihe entlang ihrer Achse und dreht dabei nichts", () => {
    expect(patternPlacement(row, 2, at)).toEqual({ x: 40, z: 24, elevation: 5, turn: 0 });
    expect(patternPlacement({ ...row, axis: "y" }, 2, at)).toEqual({ x: 40, z: 0, elevation: 29, turn: 0 });
  });

  it("setzt den Kreis auf seinen Radius und dreht die Kopien mit", () => {
    // Vier Stuecke im Vollkreis um den Nullpunkt: das zweite steht nach einer
    // Vierteldrehung, sein Abstand zur Mitte bleibt 40.
    const second = patternPlacement(circle, 1, at);
    expect(Math.hypot(second.x - circle.centreX, second.z - circle.centreZ)).toBeCloseTo(40, 9);
    expect(second.turn).toBeCloseTo(90, 9);
    // Die Hoehe bleibt: ein Kreis dreht um die senkrechte Achse.
    expect(second.elevation).toBe(5);
    // Nach vier Vierteln ist das letzte Stueck bei 270 Grad, nicht bei 360.
    expect(patternPlacement(circle, 3, at).turn).toBeCloseTo(270, 9);
  });

  it("laesst die Kopien stehen, wenn sie nicht mitdrehen sollen", () => {
    const kept = patternPlacement({ ...circle, turnCopies: false }, 1, at);
    expect(kept.turn).toBe(0);
    // Die Stelle wandert trotzdem auf den Kreis.
    expect(Math.hypot(kept.x, kept.z)).toBeCloseTo(40, 9);
    expect(kept.x).not.toBeCloseTo(40, 3);
  });

  it("haelt sich an die begrenzte Stueckzahl", () => {
    // Eine unsinnige Zahl darf den Winkel nicht ins Nichts laufen lassen.
    const wild = patternPlacement({ ...circle, count: 1 }, 1, at);
    expect(Number.isFinite(wild.turn)).toBe(true);
    expect(wild.turn).toBeCloseTo(180, 9);
  });
});
