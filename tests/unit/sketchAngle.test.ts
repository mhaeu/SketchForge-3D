import { describe, expect, it } from "vitest";
import { cornerAngleDegrees, incomingCornerPoint, sketchPreviewAngle } from "@/lib/sketchAngle";
import type { SketchProfile } from "@/types/sketchforge";

function profile(): SketchProfile {
  return {
    points: [
      { id: "a", x: 0, z: 0, mode: "corner" },
      { id: "b", x: 20, z: 0, mode: "corner" },
    ],
    segments: [{ id: "s1", startId: "a", endId: "b", kind: "line" }],
  } as SketchProfile;
}

/**
 * Beim Zeichnen steht der Winkel zur zuletzt gezogenen Kante neben der Ecke.
 * Ohne ihn musste man eine Ecke erst setzen und dann nachmessen, und wenn sie
 * nicht stimmte, wieder von vorn anfangen.
 */
describe("der Winkel beim Zeichnen", () => {
  it("misst die Ecke zwischen den beiden Schenkeln", () => {
    // Rechter Winkel: hin nach rechts, weiter nach oben.
    expect(cornerAngleDegrees({ x: -10, z: 0 }, { x: 0, z: 0 }, { x: 0, z: 10 })).toBeCloseTo(90, 6);
    // Gestreckt weiter: 180 Grad.
    expect(cornerAngleDegrees({ x: -10, z: 0 }, { x: 0, z: 0 }, { x: 10, z: 0 })).toBeCloseTo(180, 6);
    // Kehrtwende: 0 Grad.
    expect(cornerAngleDegrees({ x: -10, z: 0 }, { x: 0, z: 0 }, { x: -5, z: 0 })).toBeCloseTo(0, 6);
  });

  it("nennt keinen Winkel, wo keiner ist", () => {
    expect(cornerAngleDegrees({ x: 0, z: 0 }, { x: 0, z: 0 }, { x: 10, z: 0 })).toBeNull();
  });

  it("findet die Kante, die an der Ecke ankommt", () => {
    expect(incomingCornerPoint(profile(), "b")).toEqual({ x: 0, z: 0 });
    // Ein Punkt ohne Kante hat nichts, womit sich vergleichen liesse.
    const lonely = { points: [{ id: "a", x: 0, z: 0 }], segments: [] } as unknown as SketchProfile;
    expect(incomingCornerPoint(lonely, "a")).toBeNull();
  });

  it("nimmt bei einem Bogen seinen Griff statt des Nachbarpunkts", () => {
    const curved = {
      points: [
        { id: "a", x: 0, z: 0, mode: "smooth" },
        { id: "b", x: 20, z: 0, mode: "smooth", handleIn: { x: 20, z: -10 } },
      ],
      segments: [{ id: "s1", startId: "a", endId: "b", kind: "bezier" }],
    } as unknown as SketchProfile;
    // Die Kurve laeuft von oben in die Ecke, nicht waagerecht von links.
    expect(incomingCornerPoint(curved, "b")).toEqual({ x: 20, z: -10 });
  });

  it("gibt beim Ziehen den Winkel samt Bogen", () => {
    // Von a nach b nach rechts, die neue Linie geht nach unten weg.
    const angle = sketchPreviewAngle(profile(), "b", { x: 20, z: 30 })!;
    expect(angle.degrees).toBeCloseTo(90, 6);
    expect(angle.vertex).toEqual({ x: 20, z: 0 });
    // Der erste Schenkel zeigt zurueck zur vorigen Ecke, der zweite zum Zeiger.
    expect(angle.from.x).toBeCloseTo(-1, 6);
    expect(angle.to.z).toBeCloseTo(1, 6);
    // Die Beschriftung steht zwischen beiden.
    expect(angle.bisector.x).toBeLessThan(0);
    expect(angle.bisector.z).toBeGreaterThan(0);
  });

  it("stellt die Beschriftung auch beim gestreckten Durchgang irgendwohin", () => {
    // Hier heben sich die Schenkel auf - eine Summe von null ist keine
    // Richtung, also muss eine andere her.
    const angle = sketchPreviewAngle(profile(), "b", { x: 40, z: 0 })!;
    expect(angle.degrees).toBeCloseTo(180, 6);
    expect(Math.hypot(angle.bisector.x, angle.bisector.z)).toBeCloseTo(1, 6);
  });

  it("schweigt, solange nur ein Punkt steht", () => {
    const first = { points: [{ id: "a", x: 0, z: 0 }], segments: [] } as unknown as SketchProfile;
    expect(sketchPreviewAngle(first, "a", { x: 10, z: 10 })).toBeNull();
  });
});
