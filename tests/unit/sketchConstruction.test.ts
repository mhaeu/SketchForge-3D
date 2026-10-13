import { describe, expect, it } from "vitest";
import { constructionSnapPoints, nearestSketchSnapPoint, sketchGeometryProfile, withoutConstructionLines } from "@/lib/sketchConstruction";
import { cadSketchRegions } from "@/lib/sketchCadProfile";
import { addLineIntersectionPoints } from "@/lib/sketchPointRefinement";
import { revolveProfileFitsAxis } from "@/lib/cadSketchRevolve";
import type { SketchProfile, SketchSegment } from "@/types/sketchforge";

/**
 * Hilfslinien in der Skizze.
 *
 * Gemessen wird, was sie versprechen: Sie gehoeren nie zum Umriss - auch wenn
 * sie weit hinausreichen oder ihn kreuzen -, sie schneiden ihn nicht auf, und
 * sie bringen ihre Kreuzungen als Fangpunkte mit.
 */

const square = (size = 20): SketchProfile => {
  const points = [
    { id: "a", x: 0, z: 0 },
    { id: "b", x: size, z: 0 },
    { id: "c", x: size, z: size },
    { id: "d", x: 0, z: size },
  ];
  const segments: SketchSegment[] = points.map((point, index) => ({
    id: `s${index}`,
    startId: point.id,
    endId: points[(index + 1) % points.length].id,
    kind: "line",
  }));
  return { points, segments };
};

const withGuide = (profile: SketchProfile, from: { x: number; z: number }, to: { x: number; z: number }, id = "g"): SketchProfile => ({
  ...profile,
  points: [...profile.points, { id: `${id}0`, ...from }, { id: `${id}1`, ...to }],
  segments: [...profile.segments, { id, startId: `${id}0`, endId: `${id}1`, kind: "line", construction: true }],
});

describe("Eine Hilfslinie", () => {
  it("faellt aus dem Umriss heraus, samt den Punkten, die nur an ihr hingen", () => {
    const profile = withGuide(square(), { x: -50, z: 10 }, { x: 70, z: 10 });
    const outline = withoutConstructionLines(profile);
    expect(outline.segments).toHaveLength(4);
    expect(outline.points.map((point) => point.id).sort()).toEqual(["a", "b", "c", "d"]);
  });

  /**
   * Eine Hilfslinie, die an einer Ecke des Umrisses beginnt: Die Ecke bleibt,
   * denn an ihr haengt auch eine Umrisskante.
   */
  it("laesst einen Punkt stehen, an dem auch der Umriss haengt", () => {
    const profile: SketchProfile = {
      ...square(),
      points: [...square().points, { id: "far", x: 40, z: 40 }],
      segments: [...square().segments, { id: "g", startId: "c", endId: "far", kind: "line", construction: true }],
    };
    const outline = withoutConstructionLines(profile);
    expect(outline.points.map((point) => point.id).sort()).toEqual(["a", "b", "c", "d"]);
  });

  /**
   * Der Koerper wird nicht groesser, so weit die Hilfslinie auch
   * hinausreicht: Der Umriss ist derselbe Ring wie ohne sie.
   */
  it("macht den Koerper nicht groesser", () => {
    const plain = cadSketchRegions(sketchGeometryProfile(square()));
    const guided = cadSketchRegions(sketchGeometryProfile(withGuide(square(), { x: -50, z: 10 }, { x: 70, z: 10 })));
    expect(guided).toHaveLength(1);
    expect(guided[0].outer.points.map((point) => [point.x, point.z])).toEqual(plain[0].outer.points.map((point) => [point.x, point.z]));
  });

  /**
   * Und sie schneidet den Umriss nicht auf. Die Skizze teilt Linien an ihren
   * Kreuzungen - eine Hilfslinie quer durch das Quadrat wuerde sonst zwei
   * neue Punkte mitten in seine Kanten setzen.
   */
  it("schneidet den Umriss nicht auf, wo sie ihn kreuzt", () => {
    let counter = 0;
    const profile = withGuide(square(), { x: -5, z: 10 }, { x: 25, z: 10 });
    const refined = addLineIntersectionPoints(profile, (prefix) => `${prefix}-${counter++}`);
    expect(refined.points).toHaveLength(profile.points.length);
    expect(refined.segments).toHaveLength(profile.segments.length);
  });

  /** Ein Drehteil darf eine Hilfslinie rechts von der Achse haben. */
  it("laesst ein Drehteil eine Hilfslinie jenseits der Achse haben", () => {
    // Die Achse liegt bei x = 0, der Umriss links davon.
    const left: SketchProfile = {
      points: [
        { id: "a", x: -20, z: 0 },
        { id: "b", x: -5, z: 0 },
        { id: "c", x: -5, z: 30 },
        { id: "d", x: -20, z: 30 },
      ],
      segments: ["a", "b", "c", "d"].map((id, index, ids) => ({ id: `s${index}`, startId: id, endId: ids[(index + 1) % ids.length], kind: "line" as const })),
    };
    const guided = withGuide(left, { x: -30, z: 15 }, { x: 10, z: 15 });
    expect(revolveProfileFitsAxis(guided)).toBe(false);
    expect(revolveProfileFitsAxis(sketchGeometryProfile(guided))).toBe(true);
  });
});

describe("Die Fangpunkte einer Hilfslinie", () => {
  /**
   * Die Diagonale durch ein Quadrat kreuzt die andere Diagonale in seiner
   * Mitte - der klassische Weg, eine Mitte ohne Rechnen zu finden.
   */
  it("findet die Mitte eines Quadrats an der Kreuzung zweier Diagonalen", () => {
    const profile = withGuide(withGuide(square(), { x: 0, z: 0 }, { x: 20, z: 20 }, "g"), { x: 20, z: 0 }, { x: 0, z: 20 }, "h");
    const points = constructionSnapPoints(profile);
    expect(points.some((point) => Math.abs(point.x - 10) < 1e-9 && Math.abs(point.z - 10) < 1e-9)).toBe(true);
  });

  /** Eine Parallele im Abstand 3 kreuzt die Seiten genau dort, wo sie soll. */
  it("findet die Stelle, an der eine Parallele den Umriss kreuzt", () => {
    const profile = withGuide(square(), { x: -5, z: 3 }, { x: 25, z: 3 });
    const points = constructionSnapPoints(profile).sort((a, b) => a.x - b.x);
    expect(points).toHaveLength(2);
    expect(points[0]).toEqual({ x: 0, z: 3 });
    expect(points[1]).toEqual({ x: 20, z: 3 });
  });

  it("bringt ohne Hilfslinie keine Fangpunkte", () => {
    expect(constructionSnapPoints(square())).toEqual([]);
  });

  it("faengt den naechsten Punkt in Reichweite und sonst keinen", () => {
    const candidates = [{ x: 10, z: 10 }, { x: 0, z: 3 }];
    expect(nearestSketchSnapPoint({ x: 10.2, z: 9.9 }, candidates, 0.5)).toEqual({ x: 10, z: 10 });
    expect(nearestSketchSnapPoint({ x: 12, z: 12 }, candidates, 0.5)).toBeNull();
  });
});
