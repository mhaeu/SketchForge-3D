import { describe, expect, it } from "vitest";
import { arcGeometry } from "@/lib/sketchArcs";
import { roundSketchCorner } from "@/lib/sketchFillet";
import type { SketchProfile } from "@/types/sketchforge";

let counter = 0;
const createId = (prefix: string) => `${prefix}-${counter++}`;

/** Ein rechter Winkel: von (0,4) zur Ecke (0,0) und weiter nach (4,0). */
function corner(): SketchProfile {
  counter = 0;
  return {
    points: [
      { id: "a", x: 0, z: 4 },
      { id: "c", x: 0, z: 0 },
      { id: "b", x: 4, z: 0 },
    ],
    segments: [
      { id: "ac", startId: "a", endId: "c" },
      { id: "cb", startId: "c", endId: "b" },
    ],
  };
}

describe("Runde Ecke", () => {
  it("ersetzt die Ecke durch zwei Punkte auf den Schenkeln und einen Bogen dazwischen", () => {
    const rounded = roundSketchCorner(corner(), "c", createId)!;
    expect(rounded).not.toBeNull();
    // Der Eckpunkt ist weg, an seiner Stelle stehen die beiden Beruehrpunkte.
    expect(rounded.profile.points.map((point) => point.id)).not.toContain("c");
    expect(rounded.profile.points).toHaveLength(4);
    const arc = rounded.profile.segments.find((segment) => segment.kind === "arc")!;
    expect(arc).toBeTruthy();
    const start = rounded.profile.points.find((point) => point.id === arc.startId)!;
    const end = rounded.profile.points.find((point) => point.id === arc.endId)!;
    // Ein Viertel des Schenkels, also je einen Punkt bei (0,1) und (1,0).
    expect([start.x, start.z]).toEqual([0, 1]);
    expect([end.x, end.z]).toEqual([1, 0]);
    // Am rechten Winkel ist der Halbmesser genau die Strecke bis zum Beruehrpunkt.
    expect(rounded.radius).toBeCloseTo(1, 9);
  });

  it("legt einen echten Kreisbogen hinein, der beide Schenkel beruehrt", () => {
    const rounded = roundSketchCorner(corner(), "c", createId)!;
    const arc = rounded.profile.segments.find((segment) => segment.kind === "arc")!;
    const start = rounded.profile.points.find((point) => point.id === arc.startId)!;
    const end = rounded.profile.points.find((point) => point.id === arc.endId)!;
    const geometry = arcGeometry(start, end, arc.bulge!)!;
    // Beim rechten Winkel liegt die Mitte auf (1,1) und der Halbmesser ist 1 -
    // damit steht der Bogen senkrecht auf beiden Schenkeln, statt sie nur
    // ungefaehr zu treffen.
    expect(geometry.centre.x).toBeCloseTo(1, 9);
    expect(geometry.centre.z).toBeCloseTo(1, 9);
    expect(geometry.radius).toBeCloseTo(1, 9);
    expect(Math.abs(geometry.sweep)).toBeCloseTo(Math.PI / 2, 9);
  });

  it("haengt den Bogen an dieselben Kanten wie vorher die Ecke", () => {
    const rounded = roundSketchCorner(corner(), "c", createId)!;
    const arc = rounded.profile.segments.find((segment) => segment.kind === "arc")!;
    const first = rounded.profile.segments.find((segment) => segment.id === "ac")!;
    const second = rounded.profile.segments.find((segment) => segment.id === "cb")!;
    expect(first.endId).toBe(arc.startId);
    expect(second.startId).toBe(arc.endId);
    // Die aeusseren Enden bleiben, wo sie waren.
    expect(first.startId).toBe("a");
    expect(second.endId).toBe("b");
  });

  it("woelbt sich in die Ecke hinein und nicht von ihr weg", () => {
    const rounded = roundSketchCorner(corner(), "c", createId)!;
    const arc = rounded.profile.segments.find((segment) => segment.kind === "arc")!;
    const start = rounded.profile.points.find((point) => point.id === arc.startId)!;
    const end = rounded.profile.points.find((point) => point.id === arc.endId)!;
    const geometry = arcGeometry(start, end, arc.bulge!)!;
    // Der Scheitel liegt naeher an der Ecke (0,0) als die Sehnenmitte (0.5,0.5).
    expect(Math.hypot(geometry.apex.x, geometry.apex.z)).toBeLessThan(Math.hypot(0.5, 0.5));
  });

  it("nimmt einen kleineren Anteil, wenn man ihn nennt", () => {
    const rounded = roundSketchCorner(corner(), "c", createId, 0.1)!;
    expect(rounded.radius).toBeCloseTo(0.4, 9);
  });

  it("frisst hoechstens die Haelfte des kuerzeren Schenkels", () => {
    // Auch bei einem uebertriebenen Anteil bleibt von jeder Kante etwas
    // uebrig - sonst haengt die Rundung am naechsten Punkt und die Kante
    // verschwindet.
    const rounded = roundSketchCorner(corner(), "c", createId, 5)!;
    const arc = rounded.profile.segments.find((segment) => segment.kind === "arc")!;
    const start = rounded.profile.points.find((point) => point.id === arc.startId)!;
    expect(start.z).toBeCloseTo(2, 9);
  });

  it("laesst sich auf einen Punkt anwenden, der nicht genau zwei gerade Kanten hat", () => {
    const profile = corner();
    // Ein Ende mit nur einer Kante hat keine Ecke.
    expect(roundSketchCorner(profile, "a", createId)).toBeNull();
    // Und an einer Kurve gaebe es keinen Halbmesser zu rechnen.
    const curved = { ...profile, segments: profile.segments.map((segment) => segment.id === "ac" ? { ...segment, kind: "bezier" as const } : segment) };
    expect(roundSketchCorner(curved, "c", createId)).toBeNull();
    expect(roundSketchCorner(profile, "fehlt", createId)).toBeNull();
  });

  it("laesst eine gestreckte Stelle in Ruhe", () => {
    // Drei Punkte auf einer Linie sind keine Ecke, und eine Rundung daran
    // waere ein Bogen mit unendlichem Halbmesser.
    const straight: SketchProfile = {
      points: [{ id: "a", x: -2, z: 0 }, { id: "c", x: 0, z: 0 }, { id: "b", x: 2, z: 0 }],
      segments: [{ id: "ac", startId: "a", endId: "c" }, { id: "cb", startId: "c", endId: "b" }],
    };
    expect(roundSketchCorner(straight, "c", createId)).toBeNull();
  });
});
