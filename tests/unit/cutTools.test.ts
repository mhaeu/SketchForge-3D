import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { boreCutShape, cutReachForShapes, flippedWorkplane, shapeHasBore, shapesInClickOrder, workplaneCutBox } from "@/lib/cutTools";
import type { PlacementWorkplane } from "@/lib/placementWorkplane";
import type { WorkplaneShape } from "@/types/sketchforge";

let counter = 0;
const createId = (prefix: string) => `${prefix}-${counter++}`;

/** Die Hauptarbeitsebene: waagerecht, Nullpunkt im Ursprung. */
const base: PlacementWorkplane = {
  origin: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 1, z: 0 },
  xAxis: { x: 1, y: 0, z: 0 },
  zAxis: { x: 0, y: 0, z: 1 },
};

/** Eine senkrechte Ebene, die auf zehn in der Breite steht. */
const upright: PlacementWorkplane = {
  origin: { x: 10, y: 0, z: 0 },
  normal: { x: 1, y: 0, z: 0 },
  xAxis: { x: 0, y: 0, z: 1 },
  zAxis: { x: 0, y: 1, z: 0 },
};

/** Die acht Ecken eines Koerpers, so wie ihn die Ansicht hinstellt. */
function corners(shape: WorkplaneShape) {
  const width = shape.width ?? shape.size;
  const depth = shape.depth ?? shape.size;
  const height = shape.height;
  const matrix = new THREE.Matrix4()
    .makeTranslation(shape.x, (shape.elevation ?? 0) + height / 2, shape.z)
    .multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(
      THREE.MathUtils.degToRad(shape.rotationX ?? 0),
      THREE.MathUtils.degToRad(shape.rotation ?? 0),
      THREE.MathUtils.degToRad(shape.rotationZ ?? 0),
      "XYZ",
    )))
    .multiply(new THREE.Matrix4().makeTranslation(0, -height / 2, 0));
  const points: THREE.Vector3[] = [];
  [-1, 1].forEach((sx) => [0, 1].forEach((sy) => [-1, 1].forEach((sz) => {
    points.push(new THREE.Vector3(sx * width / 2, sy * height, sz * depth / 2).applyMatrix4(matrix));
  })));
  return points;
}

/** Wie weit ein Punkt vor der Ebene liegt, laengs ihrer Normalen. */
function beyond(plane: PlacementWorkplane, point: THREE.Vector3) {
  return point.clone().sub(new THREE.Vector3(plane.origin.x, plane.origin.y, plane.origin.z))
    .dot(new THREE.Vector3(plane.normal.x, plane.normal.y, plane.normal.z));
}

describe("Der Schnittquader an der Arbeitsebene", () => {
  it("steht mit seiner Grundflaeche genau in der Ebene", () => {
    // Sonst bliebe entweder ein Span stehen oder es wuerde ueber die Ebene
    // hinaus geschnitten - beides sieht man erst am fertigen Teil.
    const box = workplaneCutBox(base, "above", 100, createId);
    const distances = corners(box).map((point) => beyond(base, point));
    expect(Math.min(...distances)).toBeCloseTo(0, 6);
    expect(Math.max(...distances)).toBeGreaterThan(50);
  });

  it("nimmt auf Wunsch die andere Seite", () => {
    const box = workplaneCutBox(base, "below", 100, createId);
    const distances = corners(box).map((point) => beyond(base, point));
    expect(Math.max(...distances)).toBeCloseTo(0, 6);
    expect(Math.min(...distances)).toBeLessThan(-50);
  });

  it("steht auch auf einer senkrechten Ebene richtig", () => {
    // Die Arbeitsebene kann auf jeder Flaeche liegen; der Schnitt muss ihr
    // folgen und nicht der Hauptebene.
    for (const side of ["above", "below"] as const) {
      const box = workplaneCutBox(upright, side, 80, createId);
      const plane = side === "above" ? upright : flippedWorkplane(upright);
      const distances = corners(box).map((point) => beyond(plane, point));
      expect(Math.min(...distances)).toBeCloseTo(0, 6);
      expect(Math.max(...distances)).toBeGreaterThan(40);
    }
  });

  it("deckt quer zur Ebene mehr ab als er tief ist", () => {
    // Quer muss er ueber alles hinausragen, was geschnitten wird - sonst
    // bleibt neben dem Schnitt ein Rest stehen.
    const box = workplaneCutBox(base, "above", 100, createId);
    expect(box.width).toBeGreaterThan(box.height);
    expect(box.depth).toBeGreaterThan(box.height);
  });

  it("ist eine Aussparung und kein Koerper", () => {
    expect(workplaneCutBox(base, "above", 100, createId).hole).toBe(true);
  });

  it("reicht ueber alles hinaus, was mitgeschnitten wird", () => {
    const far = { id: "a", kind: "box", x: 120, z: -40, elevation: 30, width: 20, depth: 20, height: 20, size: 20 } as WorkplaneShape;
    const reach = cutReachForShapes([far]);
    expect(reach).toBeGreaterThan(Math.hypot(120, 40, 40) + 20);
    // Und auch bei einem winzigen Koerper bleibt er brauchbar gross.
    expect(cutReachForShapes([{ ...far, x: 0, z: 0, elevation: 0, width: 1, depth: 1, height: 1, size: 1 } as WorkplaneShape])).toBeGreaterThanOrEqual(50);
  });
});

describe("Der Innenraum eines Rohrs", () => {
  const tube = {
    id: "t", name: "Rohr", kind: "tube", color: "#fff", x: 4, z: -3, elevation: 2,
    width: 20, depth: 20, height: 40, size: 20, rotation: 30, bevel: 3,
  } as WorkplaneShape;

  it("ist der Koerper, um zweimal die Wandstaerke schmaler", () => {
    const bore = boreCutShape(tube, createId)!;
    expect(bore.width).toBeCloseTo(14, 9);
    expect(bore.depth).toBeCloseTo(14, 9);
    expect(bore.height).toBeCloseTo(40, 9);
  });

  it("sitzt an derselben Stelle und ist genauso gedreht", () => {
    // Damit er auch in einem schraeg steckenden Rohr passt.
    const bore = boreCutShape(tube, createId)!;
    expect([bore.x, bore.z, bore.elevation]).toEqual([4, -3, 2]);
    expect(bore.rotation).toBe(30);
  });

  it("ist eine Aussparung und rund", () => {
    const bore = boreCutShape(tube, createId)!;
    expect(bore.hole).toBe(true);
    expect(bore.kind).toBe("ellipse");
  });

  it("nimmt dieselbe Begrenzung der Wandstaerke wie das Netz des Rohrs", () => {
    // Eine Wandstaerke dicker als der halbe Durchmesser gaebe sonst einen
    // Innenraum mit negativer Breite.
    const bore = boreCutShape({ ...tube, bevel: 40 } as WorkplaneShape, createId)!;
    expect(bore.width).toBeCloseTo(0.2, 9);
  });

  it("erkennt ein gedrehtes Rohr an seinem parametrischen Ursprung", () => {
    /*
     * Ein Rohr, das durch etwas hindurchgesteckt wird, ist fast immer
     * gedreht - und beim Drehen wird es in ein Netz gebacken: Seine Art
     * heisst danach "mesh", seine Masse sind die des Kastens um die gedrehte
     * Form, und seine Drehung steht auf null. Ohne den Ursprung blieb der
     * Knopf dann grau, obwohl beide Koerper markiert waren.
     */
    const baked = {
      ...tube,
      kind: "mesh",
      rotation: 0,
      rotationX: 0,
      rotationZ: 0,
      // Um neunzig Grad gekippt liegt das Rohr flach: vierzig breit, zwanzig hoch.
      width: 20,
      depth: 40,
      height: 20,
      elevation: 5,
      importedMesh: { positions: [], triangleCount: 0 },
      parametricSource: { kind: "tube", width: 20, depth: 20, height: 40, size: 20, rotation: 0, rotationX: 90, rotationZ: 0 },
    } as unknown as WorkplaneShape;
    expect(shapeHasBore(baked)).toBe(true);
    const bore = boreCutShape(baked, createId)!;
    // Masse und Drehung kommen aus dem Ursprung, nicht aus dem Kasten.
    expect(bore.width).toBeCloseTo(14, 9);
    expect(bore.depth).toBeCloseTo(14, 9);
    expect(bore.height).toBeCloseTo(40, 9);
    expect(bore.rotationX).toBe(90);
    // Und er sitzt mit seiner Mitte genau dort, wo das Rohr seine hat.
    expect(bore.x).toBe(baked.x);
    expect(bore.z).toBe(baked.z);
    expect((bore.elevation ?? 0) + bore.height / 2).toBeCloseTo((baked.elevation ?? 0) + baked.height / 2, 9);
  });

  it("nimmt kein Ergebnis einer Verschneidung fuer ein Rohr", () => {
    // Was schon verrechnet wurde, traegt zwar noch seinen Ursprung, ist aber
    // nicht mehr das Rohr, das er beschreibt.
    const combined = {
      ...tube,
      kind: "mesh",
      groupedShapes: [{ id: "x" }],
      parametricSource: { kind: "tube", width: 20, depth: 20, height: 40, size: 20, rotation: 0, rotationX: 0, rotationZ: 0 },
    } as unknown as WorkplaneShape;
    expect(shapeHasBore(combined)).toBe(false);
  });

  it("gilt nur fuer Arten, deren Innenraum sich ausrechnen laesst", () => {
    expect(shapeHasBore(tube)).toBe(true);
    expect(shapeHasBore({ ...tube, kind: "ring" } as WorkplaneShape)).toBe(true);
    expect(shapeHasBore({ ...tube, kind: "cylinder" } as WorkplaneShape)).toBe(false);
    // Ein eingelesenes Netz hat keine Wandstaerke, die man lesen koennte.
    expect(shapeHasBore({ ...tube, kind: "mesh", importedMesh: { positions: [], triangleCount: 0 } } as unknown as WorkplaneShape)).toBe(false);
    expect(boreCutShape({ ...tube, kind: "cylinder" } as WorkplaneShape, createId)).toBeNull();
  });
});

describe("Die Reihenfolge der Auswahl", () => {
  const shapes = [{ id: "alt" }, { id: "neu" }, { id: "neuer" }];

  it("folgt dem Anklicken und nicht der Reihenfolge der Koerper", () => {
    /*
     * Die Liste der Koerper steht in der Reihenfolge, in der sie entstanden
     * sind. "Der zuletzt Ausgewaehlte" waere daraus gelesen der zuletzt
     * gebaute - und dann schnitt beim buendigen Abschneiden oft der falsche.
     */
    const chosen = shapes.filter((shape) => shape.id !== "neu");
    expect(shapesInClickOrder(chosen, ["neuer", "alt"]).map((shape) => shape.id)).toEqual(["neuer", "alt"]);
    expect(shapesInClickOrder(chosen, ["alt", "neuer"]).map((shape) => shape.id)).toEqual(["alt", "neuer"]);
  });

  it("laesst die Reihenfolge, wo das Anklicken nichts sagt", () => {
    // Ein aufgezogener Rahmen nennt keine Reihenfolge; dann bleibt es bei der
    // vorhandenen, statt zu wuerfeln.
    expect(shapesInClickOrder(shapes, []).map((shape) => shape.id)).toEqual(["alt", "neu", "neuer"]);
  });
});
