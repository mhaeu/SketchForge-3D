import { describe, expect, it } from "vitest";
import { filledSketchProfile, sketchHasHoles } from "@/lib/sketchHollow";
import { cadSketchRegions } from "@/lib/sketchCadProfile";
import type { SketchProfile } from "@/types/sketchforge";

/** Ein geschlossenes Rechteck mit dem Namen `prefix`. */
function loop(prefix: string, half: number) {
  const points = [
    { id: `${prefix}1`, x: -half, z: -half },
    { id: `${prefix}2`, x: half, z: -half },
    { id: `${prefix}3`, x: half, z: half },
    { id: `${prefix}4`, x: -half, z: half },
  ];
  const segments = points.map((point, index) => ({
    id: `${prefix}s${index}`,
    startId: point.id,
    endId: points[(index + 1) % points.length].id,
    kind: "line" as const,
  }));
  return { points, segments };
}

function profile(...parts: Array<ReturnType<typeof loop>>): SketchProfile {
  return {
    points: parts.flatMap((part) => part.points),
    segments: parts.flatMap((part) => part.segments),
  };
}

describe("Die Zeichnung ohne ihre Loecher", () => {
  const hollow = profile(loop("a", 20), loop("i", 8));

  it("erkennt einen Hohlraum in der Zeichnung", () => {
    expect(sketchHasHoles(hollow)).toBe(true);
    expect(sketchHasHoles(profile(loop("a", 20)))).toBe(false);
  });

  it("nimmt den inneren Zug heraus und laesst den aeusseren stehen", () => {
    const filled = filledSketchProfile(hollow)!;
    expect(filled.segments.map((segment) => segment.id).sort()).toEqual(["as0", "as1", "as2", "as3"]);
    expect(filled.points.map((point) => point.id).sort()).toEqual(["a1", "a2", "a3", "a4"]);
    // Und damit steht dort eine Flaeche ohne Loch.
    const regions = cadSketchRegions(filled);
    expect(regions).toHaveLength(1);
    expect(regions[0].holes).toHaveLength(0);
  });

  it("behaelt den Kasten um die Zeichnung", () => {
    /*
     * Darauf beruht der ganze Weg: Der aeussere Umriss bestimmt den Kasten,
     * voll und hohl haben also denselben - der volle Koerper laesst sich
     * deshalb einfach in den Rahmen des hohlen setzen, ohne Ausmessen.
     */
    const filled = filledSketchProfile(hollow)!;
    const extent = (points: SketchProfile["points"]) => [
      Math.min(...points.map((point) => point.x)), Math.max(...points.map((point) => point.x)),
      Math.min(...points.map((point) => point.z)), Math.max(...points.map((point) => point.z)),
    ];
    expect(extent(filled.points)).toEqual(extent(hollow.points));
  });

  it("meldet nichts, wo es kein Loch gibt", () => {
    expect(filledSketchProfile(profile(loop("a", 20)))).toBeNull();
    // Zwei Umrisse nebeneinander sind zwei Koerper, keine Loecher.
    const sideBySide: SketchProfile = {
      points: [...loop("a", 5).points, ...loop("b", 5).points.map((point) => ({ ...point, x: point.x + 40 }))],
      segments: [...loop("a", 5).segments, ...loop("b", 5).segments],
    };
    expect(filledSketchProfile(sideBySide)).toBeNull();
  });

  it("laesst einen offenen Zug stehen", () => {
    // Beim Folgen ist er der Weg; ohne ihn gaebe es nichts, dem die Form
    // folgen koennte.
    const withPath: SketchProfile = {
      points: [...hollow.points, { id: "p1", x: 60, z: 0 }, { id: "p2", x: 60, z: -30 }],
      segments: [...hollow.segments, { id: "ps", startId: "p1", endId: "p2", kind: "line" }],
    };
    const filled = filledSketchProfile(withPath)!;
    expect(filled.segments.map((segment) => segment.id)).toContain("ps");
    expect(filled.points.map((point) => point.id)).toContain("p2");
  });

  it("nimmt auch ein Loch heraus, das als Kreis gezeichnet wurde", () => {
    const withCircle: SketchProfile = {
      ...profile(loop("a", 20)),
      circles: [{ id: "c", x: 0, z: 0, radius: 6 }],
    };
    expect(sketchHasHoles(withCircle)).toBe(true);
    const filled = filledSketchProfile(withCircle)!;
    expect(cadSketchRegions(filled)[0].holes).toHaveLength(0);
    // Der Kreis ist beim Ausklappen zu Kanten geworden und dann herausgefallen.
    expect(filled.circles).toBeUndefined();
  });
});
