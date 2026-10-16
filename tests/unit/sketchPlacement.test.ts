import { describe, expect, it } from "vitest";
import { placementWorkplaneFromSurface } from "@/lib/placementWorkplane";
import { editedSketchShift, placeSketchExtrusion, sketchOutlineCentre } from "@/lib/sketchPlacement";
import type { SketchProfile, WorkplaneShape } from "@/types/sketchforge";

function extrusion(overrides: Partial<WorkplaneShape> = {}): WorkplaneShape {
  return {
    id: "sketch-extrusion-1",
    name: "Sketch extrusion",
    kind: "mesh",
    color: "#d41721",
    x: 3,
    z: -2,
    elevation: 0,
    size: 12,
    width: 12,
    depth: 8,
    height: 10,
    rotation: 0,
    rotationX: 0,
    rotationZ: 0,
    importedMesh: {
      positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
      baseWidth: 12,
      baseDepth: 8,
      baseHeight: 10,
      triangleCount: 1,
      sourceFormat: "json",
    },
    ...overrides,
  };
}

describe("sketch extrusion placement", () => {
  it("places a new extrusion outward from a vertical face", () => {
    const workplane = placementWorkplaneFromSurface(
      { x: 20, y: 7, z: 4 },
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
    );
    const placed = placeSketchExtrusion(extrusion(), workplane);

    expect(placed.x).toBeCloseTo(25);
    expect(placed.elevation).toBeCloseTo(5);
    expect(placed.rotationZ).toBeCloseTo(270);
  });

  it("keeps an edited extrusion's existing world transform", () => {
    const existing = extrusion({
      x: 28,
      z: 14,
      elevation: 9,
      rotation: 18,
      rotationX: 32,
      rotationZ: -21,
    });
    const regenerated = extrusion({ width: 20 });
    const placed = placeSketchExtrusion(
      regenerated,
      placementWorkplaneFromSurface(
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 1, z: 0 },
        { x: 1, y: 0, z: 0 },
      ),
      existing,
    );

    expect(placed).toEqual(expect.objectContaining({
      x: 28,
      z: 14,
      elevation: 9,
      rotation: 18,
      rotationX: 32,
      rotationZ: 339,
      width: 20,
    }));
  });
});

/** Ein Rechteck in der Skizze, von (0, 0) bis (width, depth). */
function rectangle(width: number, depth: number, bulgeRight = 0): SketchProfile {
  const points = [
    { id: "a", x: 0, z: 0 },
    { id: "b", x: width, z: 0 },
    { id: "c", x: width, z: depth },
    { id: "d", x: 0, z: depth },
  ];
  return {
    points,
    segments: [
      { id: "ab", startId: "a", endId: "b", kind: "line", bulge: 0 },
      { id: "bc", startId: "b", endId: "c", kind: bulgeRight ? "arc" : "line", bulge: bulgeRight },
      { id: "cd", startId: "c", endId: "d", kind: "line", bulge: 0 },
      { id: "da", startId: "d", endId: "a", kind: "line", bulge: 0 },
    ],
  } as SketchProfile;
}

/**
 * Nach Layerling 1.70.0 (#291): Wer die Skizze eines Koerpers oeffnet und
 * eine Kante hinauszieht, will, dass nur diese Kante wandert. Der Koerper
 * sitzt mit seiner Mitte auf der Mitte des Umrisses - er muss also um so viel
 * mitwandern, wie diese Mitte wandert, sonst rutscht die andere Seite weg.
 */
describe("a body follows its edited sketch", () => {
  it("measures the middle of the outline, curves included", () => {
    expect(sketchOutlineCentre(rectangle(20, 10))).toEqual({ x: 10, z: 5 });
    // Die rechte Kante als Halbkreis nach aussen (Woelbung 5 mm): Der Kasten
    // reicht bis 25, die Mitte liegt bei 12,5. Ein flacher Bogen wird nur
    // abgetastet: bei 1 mm Woelbung 10,4897 statt 10,5.
    const bulged = sketchOutlineCentre(rectangle(20, 10, -5))!;
    expect(bulged.x).toBeCloseTo(12.5, 6);
    expect(bulged.z).toBeCloseTo(5, 6);
    expect(sketchOutlineCentre({ points: [], segments: [] } as SketchProfile)).toBeNull();
  });

  it("moves by half of what the outline grew, so the untouched side stays", () => {
    const existing = extrusion({ x: 100, z: 50, elevation: 0 });
    const placed = placeSketchExtrusion(
      extrusion({ width: 30 }),
      placementWorkplaneFromSurface({ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 1, y: 0, z: 0 }),
      existing,
      { previous: sketchOutlineCentre(rectangle(20, 10)), next: sketchOutlineCentre(rectangle(30, 10)) },
    );
    // Breite 20 -> 30 nach rechts: Mitte 10 -> 15. Die linke Kante lag bei
    // 100 - 10 = 90 und liegt jetzt bei 105 - 15 = 90.
    expect(placed.x).toBeCloseTo(105, 9);
    expect(placed.z).toBeCloseTo(50, 9);
    expect(placed.elevation).toBeCloseTo(0, 9);
  });

  it("turns the shift with the body", () => {
    const shift = { previous: { x: 10, z: 5 }, next: { x: 15, z: 5 } };
    // Um die Hochachse gedreht: Was in der Skizze nach rechts geht, geht in der Welt nach hinten.
    const turned = editedSketchShift(extrusion({ rotation: 90 }), shift.previous, shift.next);
    expect(turned.x).toBeCloseTo(0, 9);
    expect(turned.z).toBeCloseTo(-5, 9);
    // Gespiegelt: nach links.
    expect(editedSketchShift(extrusion({ mirrorX: true }), shift.previous, shift.next).x).toBeCloseTo(-5, 9);
    // Auf einer stehenden Flaeche (um X gekippt) wandert eine Verschiebung in z in die Hoehe.
    const standing = editedSketchShift(extrusion({ rotationX: 90 }), { x: 0, z: 0 }, { x: 0, z: 5 });
    expect(standing.y).toBeCloseTo(-5, 9);
    expect(standing.z).toBeCloseTo(0, 9);
  });

  it("stays put when nothing about the middle changed or nothing could be measured", () => {
    expect(editedSketchShift(extrusion({ rotation: 33 }), { x: 4, z: 4 }, { x: 4, z: 4 })).toEqual({ x: 0, y: 0, z: 0 });
    expect(editedSketchShift(extrusion(), null, { x: 4, z: 4 })).toEqual({ x: 0, y: 0, z: 0 });
  });
});
