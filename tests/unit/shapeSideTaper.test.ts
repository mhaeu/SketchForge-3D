import { describe, expect, it } from "vitest";
import {
  shapeHasSideHeights,
  shapeSideHeightPatch,
  shapeSideHeightScaleAt,
  shapeSideHeights,
  shapeTopFaceEdgePatch,
  shapeTopFaceEdges,
} from "@/lib/workplaneShapes";
import type { WorkplaneShape } from "@/types/sketchforge";

function box(patch: Partial<WorkplaneShape> = {}): WorkplaneShape {
  return {
    id: "b",
    name: "Kasten",
    kind: "box",
    color: "#888888",
    x: 0,
    z: 0,
    size: 20,
    width: 20,
    depth: 10,
    height: 40,
    rotation: 0,
    ...patch,
  } as WorkplaneShape;
}

describe("Die Kanten der Deckflaeche", () => {
  it("liegen ohne Verjuengung genau ueber den Kanten der Grundflaeche", () => {
    expect(shapeTopFaceEdges(box())).toEqual({ left: -10, right: 10, front: -5, back: 5 });
  });

  it("folgen der Groesse der Deckflaeche und ihrem Versatz", () => {
    const shape = box({ taperTopWidth: 10, taperTopDepth: 4, extrudeTopOffsetX: 3, extrudeTopOffsetZ: -1 });
    expect(shapeTopFaceEdges(shape)).toEqual({ left: -2, right: 8, front: -3, back: 1 });
  });

  it("stellt eine Seite schraeg und laesst die andere stehen", () => {
    // Genau dafuer gibt es die Ansicht: die linke Seite einziehen, ohne die
    // rechte anzufassen.
    const shape = box();
    const patch = shapeTopFaceEdgePatch(shape, { left: -4 });
    const moved = shapeTopFaceEdges({ ...shape, ...patch });
    expect(moved.left).toBeCloseTo(-4, 9);
    expect(moved.right).toBeCloseTo(10, 9);
    expect(moved.front).toBeCloseTo(-5, 9);
    expect(moved.back).toBeCloseTo(5, 9);
  });

  it("kommt dabei ohne ein eigenes Feld aus", () => {
    // Beide Ansichten beschreiben dieselbe Form; zwei Felder fuer dieselbe
    // Sache liefen frueher oder spaeter auseinander.
    const patch = shapeTopFaceEdgePatch(box(), { left: -4 });
    expect(patch.taperTopWidth).toBeCloseTo(14, 9);
    expect(patch.extrudeTopOffsetX).toBeCloseTo(3, 9);
    expect(Object.keys(patch)).not.toContain("taperSideLeft");
  });

  it("laesst eine Kante ueber die andere hinaus nicht zu", () => {
    const patch = shapeTopFaceEdgePatch(box(), { left: 30 });
    expect(patch.taperTopWidth).toBeGreaterThan(0);
  });

  it("ruehrt eine Art ohne Verjuengung nicht an", () => {
    expect(shapeTopFaceEdgePatch(box({ kind: "gear" }), { left: -4 })).toEqual({});
  });
});

describe("Die Hoehe an den vier Seiten", () => {
  it("ist ohne Angabe ueberall die volle Hoehe", () => {
    expect(shapeSideHeights(box())).toEqual({ left: 40, right: 40, front: 40, back: 40 });
    expect(shapeHasSideHeights(box())).toBe(false);
    expect(shapeSideHeightScaleAt(box(), 0, 0)).toBe(1);
  });

  it("senkt nur ab und hebt nie an", () => {
    // Sonst muesste jede Stelle, die mit der Hoehe rechnet, die Verjuengung
    // mitdenken - Auswahlrahmen, Aufstellhoehe, Teilbereich, Ausfuhr.
    expect(shapeSideHeights(box({ taperHeightLeft: 3 })).left).toBe(40);
    expect(shapeSideHeightPatch(box(), { left: 100 }).taperHeightLeft).toBe(1);
  });

  it("behaelt die Neigung, wenn der Koerper hoeher oder niedriger wird", () => {
    /*
     * Abgelegt ist der Anteil, nicht das Mass in Millimetern. Ein Mass
     * muesste bei jeder Hoehenaenderung mitgerechnet werden - und ginge beim
     * Verkleinern verloren, weil es dabei auf die neue Hoehe gestutzt wuerde.
     */
    const patch = shapeSideHeightPatch(box(), { left: 10 });
    const lower = box({ ...patch, height: 8 });
    expect(shapeSideHeights(lower).left).toBeCloseTo(2, 9);
    const higher = box({ ...patch, height: 80 });
    expect(shapeSideHeights(higher).left).toBeCloseTo(20, 9);
    // Die Neigung selbst ist in beiden dieselbe.
    expect(shapeSideHeightScaleAt(lower, -10, 0)).toBeCloseTo(shapeSideHeightScaleAt(higher, -10, 0), 9);
  });

  it("macht aus einer abgesenkten Seite eine schiefe Ebene", () => {
    const wedge = box({ taperHeightLeft: 0.25 });
    expect(shapeHasSideHeights(wedge)).toBe(true);
    // Ganz links ein Viertel, ganz rechts voll, in der Mitte dazwischen.
    expect(shapeSideHeightScaleAt(wedge, -10, 0)).toBeCloseTo(0.25, 9);
    expect(shapeSideHeightScaleAt(wedge, 10, 0)).toBeCloseTo(1, 9);
    expect(shapeSideHeightScaleAt(wedge, 0, 0)).toBeCloseTo(0.625, 9);
  });

  it("senkt gleichmaessig ab, wenn beide Gegenseiten gleich tief stehen", () => {
    /*
     * Zwischen zwei Seiten wird geradlinig ueberblendet, also gibt es keinen
     * First in der Mitte: Zwei gleich tief gestellte Gegenseiten ergeben eine
     * flache, niedrigere Platte. Ein Satteldach entsteht anders herum - indem
     * die Deckflaeche auf eine Linie verjuengt wird; das kann die Verjuengung
     * von Breite und Tiefe seit jeher.
     */
    const flat = box({ taperHeightLeft: 0.5, taperHeightRight: 0.5 });
    [-10, -5, 0, 5, 10].forEach((x) => expect(shapeSideHeightScaleAt(flat, x, 0)).toBeCloseTo(0.5, 9));
  });

  it("zaehlt beide Neigungen zusammen und bleibt bei voller Hoehe stehen", () => {
    const both = box({ taperHeightLeft: 0.5, taperHeightFront: 0.5 });
    // Ecke links vorn: beide Seiten halb, also beide Absenkungen zusammen.
    expect(shapeSideHeightScaleAt(both, -10, -5)).toBeCloseTo(0, 9);
    // Ecke rechts hinten: keine der beiden senkt ab.
    expect(shapeSideHeightScaleAt(both, 10, 5)).toBeCloseTo(1, 9);
  });

  it("faellt nie unter null, auch wo sich zwei Absenkungen aufaddieren", () => {
    const steep = box({ taperHeightLeft: 0, taperHeightFront: 0 });
    expect(shapeSideHeightScaleAt(steep, -10, -5)).toBe(0);
  });

  it("bleibt ausserhalb der Grundflaeche beim Randwert stehen", () => {
    const wedge = box({ taperHeightLeft: 0.25 });
    expect(shapeSideHeightScaleAt(wedge, -1000, 0)).toBeCloseTo(0.25, 9);
    expect(shapeSideHeightScaleAt(wedge, 1000, 0)).toBeCloseTo(1, 9);
  });
});
