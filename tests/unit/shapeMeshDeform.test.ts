import { describe, expect, it } from "vitest";
import { deformShapePoint, type ShapeDeformBox } from "@/lib/shapeMeshDeform";
import { shapeTopFaceEdgePatch, shapeTopFaceEdges } from "@/lib/workplaneShapes";
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
    depth: 20,
    height: 20,
    rotation: 0,
    ...patch,
  } as WorkplaneShape;
}

/** So liegt das Netz eines Quaders wirklich vor: als Einheitswuerfel. */
const unitBox: ShapeDeformBox = { minX: -0.5, maxX: 0.5, minY: 0, maxY: 1, minZ: -0.5, maxZ: 0.5 };
/** Und so, wenn es schon in Millimetern steht - etwa der Inhalt einer Gruppe. */
const realBox: ShapeDeformBox = { minX: -10, maxX: 10, minY: 0, maxY: 20, minZ: -10, maxZ: 10 };

describe("Ein Punkt eines Koerpernetzes", () => {
  it("bleibt liegen, wo nichts eingestellt ist", () => {
    const point = { x: 0.5, y: 1, z: -0.5 };
    expect(deformShapePoint(box(), unitBox, point)).toEqual(point);
  });

  it("rechnet den Versatz in den Massstab des Netzes um", () => {
    /*
     * Das war der Fehler: Der Versatz steht in Millimetern, das Netz eines
     * Quaders aber als Einheitswuerfel, der erst am Objekt auf seine Masse
     * gezogen wird. Ungerechnet schob ein Versatz von fuenf die Deckflaeche
     * eines Einheitswuerfels um fuenf Kantenlaengen zur Seite - der Koerper
     * wurde unbrauchbar verzerrt.
     */
    const shifted = box({ extrudeTopOffsetX: 5 });
    // Fuenf von zwanzig Millimetern sind ein Viertel der Breite, also ein
    // Viertel der Kantenlaenge des Einheitswuerfels.
    expect(deformShapePoint(shifted, unitBox, { x: 0.5, y: 1, z: 0 }).x).toBeCloseTo(0.75, 9);
    // Im Netz in Millimetern sind es dieselben fuenf Millimeter.
    expect(deformShapePoint(shifted, realBox, { x: 10, y: 20, z: 0 }).x).toBeCloseTo(15, 9);
    // An der Grundflaeche passiert in beiden nichts.
    expect(deformShapePoint(shifted, unitBox, { x: 0.5, y: 0, z: 0 }).x).toBeCloseTo(0.5, 9);
  });

  it("verjuengt in beiden Massstaeben gleich, denn das ist ein Verhaeltnis", () => {
    const tapered = box({ taperTopWidth: 10 });
    expect(deformShapePoint(tapered, unitBox, { x: 0.5, y: 1, z: 0 }).x).toBeCloseTo(0.25, 9);
    expect(deformShapePoint(tapered, realBox, { x: 10, y: 20, z: 0 }).x).toBeCloseTo(5, 9);
  });

  it("stellt eine einzelne Seite schraeg und laesst die andere senkrecht", () => {
    // Das ist der ganze Sinn der vier Deckkanten - und es muss auch am
    // Einheitsnetz herauskommen, sonst sieht man es im Fenster nicht.
    const leaning = box(shapeTopFaceEdgePatch(box(), { left: -4 }));
    expect(shapeTopFaceEdges(leaning).left).toBeCloseTo(-4, 9);
    expect(shapeTopFaceEdges(leaning).right).toBeCloseTo(10, 9);
    // Linke Oberkante bei -4 von 20 Millimetern, also -0.2 am Einheitswuerfel.
    expect(deformShapePoint(leaning, unitBox, { x: -0.5, y: 1, z: 0 }).x).toBeCloseTo(-0.2, 9);
    // Rechte Oberkante unveraendert.
    expect(deformShapePoint(leaning, unitBox, { x: 0.5, y: 1, z: 0 }).x).toBeCloseTo(0.5, 9);
    // Unten bleibt beides stehen.
    expect(deformShapePoint(leaning, unitBox, { x: -0.5, y: 0, z: 0 }).x).toBeCloseTo(-0.5, 9);
  });

  it("senkt eine Seite ab, im Einheitsnetz wie im Netz in Millimetern", () => {
    // Auch das hing am Massstab: gefragt wird nach dem Anteil quer ueber die
    // Grundflaeche, nicht nach Millimetern.
    const wedge = box({ taperHeightLeft: 0.25 });
    expect(deformShapePoint(wedge, unitBox, { x: -0.5, y: 1, z: 0 }).y).toBeCloseTo(0.25, 9);
    expect(deformShapePoint(wedge, unitBox, { x: 0.5, y: 1, z: 0 }).y).toBeCloseTo(1, 9);
    expect(deformShapePoint(wedge, realBox, { x: -10, y: 20, z: 0 }).y).toBeCloseTo(5, 9);
    expect(deformShapePoint(wedge, realBox, { x: 10, y: 20, z: 0 }).y).toBeCloseTo(20, 9);
  });

  it("dreht den Drall um die Mitte, ohne die Hoehe anzufassen", () => {
    const twisted = box({ extrudeTwist: 90 });
    const turned = deformShapePoint(twisted, unitBox, { x: 0.5, y: 1, z: 0 });
    expect(turned.x).toBeCloseTo(0, 9);
    expect(turned.z).toBeCloseTo(0.5, 9);
    expect(turned.y).toBeCloseTo(1, 9);
  });
});
