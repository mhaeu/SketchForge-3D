import { describe, expect, it } from "vitest";
import {
  bakeCadMetadataForShapeTransform,
  cadBrepTransformForShape,
  cadModifierPrimitiveForAnalyticBox,
  cadModifierPrimitiveForBakedShape,
  cadModifierPrimitiveForProfileShape,
} from "@/lib/cadBakeMetadata";
import { cadTransformRequiresGeneralTransform } from "@/lib/cadModifierRuntime";
import { knurlCorners } from "@/lib/knurlGeometry";
import type { WorkplaneShape } from "@/types/sketchforge";

function expectTransformClose(actual: number[] | undefined, expected: number[]) {
  expect(actual).toHaveLength(expected.length);
  expected.forEach((value, index) => {
    expect(actual?.[index]).toBeCloseTo(value, 6);
  });
}

function treatedMeshShape(overrides: Partial<WorkplaneShape> = {}): WorkplaneShape {
  return {
    id: "treated-mesh",
    name: "Treated Mesh",
    kind: "mesh",
    color: "#d41721",
    x: 10,
    z: 0,
    elevation: 5,
    size: 2,
    width: 2,
    depth: 2,
    height: 2,
    rotation: 0,
    rotationX: 0,
    rotationZ: 0,
    importedMesh: {
      positions: [-1, 0, 0, 1, 0, 0, 0, 2, 0],
      baseWidth: 2,
      baseDepth: 2,
      baseHeight: 2,
      triangleCount: 1,
      sourceFormat: "json",
    },
    edgeTreatments: [{ kind: "fillet", amount: 0.5, edgeCount: 1 }],
    cadDisplayEdges: [{ points: [-1, 0, 0, 1, 0, 0] }],
    cadDisplayEdgesVersion: 2,
    cadBrep: "stored-brep-before-rotation",
    cadBrepFrame: {
      x: 10,
      z: 0,
      elevation: 5,
      width: 2,
      depth: 2,
      height: 2,
    },
    locked: false,
    hidden: false,
    ...overrides,
  };
}

function boxShape(overrides: Partial<WorkplaneShape> = {}): WorkplaneShape {
  return {
    id: "box",
    name: "Box",
    kind: "box",
    color: "#d41721",
    x: 4,
    z: -6,
    elevation: 2,
    size: 20,
    width: 20,
    depth: 18,
    height: 16,
    rotation: 32,
    rotationX: 18,
    rotationZ: 24,
    locked: false,
    hidden: false,
    ...overrides,
  };
}

describe("SketchForge transform baking", () => {
  it("preserves exact BREP and rebases CAD display edges after wheel rotation", () => {
    const shape = treatedMeshShape({ rotationZ: 90 });
    const baked = bakeCadMetadataForShapeTransform(shape, {
      centerX: 10,
      minY: 5,
      centerZ: 0,
      width: 2,
      depth: 2,
      height: 2,
      yawDegrees: 0,
    });
    const expectedTransform = [0, -1, 0, 16, 1, 0, 0, -4, 0, 0, 1, 0];

    expect(baked.cadBrep).toBe("stored-brep-before-rotation");
    expect(baked.cadBrepFrame).toMatchObject({
      x: 10,
      z: 0,
      elevation: 5,
      width: 2,
      depth: 2,
      height: 2,
    });
    expectTransformClose(baked.cadBrepFrame?.sourceTransform, expectedTransform);
    expect(baked.cadDisplayEdgesVersion).toBe(2);
    expect(baked.cadDisplayEdges?.[0].points).toEqual([1, 0, 0, 1, 2, 0]);

    const bakedShape: WorkplaneShape = {
      ...shape,
      ...baked,
      x: 10,
      z: 0,
      elevation: 5,
      width: 2,
      depth: 2,
      height: 2,
      size: 2,
      rotation: 0,
      rotationX: 0,
      rotationZ: 0,
    };
    expectTransformClose(cadBrepTransformForShape(bakedShape), expectedTransform);
  });

  it("preserves an analytic box primitive when wheel rotation bakes it to a mesh", () => {
    const shape = boxShape();
    const directPrimitive = cadModifierPrimitiveForAnalyticBox(shape);
    expect(directPrimitive?.transform).toBeDefined();

    const baked = bakeCadMetadataForShapeTransform(shape, {
      centerX: 4.5,
      minY: -2,
      centerZ: -5.5,
      width: 27,
      depth: 26,
      height: 25,
      yawDegrees: 32,
    });

    expect(baked.cadPrimitiveFrame).toMatchObject({
      kind: "box",
      width: 20,
      depth: 18,
      height: 16,
      frame: {
        x: 4.5,
        z: -5.5,
        elevation: -2,
        width: 27,
        depth: 26,
        height: 25,
      },
    });
    expectTransformClose(baked.cadPrimitiveFrame?.frame.sourceTransform, directPrimitive?.transform ?? []);

    const bakedShape: WorkplaneShape = {
      ...shape,
      ...baked,
      kind: "mesh",
      x: 4.5,
      z: -5.5,
      elevation: -2,
      width: 27,
      depth: 26,
      height: 25,
      size: 27,
      rotation: 0,
      rotationX: 0,
      rotationZ: 0,
      importedMesh: {
        positions: [-1, 0, 0, 1, 0, 0, 0, 1, 0],
        baseWidth: 27,
        baseDepth: 26,
        baseHeight: 25,
        triangleCount: 1,
        sourceFormat: "json",
      },
    };
    const restoredPrimitive = cadModifierPrimitiveForBakedShape(bakedShape);
    expect(restoredPrimitive).toMatchObject({
      kind: "box",
      width: 20,
      depth: 18,
      height: 16,
    });
    expectTransformClose(restoredPrimitive?.transform, directPrimitive?.transform ?? []);
  });

  it("uses a general CAD transform after resizing a baked rotated box", () => {
    const shape = boxShape({
      x: 0,
      z: 0,
      elevation: 0,
      width: 20,
      depth: 20,
      height: 20,
      rotation: 45,
      rotationX: 0,
      rotationZ: 0,
    });
    const diagonal = Math.sqrt(20 ** 2 + 20 ** 2);
    const baked = bakeCadMetadataForShapeTransform(shape, {
      centerX: 0,
      minY: 0,
      centerZ: 0,
      width: diagonal,
      depth: diagonal,
      height: 20,
      yawDegrees: 45,
    });
    const resizedBakedShape: WorkplaneShape = {
      ...shape,
      ...baked,
      kind: "mesh",
      width: diagonal * 1.8,
      depth: diagonal * 0.75,
      height: 26,
      size: diagonal * 1.8,
      rotation: 0,
      rotationX: 0,
      rotationZ: 0,
      importedMesh: {
        positions: [-10, 0, -10, 10, 0, -10, 10, 20, 10],
        baseWidth: diagonal,
        baseDepth: diagonal,
        baseHeight: 20,
        triangleCount: 1,
        sourceFormat: "json",
      },
    };

    const restoredPrimitive = cadModifierPrimitiveForBakedShape(resizedBakedShape);
    expect(restoredPrimitive?.transform).toBeDefined();
    expect(cadTransformRequiresGeneralTransform(restoredPrimitive?.transform ?? [])).toBe(true);
  });
});

/**
 * Die Raendelung geht als hochgezogener Umriss in den Kern. Hier steht nur,
 * was dabei an Daten herauskommt - ob der Kern daraus denselben Koerper baut
 * wie das Netz, steht in tests/e2e/cadProfileSolid.e2e.ts.
 */
describe("Die Raendelung als Umriss fuer den Kern", () => {
  const knurl = (overrides: Partial<WorkplaneShape> = {}): WorkplaneShape => ({
    id: "k",
    name: "Raendelung",
    kind: "knurl",
    color: "#7a8a99",
    x: 0,
    z: 0,
    elevation: 0,
    size: 20,
    width: 20,
    depth: 20,
    height: 15,
    rotation: 0,
    knurlPattern: "straight",
    knurlCount: 30,
    knurlDepth: 0.6,
    knurlChamfer: 0.5,
    ...overrides,
  }) as WorkplaneShape;

  it("gibt den Ring aus Graten und Rillengruenden - dieselben Ecken wie das Netz", () => {
    const part = cadModifierPrimitiveForProfileShape(knurl());
    expect(part?.kind).toBe("profileExtrusion");
    if (part?.kind !== "profileExtrusion") return;
    // 30 Rillen, je ein Grat und ein Grund: 60 Ecken, also 120 Zahlen.
    expect(part.loop).toHaveLength(120);
    const corners = knurlCorners(20, 30, 0.6);
    expect(part.loop[0]).toBeCloseTo(Math.cos(corners[0].angle) * corners[0].radius, 9);
    expect(part.loop[1]).toBeCloseTo(Math.sin(corners[0].angle) * corners[0].radius, 9);
    expect(part.loop[2]).toBeCloseTo(Math.cos(corners[1].angle) * corners[1].radius, 9);
    expect(part.height).toBe(15);
    expect(part.capChamfer).toEqual({ radius: 10, size: 0.5 });
  });

  /**
   * Die Rillenzahl haengt am Durchmesser: Ein duenner Griff traegt weniger,
   * und der Umriss muss dieselbe Zahl nehmen wie das Netz - sonst waere der
   * genaue Koerper eine andere Form.
   */
  it("nimmt die Rillenzahl, die bei diesem Durchmesser erlaubt ist", () => {
    const part = cadModifierPrimitiveForProfileShape(knurl({ width: 6, size: 6, depth: 6, knurlCount: 120 }));
    if (part?.kind !== "profileExtrusion") throw new Error("kein Umriss");
    // Auf 6 mm passen 23 Rillen, nicht 120.
    expect(part.loop).toHaveLength(23 * 2 * 2);
  });

  /**
   * Ein gedrehter Koerper bringt seine Lage als Matrix mit - der Umriss selbst
   * steht immer im eigenen Rahmen der Form.
   */
  it("legt die Lage eines gedrehten Koerpers als Matrix dazu", () => {
    const upright = cadModifierPrimitiveForProfileShape(knurl());
    expect(upright?.kind === "profileExtrusion" && upright.transform).toBeUndefined();
    const turned = cadModifierPrimitiveForProfileShape(knurl({ rotationX: 90, x: 12 }));
    if (turned?.kind !== "profileExtrusion") throw new Error("kein Umriss");
    expect(turned.transform).toHaveLength(12);
    expect(turned.loop).toEqual(upright?.kind === "profileExtrusion" ? upright.loop : []);
  });
});
