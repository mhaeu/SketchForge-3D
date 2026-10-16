import manifoldModule from "manifold-3d";
import type { ManifoldToplevel } from "manifold-3d";
import { beforeAll, describe, expect, it } from "vitest";
import {
  FACE_TOOL_OVERLAP,
  faceToolBodyFrame,
  faceToolSettingsOn,
  insetFaceProfile,
  normalizeFaceTool,
} from "@/lib/faceTool";
import { CUTTER_END_PADDING, paddedCutterShape } from "@/lib/cutterPadding";
import { horizontalPlacementWorkplane } from "@/lib/placementWorkplane";
import type { SketchProfile } from "@/types/sketchforge";

let runtime: ManifoldToplevel;
beforeAll(async () => {
  runtime = await manifoldModule();
  runtime.setup();
});

/** Die Deckflaeche eines Quaders 40 x 20, Mitte im Ursprung. */
const top = { outline: [{ x: -20, z: -10 }, { x: 20, z: -10 }, { x: 20, z: 10 }, { x: -20, z: 10 }], openings: [] };

function bounds(profile: SketchProfile) {
  const xs = profile.points.map((point) => point.x);
  const zs = profile.points.map((point) => point.z);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
}

function area(profile: SketchProfile) {
  // Je Ring die Schuhbandformel; Loecher laufen andersherum und ziehen ab.
  const byId = new Map(profile.points.map((point) => [point.id, point]));
  return profile.segments.reduce((sum, segment) => {
    const a = byId.get(segment.startId)!;
    const b = byId.get(segment.endId)!;
    return sum + (a.x * b.z - b.x * a.z) / 2;
  }, 0);
}

describe("Der Umriss des Flaechenwerkzeugs", () => {
  it("nimmt ohne Einzug die ganze Flaeche", () => {
    const profile = insetFaceProfile(runtime, top, 0)!;
    expect(bounds(profile)).toEqual({ minX: -20, maxX: 20, minZ: -10, maxZ: 10 });
    expect(Math.abs(area(profile))).toBeCloseTo(800, 6);
  });

  it("zieht um den Einzug vom Rand ab", () => {
    const profile = insetFaceProfile(runtime, top, 3)!;
    const box = bounds(profile);
    expect(box.minX).toBeCloseTo(-17, 6);
    expect(box.maxX).toBeCloseTo(17, 6);
    expect(box.maxZ).toBeCloseTo(7, 6);
    expect(Math.abs(area(profile))).toBeCloseTo(34 * 14, 6);
  });

  /**
   * Mit Radius bleibt der Kasten derselbe, nur die Ecken werden rund: Vier
   * Viertelkreise von 4 mm nehmen (4 - pi) * 16 = 13,73 mm2 weg. Abgetastet
   * mit 48 Stuecken je Kreis liegen die Boegen innen auf der Sehne und nehmen
   * etwas mehr: gemessen 13,93.
   */
  it("rundet die Ecken, ohne den Rand weiter einzuziehen", () => {
    const profile = insetFaceProfile(runtime, top, 3, 4)!;
    const box = bounds(profile);
    expect(box.minX).toBeCloseTo(-17, 4);
    expect(box.maxZ).toBeCloseTo(7, 4);
    const missing = 34 * 14 - Math.abs(area(profile));
    expect(missing).toBeGreaterThan(13.73);
    expect(missing).toBeLessThan(14);
  });

  it("laesst eine Oeffnung um den Einzug wachsen", () => {
    const hole = [{ x: -2, z: -2 }, { x: -2, z: 2 }, { x: 2, z: 2 }, { x: 2, z: -2 }];
    const profile = insetFaceProfile(runtime, { outline: top.outline, openings: [hole] }, 1)!;
    // Aussen 38 x 18, innen 6 x 6.
    expect(Math.abs(area(profile))).toBeCloseTo(38 * 18 - 36, 4);
  });

  it("gibt nichts, wenn der Einzug die Flaeche verbraucht", () => {
    expect(insetFaceProfile(runtime, top, 10)).toBeNull();
    expect(insetFaceProfile(runtime, { outline: [], openings: [] }, 0)).toBeNull();
  });
});

describe("Wie tief und wo", () => {
  it("haelt die Zahlen im Angebot", () => {
    expect(normalizeFaceTool({ depth: -5, inset: 999, radius: Number.NaN, direction: "in" })).toEqual({ direction: "in", depth: 0.2, inset: 50, radius: 0 });
    expect(normalizeFaceTool({}).direction).toBe("out");
  });

  it("geht mit einer Tasche nicht tiefer als der Koerper dahinter", () => {
    expect(faceToolSettingsOn(5, normalizeFaceTool({ direction: "in", depth: 8 })).depth).toBe(5);
    expect(faceToolSettingsOn(5, normalizeFaceTool({ direction: "out", depth: 8 })).depth).toBe(8);
  });

  it("legt den neuen Koerper so, dass er mit dem alten verschmilzt", () => {
    const plane = { ...horizontalPlacementWorkplane(0), origin: { x: 0, y: 10, z: 0 } };
    const out = faceToolBodyFrame(plane, { direction: "out", depth: 3 }, 10);
    // Heraus: beginnt 0,2 mm im Koerper und reicht 3 mm darueber.
    expect(out.workplane.origin.y).toBeCloseTo(10 - FACE_TOOL_OVERLAP, 12);
    expect(out.workplane.origin.y + out.height).toBeCloseTo(13, 12);
  });

  /**
   * Eine Aussparung wird beim Gruppieren an beiden Enden um 0,05 mm
   * verlaengert. Der Boden einer blinden Tasche soll trotzdem genau dort
   * liegen, wo die Tiefe ihn hinsetzt.
   */
  it("setzt den Boden einer Tasche genau auf die Tiefe, auch nach der Zugabe", () => {
    const plane = { ...horizontalPlacementWorkplane(0), origin: { x: 0, y: 10, z: 0 } };
    const pocket = faceToolBodyFrame(plane, { direction: "in", depth: 3 }, 10);
    const cutter = paddedCutterShape({ elevation: pocket.workplane.origin.y, height: pocket.height } as never);
    expect(cutter.elevation).toBeCloseTo(7, 12);
    // Oben reicht sie ueber die Flaeche hinaus.
    expect((cutter.elevation ?? 0) + cutter.height).toBeGreaterThan(10);
  });

  it("laesst die Zugabe stehen, wenn die Tasche durch den ganzen Koerper geht", () => {
    const plane = { ...horizontalPlacementWorkplane(0), origin: { x: 0, y: 10, z: 0 } };
    const through = faceToolBodyFrame(plane, { direction: "in", depth: 10 }, 10);
    const cutter = paddedCutterShape({ elevation: through.workplane.origin.y, height: through.height } as never);
    expect(cutter.elevation).toBeCloseTo(-CUTTER_END_PADDING, 12);
  });
});
