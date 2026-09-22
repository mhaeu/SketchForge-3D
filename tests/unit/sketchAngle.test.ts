import { describe, expect, it } from "vitest";
import { cornerAngleDegrees, incomingCornerPoint, sketchPreviewAngle, sketchStraightCornerAngles } from "@/lib/sketchAngle";
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

/**
 * Die Winkel stehen auch dann da, wenn gerade nichts gezogen wird - sonst
 * muesste man eine fertige Skizze Ecke fuer Ecke nachmessen, um zu sehen, ob
 * sie stimmt.
 */
describe("die Winkel, die dauerhaft dastehen", () => {
  const square = {
    points: [
      { id: "a", x: 0, z: 0, mode: "corner" },
      { id: "b", x: 20, z: 0, mode: "corner" },
      { id: "c", x: 20, z: 20, mode: "corner" },
      { id: "d", x: 0, z: 20, mode: "corner" },
    ],
    segments: [
      { id: "s1", startId: "a", endId: "b", kind: "line" },
      { id: "s2", startId: "b", endId: "c", kind: "line" },
      { id: "s3", startId: "c", endId: "d", kind: "line" },
      { id: "s4", startId: "d", endId: "a", kind: "line" },
    ],
  } as unknown as SketchProfile;

  it("nennt jede Ecke eines Rechtecks mit 90 Grad", () => {
    const corners = sketchStraightCornerAngles(square);
    expect(corners.map((corner) => corner.pointId).sort()).toEqual(["a", "b", "c", "d"]);
    corners.forEach((corner) => expect(corner.degrees).toBeCloseTo(90, 6));
  });

  it("laesst das offene Ende eines Zuges aus", () => {
    const open = {
      points: square.points.slice(0, 3),
      segments: square.segments.slice(0, 2),
    } as unknown as SketchProfile;
    // Nur die mittlere Ecke hat zwei Kanten; die beiden Enden haben je eine.
    expect(sketchStraightCornerAngles(open).map((corner) => corner.pointId)).toEqual(["b"]);
  });

  it("uebergeht einen gestreckten Durchgang", () => {
    const straight = {
      points: [
        { id: "a", x: 0, z: 0 },
        { id: "b", x: 10, z: 0 },
        { id: "c", x: 20, z: 0 },
      ],
      segments: [
        { id: "s1", startId: "a", endId: "b", kind: "line" },
        { id: "s2", startId: "b", endId: "c", kind: "line" },
      ],
    } as unknown as SketchProfile;
    // 180 Grad an einer Stelle, die gar keine Ecke ist, waere nur Beiwerk.
    expect(sketchStraightCornerAngles(straight)).toEqual([]);
  });

  it("schweigt, wo ein Bogen beteiligt ist", () => {
    const curved = {
      ...square,
      segments: [{ ...square.segments[0], kind: "bezier" }, ...square.segments.slice(1)],
    } as unknown as SketchProfile;
    // An a und b haengt jetzt je nur noch eine gerade Kante.
    expect(sketchStraightCornerAngles(curved).map((corner) => corner.pointId).sort()).toEqual(["c", "d"]);
  });

  it("nennt keinen Winkel, wo sich drei Kanten treffen", () => {
    const branch = {
      points: [...square.points, { id: "e", x: 20, z: -20 }],
      segments: [...square.segments, { id: "s5", startId: "b", endId: "e", kind: "line" }],
    } as unknown as SketchProfile;
    expect(sketchStraightCornerAngles(branch).some((corner) => corner.pointId === "b")).toBe(false);
  });
});
