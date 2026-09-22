import { describe, expect, it } from "vitest";
import { sketchEditWorkplane } from "@/lib/sketchEditPlane";
import { canonicalizeShape } from "@/lib/workplaneShapes";
import type { WorkplaneShape } from "@/types/sketchforge";

const PROFILE = {
  points: [
    { id: "a", x: -10, z: -10, mode: "corner" },
    { id: "b", x: 10, z: -10, mode: "corner" },
    { id: "c", x: 10, z: 10, mode: "corner" },
    { id: "d", x: -10, z: 10, mode: "corner" },
  ],
  segments: [
    { id: "s1", startId: "a", endId: "b", kind: "line" },
    { id: "s2", startId: "b", endId: "c", kind: "line" },
    { id: "s3", startId: "c", endId: "d", kind: "line" },
    { id: "s4", startId: "d", endId: "a", kind: "line" },
  ],
};

function extrusion(overrides: Partial<WorkplaneShape> = {}): WorkplaneShape {
  return canonicalizeShape({
    id: "s1",
    name: "Skizzenkoerper",
    kind: "mesh",
    color: "#d41721",
    x: 0,
    z: 0,
    elevation: 0,
    size: 20,
    width: 20,
    depth: 20,
    height: 12,
    rotation: 0,
    rotationX: 0,
    rotationZ: 0,
    sketchProfile: PROFILE,
    sketchOperation: "extrude",
    ...overrides,
  } as WorkplaneShape);
}

/**
 * Ein Skizzenkoerper laesst sich nachtraeglich wieder aufmachen. Die Ebene
 * dafuer muss dort liegen, wo gezeichnet wurde - sonst geht die Skizze neben
 * ihrem eigenen Koerper auf.
 */
describe("die Ebene zum Nachbearbeiten einer Skizze", () => {
  it("legt sie auf die untere Stirnflaeche", () => {
    const plane = sketchEditWorkplane(extrusion())!;
    expect(plane.origin.y).toBeCloseTo(0, 6);
    expect(plane.normal.y).toBeCloseTo(1, 6);
  });

  it("holt Drehung und Hoehe aus der Urform, wenn der Koerper gedreht wurde", () => {
    /*
     * Der Fall aus der Werkstatt: drehen backt den Koerper in ein Netz, seine
     * Drehung steht danach auf null und seine Hoehe ist die des Rahmens um das
     * gedrehte Netz. Wer beides vom Datensatz nimmt, laesst die Skizze flach
     * und zu tief aufgehen.
     */
    const baked = extrusion({
      // Um 90 Grad um X gekippt: aus 12 mm Hoehe werden 20 mm Rahmenhoehe.
      height: 20,
      depth: 12,
      parametricSource: {
        kind: "mesh",
        width: 20,
        depth: 20,
        height: 12,
        size: 20,
        rotation: 0,
        rotationX: 90,
        rotationZ: 0,
      },
    });
    const plane = sketchEditWorkplane(baked)!;
    // Die Ebene steht jetzt senkrecht - ihre Normale zeigt nach vorn.
    expect(plane.normal.y).toBeCloseTo(0, 6);
    expect(Math.abs(plane.normal.z)).toBeCloseTo(1, 6);
    // Und sie liegt eine halbe Urform-Hoehe vor der Mitte, nicht eine halbe
    // Rahmenhoehe.
    const centre = { x: 0, y: 10, z: 0 };
    const distance = Math.hypot(plane.origin.x - centre.x, plane.origin.y - centre.y, plane.origin.z - centre.z);
    expect(distance).toBeCloseTo(6, 6);
  });

  it("verschiebt sie um die Mitte des Umrisses", () => {
    const offset = sketchEditWorkplane(extrusion({
      sketchProfile: {
        ...PROFILE,
        points: PROFILE.points.map((point) => ({ ...point, x: point.x + 30 })),
      },
    } as Partial<WorkplaneShape>))!;
    // Der Umriss sitzt 30 mm weiter rechts, also faengt die Ebene 30 mm
    // weiter links an - dann liegen seine Punkte wieder auf dem Koerper.
    expect(offset.origin.x).toBeCloseTo(-30, 6);
  });

  it("laesst einen Koerper ohne Umriss in Ruhe", () => {
    expect(sketchEditWorkplane(extrusion({ sketchProfile: undefined }))).toBeUndefined();
  });
});
