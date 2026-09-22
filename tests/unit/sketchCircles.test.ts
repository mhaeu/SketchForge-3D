import { describe, expect, it } from "vitest";
import {
  expandSketchCircles,
  normalizeSketchCircles,
  pointOnSketchCircleEdge,
  sketchCircleOverPoints,
  sketchCirclePath,
  MIN_SKETCH_CIRCLE_RADIUS,
} from "@/lib/sketchCircles";
import type { SketchProfile } from "@/types/sketchforge";

/**
 * Ein Kreis in der Skizze bleibt ein Kreis: Er steht neben den Punkten und
 * Kanten und wird erst dort zu einer Kurve, wo Geometrie entsteht. Sonst
 * verzoege er sich beim naechsten Anfassen zu einer Delle.
 */
describe("echte Kreise in der Skizze", () => {
  it("legt ihn ueber die Strecke zwischen zwei Punkten", () => {
    const circle = sketchCircleOverPoints("c1", { x: 0, z: 0 }, { x: 10, z: 0 })!;
    expect(circle).toEqual({ id: "c1", x: 5, z: 0, radius: 5 });
    // Beide Punkte liegen auf ihm, gegenueber.
    expect(pointOnSketchCircleEdge(circle, { x: 0, z: 0 }, 1e-9)).toBe(true);
    expect(pointOnSketchCircleEdge(circle, { x: 10, z: 0 }, 1e-9)).toBe(true);
  });

  it("macht aus zwei Punkten aufeinander keinen Kreis", () => {
    expect(sketchCircleOverPoints("c1", { x: 4, z: 4 }, { x: 4, z: 4 })).toBeNull();
  });

  it("klappt ihn zu vier Bogen aus, immer gleich", () => {
    const circle = { id: "c1", x: 2, z: -3, radius: 4 };
    const path = sketchCirclePath(circle);
    expect(path.points).toHaveLength(4);
    expect(path.segments).toHaveLength(4);
    // Jeder Stuetzpunkt liegt auf dem Kreis.
    path.points.forEach((point) => {
      expect(Math.hypot(point.x - circle.x, point.z - circle.z)).toBeCloseTo(4, 9);
    });
    // Und derselbe Kreis ergibt dieselben Kennungen - sonst hielte der
    // Verlauf zwei gleiche Staende fuer verschieden.
    expect(JSON.stringify(sketchCirclePath(circle))).toBe(JSON.stringify(path));
  });

  it("haengt die Bogen beim Bauen an die uebrige Zeichnung", () => {
    const profile = {
      points: [{ id: "a", x: 0, z: 0 }],
      segments: [],
      circles: [{ id: "c1", x: 0, z: 0, radius: 3 }],
    } as unknown as SketchProfile;
    const expanded = expandSketchCircles(profile);
    expect(expanded.points).toHaveLength(5);
    expect(expanded.segments).toHaveLength(4);
    // Der Kreis selbst ist dann keiner mehr - er ist ja ausgeklappt.
    expect(expanded.circles).toBeUndefined();
    // Eine Zeichnung ohne Kreise bleibt unberuehrt.
    const plain = { points: [], segments: [] } as unknown as SketchProfile;
    expect(expandSketchCircles(plain)).toBe(plain);
  });

  it("wirft beim Lesen weg, was kein Kreis ist", () => {
    const circles = normalizeSketchCircles([
      { id: "c1", x: 1, z: 2, radius: 3 },
      { id: "c1", x: 9, z: 9, radius: 9 },
      { id: "c2", x: 0, z: 0, radius: MIN_SKETCH_CIRCLE_RADIUS / 2 },
      { x: 0, z: 0, radius: 5 },
      { id: "c3", x: Number.NaN, z: 0, radius: 2 },
    ]);
    // Die doppelte Kennung, der zu kleine Kreis und der ohne Kennung fallen
    // weg; eine unlesbare Koordinate wird zu null statt das Ganze zu kippen.
    expect(circles).toEqual([
      { id: "c1", x: 1, z: 2, radius: 3 },
      { id: "c3", x: 0, z: 0, radius: 2 },
    ]);
  });
});
