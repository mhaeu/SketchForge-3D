import { describe, expect, it } from "vitest";
import type { WorkplaneShape } from "@/types/sketchforge";
import {
  canonicalizeShape,
  cloneWorkplaneShapeTreeWithFreshIds,
  cleanNearZero,
  cleanRotationDegrees,
  fallbackSolidColor,
  meshYawDegrees,
  mirroredAxisCount,
  mirrorSign,
  linkedResizeAxisCount,
  normalizeShapeOpacity,
  shapeEdgeTreatmentLimit,
  shapeFootprintIsRadial,
  linkedResizeValues,
  NO_LINKED_RESIZE_AXES,
  normalizeDegrees,
  proportionalResizeScale,
  resizeAxisIsLinked,
  preservesEdgeTreatmentSize,
  resizedImportedCoordinates,
  resizedImportedMeshPositions,
  resizedShapeSize,
  serializeShapesForSync,
  shapeDepth,
  shapeHasTaper,
  shapeOverallFootprintDimensions,
  shapeTransformShouldRemainEditable,
  shapeTaperDimensions,
  shapeTaperScaleAt,
  shapeWidth,
  withHoleMode,
  workplaneShapesEqual,
} from "@/lib/workplaneShapes";

function shape(overrides: Partial<WorkplaneShape> = {}): WorkplaneShape {
  return {
    id: "box-1",
    name: "Box",
    kind: "box",
    color: "#d41721",
    x: 0,
    z: 0,
    elevation: 0,
    size: 20,
    width: 20,
    depth: 20,
    height: 20,
    rotation: 0,
    locked: false,
    hidden: false,
    ...overrides,
  };
}

describe("workplane shape helpers", () => {
  it("normalizes and cleans rotations", () => {
    expect(normalizeDegrees(-90)).toBe(270);
    expect(normalizeDegrees(450)).toBe(90);
    expect(cleanRotationDegrees(Number.NaN)).toBe(0);
    expect(cleanRotationDegrees(-0.2)).toBe(0);
    expect(cleanRotationDegrees(359.8)).toBe(0);
    expect(cleanRotationDegrees(12.34)).toBe(12.3);
  });

  it("preserves the meaningful yaw of low-sided circular primitives", () => {
    const triangularPrism = shape({ kind: "cylinder", width: 10, depth: 10, sides: 3 });

    expect(meshYawDegrees({ ...triangularPrism, rotation: 30 })).toBeCloseTo(30);
    expect(meshYawDegrees({ ...triangularPrism, rotation: 150 })).toBeCloseTo(30);
    expect(meshYawDegrees({ ...triangularPrism, rotation: 90 })).toBeCloseTo(-30);
    expect(meshYawDegrees({ ...triangularPrism, width: 12, rotation: 150 })).toBe(150);
    expect(meshYawDegrees({ ...triangularPrism, kind: "box", rotation: 30 })).toBe(30);
    expect(meshYawDegrees({ ...triangularPrism, sides: 96, rotation: 90 })).toBe(0);
  });

  it("cleans near-zero values and derives dimensions", () => {
    const base = shape({ size: 30, width: 18, depth: 24 });
    expect(cleanNearZero(0.004)).toBe(0);
    expect(cleanNearZero(0.006)).toBe(0.006);
    expect(shapeWidth(base)).toBe(18);
    expect(shapeDepth(base)).toBe(24);
    expect(resizedShapeSize(18, 24)).toBe(24);
  });

  it("uses proportional scale instead of square dimensions while shift-resizing", () => {
    expect(proportionalResizeScale(50, 100, 100, 150)).toBe(2);
    expect(proportionalResizeScale(50, 100, 60, 200)).toBe(2);
    expect(proportionalResizeScale(50, 100, 25, 80)).toBe(0.5);
  });

  it("interpolates actual top and bottom taper dimensions while excluding gears", () => {
    const tapered = shape({
      taperBottomWidth: 10,
      taperBottomDepth: 5,
      taperTopWidth: 30,
      taperTopDepth: 40,
    });
    expect(shapeTaperDimensions(tapered)).toEqual({ topWidth: 30, topDepth: 40, bottomWidth: 10, bottomDepth: 5 });
    expect(shapeOverallFootprintDimensions(tapered)).toEqual({ width: 30, depth: 40 });
    expect(shapeHasTaper(tapered)).toBe(true);
    expect(shapeTaperScaleAt(tapered, 0, "width")).toBe(0.5);
    expect(shapeTaperScaleAt(tapered, 0.5, "width")).toBe(1);
    expect(shapeTaperScaleAt(tapered, 1, "width")).toBe(1.5);
    expect(shapeTaperScaleAt(tapered, 0, "depth")).toBe(0.25);
    expect(shapeTaperScaleAt(tapered, 0.5, "depth")).toBe(1.125);
    expect(shapeTaperScaleAt(tapered, 1, "depth")).toBe(2);

    const legacy = shape({ taperBottomScale: 0.5, taperTopScale: 1.5 });
    expect(shapeTaperDimensions(legacy)).toEqual({ topWidth: 30, topDepth: 30, bottomWidth: 10, bottomDepth: 10 });

    const gear = shape({ kind: "gear", taperBottomWidth: 10, taperTopWidth: 30 });
    expect(shapeHasTaper(gear)).toBe(false);
    expect(shapeTaperScaleAt(gear, 0.5, "width")).toBe(1);
    expect(shapeTaperScaleAt(gear, 0.5, "depth")).toBe(1);
  });

  it("canonicalizes mirror flags and nested group rotations", () => {
    const canonical = canonicalizeShape(
      shape({
        rotation: 360,
        rotationX: -0.1,
        rotationZ: 45.04,
        mirrorX: false,
        mirrorY: true,
        groupedShapes: [shape({ id: "child", rotation: 720, mirrorZ: false })],
      }),
    );

    expect(canonical.rotation).toBe(0);
    expect(canonical.rotationX).toBe(0);
    expect(canonical.rotationZ).toBe(45);
    expect(canonical.mirrorX).toBeUndefined();
    expect(canonical.mirrorY).toBe(true);
    expect(canonical.groupedShapes?.[0].rotation).toBe(0);
    expect(canonical.groupedShapes?.[0].mirrorZ).toBeUndefined();
  });

  it("keeps rotated groups editable so they can still be ungrouped", () => {
    const child = shape({ id: "child" });
    const group = shape({
      id: "group",
      kind: "mesh",
      rotation: 45,
      groupedBaseWidth: 20,
      groupedBaseDepth: 20,
      groupedBaseHeight: 20,
      groupedShapes: [child],
    });

    expect(shapeTransformShouldRemainEditable(group)).toBe(true);
    expect(shapeTransformShouldRemainEditable(shape({ rotation: 45 }))).toBe(false);
    expect(canonicalizeShape(group)).toMatchObject({
      rotation: 45,
      groupedBaseWidth: 20,
      groupedBaseDepth: 20,
      groupedBaseHeight: 20,
      groupedShapes: [{ id: "child" }],
    });
  });

  it("assigns fresh object IDs throughout duplicated group trees", () => {
    const original = shape({
      id: "outer-group",
      kind: "mesh",
      x: 14,
      z: -9,
      elevation: 3,
      groupedShapes: [
        shape({ id: "round-roof-child", kind: "roundRoof" }),
        shape({
          id: "nested-group",
          kind: "mesh",
          groupedShapes: [shape({ id: "nested-box" })],
        }),
      ],
    });

    const duplicate = cloneWorkplaneShapeTreeWithFreshIds(original, "copy");
    const collectIds = (entry: WorkplaneShape): string[] => [
      entry.id,
      ...(entry.groupedShapes ?? []).flatMap(collectIds),
    ];
    const originalIds = collectIds(original);
    const duplicateIds = collectIds(duplicate);

    expect(new Set(duplicateIds).size).toBe(duplicateIds.length);
    expect(duplicateIds.every((id) => !originalIds.includes(id))).toBe(true);
    expect(duplicate).toMatchObject({ x: 14, z: -9, elevation: 3 });
    expect(original.groupedShapes?.[0].id).toBe("round-roof-child");
    expect(duplicate.groupedShapes?.[0].kind).toBe("roundRoof");
  });

  it("keeps shallow equality strict for shape payload references", () => {
    const importedMesh = { positions: [0, 0, 0], baseWidth: 1, baseDepth: 1, baseHeight: 1, triangleCount: 0, sourceFormat: "json" as const };
    const first = shape({ importedMesh });
    const sameReference = shape({ importedMesh });
    const sameValues = shape({ importedMesh: { ...importedMesh, positions: [...importedMesh.positions] } });

    expect(workplaneShapesEqual(first, sameReference)).toBe(true);
    expect(workplaneShapesEqual(first, sameValues)).toBe(false);
  });

  it("serializes canonical shapes for sync", () => {
    expect(JSON.parse(serializeShapesForSync([shape({ rotation: 359.9, mirrorX: false })]))).toEqual([
      expect.objectContaining({
        id: "box-1",
        rotation: 0,
        rotationX: 0,
        rotationZ: 0,
      }),
    ]);
  });

  it("maps helper flags and fallback colors", () => {
    expect(mirrorSign(true)).toBe(-1);
    expect(mirrorSign(false)).toBe(1);
    expect(mirroredAxisCount(shape({ mirrorX: true, mirrorY: true }))).toBe(2);
    expect(fallbackSolidColor(shape({ kind: "sphere" }))).toBe("#0098c7");
    expect(fallbackSolidColor(shape({ kind: "box" }))).toBe("#d41721");
  });

  it("applies an explicitly selected group color to every nested child", () => {
    const grouped = shape({
      kind: "mesh",
      color: "#111111",
      groupedShapes: [
        shape({ id: "child-box", color: "#222222" }),
        shape({
          id: "child-group",
          kind: "mesh",
          color: "#333333",
          groupedShapes: [shape({ id: "grandchild", kind: "sphere", color: "#444444" })],
        }),
      ],
    });

    const recolored = withHoleMode(grouped, false, "#12abef");

    expect(recolored.color).toBe("#12abef");
    expect(recolored.groupedShapes?.map((child) => child.color)).toEqual(["#12abef", "#12abef"]);
    expect(recolored.groupedShapes?.[1].groupedShapes?.[0].color).toBe("#12abef");
    expect(grouped.groupedShapes?.[0].color).toBe("#222222");
  });

  it("preserves the selected solid color while toggling hole mode", () => {
    const colored = shape({ color: "#35a86b" });
    const hole = withHoleMode(colored, true);
    const solid = withHoleMode(hole, false);

    expect(hole.hole).toBe(true);
    expect(hole.color).toBe("#35a86b");
    expect(solid.hole).toBe(false);
    expect(solid.color).toBe("#35a86b");
  });

  it("can resize the body while preserving fillet and chamfer boundary distances", () => {
    const modified = shape({
      kind: "mesh",
      width: 40,
      depth: 20,
      height: 40,
      edgeResizeMode: "preserve",
      edgeTreatments: [{ kind: "fillet", amount: 1, edgeCount: 1 }],
      importedMesh: {
        positions: [-10, 0, 0, -9, 1, 0, 0, 10, 0, 9, 19, 0, 10, 20, 0],
        baseWidth: 20,
        baseDepth: 20,
        baseHeight: 20,
        triangleCount: 1,
        sourceFormat: "json",
      },
    });

    expect(preservesEdgeTreatmentSize(modified)).toBe(true);
    expect(resizedImportedMeshPositions(modified)).toEqual([
      -20, 0, 0,
      -19, 1, 0,
      0, 20, 0,
      19, 39, 0,
      20, 40, 0,
    ]);
    expect(resizedImportedMeshPositions({ ...modified, edgeResizeMode: "scale" })[3]).toBe(-18);
    expect(resizedImportedCoordinates(modified, [-9, 1, 0, 9, 19, 0])).toEqual([-19, 1, 0, 19, 39, 0]);
  });

  it("uses child edge features when preserving the size of grouped treatments", () => {
    const grouped = shape({
      kind: "mesh",
      edgeResizeMode: "preserve",
      importedMesh: {
        positions: [-10, 0, 0, -8, 2, 0, 8, 18, 0, 10, 20, 0],
        baseWidth: 20,
        baseDepth: 20,
        baseHeight: 20,
        triangleCount: 1,
        sourceFormat: "json",
      },
      groupedShapes: [shape({ edgeTreatments: [{ kind: "fillet", amount: 2, edgeCount: 1 }] })],
      width: 40,
      height: 40,
    });

    expect(preservesEdgeTreatmentSize(grouped)).toBe(true);
    expect(resizedImportedMeshPositions(grouped)).toEqual([-20, 0, 0, -18, 2, 0, 18, 38, 0, 20, 40, 0]);
  });
});

describe("linked resize axes", () => {
  const bounds = { min: 0.1, max: 160 };
  const current = { width: 20, depth: 10, height: 40 };

  it("treats a lone checked axis as unlinked", () => {
    const lone = { ...NO_LINKED_RESIZE_AXES, width: true };
    expect(linkedResizeAxisCount(lone)).toBe(1);
    expect(resizeAxisIsLinked("width", lone)).toBe(false);
    expect(linkedResizeValues(current, "width", 30, lone, bounds)).toEqual({ width: 30 });
  });

  it("leaves an unlinked axis out of a link group", () => {
    const linked = { width: true, depth: true, height: false };
    expect(linkedResizeValues(current, "height", 80, linked, bounds)).toEqual({ height: 80 });
  });

  it("scales every linked axis by the edited axis's factor", () => {
    const linked = { width: true, depth: true, height: false };
    expect(linkedResizeValues(current, "width", 30, linked, bounds)).toEqual({ width: 30, depth: 15 });
  });

  it("carries all three axes when all are linked", () => {
    const linked = { width: true, depth: true, height: true };
    expect(linkedResizeValues(current, "depth", 5, linked, bounds)).toEqual({ width: 10, depth: 5, height: 20 });
  });

  it("clamps the shared factor so a bounded axis cannot break the ratio", () => {
    const linked = { width: true, depth: true, height: true };
    // height would land at 400, past the 160 cap, so the whole group stops at
    // the factor height can still take (4x) instead of height alone stopping.
    const next = linkedResizeValues(current, "width", 200, linked, bounds);
    expect(next).toEqual({ width: 80, depth: 40, height: 160 });
    expect(next.width! / next.depth!).toBeCloseTo(current.width / current.depth);
    expect(next.height! / next.width!).toBeCloseTo(current.height / current.width);
  });

  it("clamps at the lower bound the same way", () => {
    const linked = { width: true, depth: true, height: true };
    // depth is the smallest axis, so it is the one that reaches the 0.1 floor
    // first and caps the shared factor for the whole group.
    const next = linkedResizeValues(current, "depth", 0.001, linked, bounds);
    expect(next.depth).toBeCloseTo(0.1);
    expect(next.width).toBeCloseTo(0.2);
    expect(next.height).toBeCloseTo(0.4);
  });

  it("ignores degenerate input instead of producing NaN", () => {
    const linked = { width: true, depth: true, height: true };
    expect(linkedResizeValues(current, "width", Number.NaN, linked, bounds)).toEqual({});
    expect(linkedResizeValues({ ...current, width: 0 }, "width", 10, linked, bounds)).toEqual({ width: 10 });
  });
});

describe("edge treatment limit", () => {
  it("bounds a radial shape by its radius, not its diameter", () => {
    // A chamfer wider than the radius would have to cut past the axis. OCCT
    // still calls the result a valid solid, so the bound has to come from here.
    expect(shapeFootprintIsRadial(shape({ kind: "cylinder" }))).toBe(true);
    expect(shapeEdgeTreatmentLimit(shape({ kind: "cylinder" }))).toBe(10);
    expect(shapeEdgeTreatmentLimit(shape({ kind: "cone" }))).toBe(10);
    expect(shapeEdgeTreatmentLimit(shape({ kind: "sphere" }))).toBe(10);
  });

  it("bounds a box by its edge length", () => {
    expect(shapeFootprintIsRadial(shape({ kind: "box" }))).toBe(false);
    expect(shapeEdgeTreatmentLimit(shape({ kind: "box" }))).toBe(20);
  });

  it("still takes the height when it is the smaller side", () => {
    expect(shapeEdgeTreatmentLimit(shape({ kind: "cylinder", height: 6 }))).toBe(6);
    expect(shapeEdgeTreatmentLimit(shape({ kind: "box", height: 6 }))).toBe(6);
  });
});

describe("shape opacity", () => {
  it("clamps to a still-visible range and drops a fully opaque value", () => {
    // Absent means opaque, so the material cache keeps one entry for the
    // common case instead of one per rounding of 1.
    expect(normalizeShapeOpacity(undefined)).toBeUndefined();
    expect(normalizeShapeOpacity(1)).toBeUndefined();
    expect(normalizeShapeOpacity(0.9995)).toBeUndefined();
    expect(normalizeShapeOpacity(Number.NaN)).toBeUndefined();
    expect(normalizeShapeOpacity(0)).toBe(0.05);
    expect(normalizeShapeOpacity(-2)).toBe(0.05);
    expect(normalizeShapeOpacity(5)).toBeUndefined();
    expect(normalizeShapeOpacity(0.4)).toBe(0.4);
  });

  it("canonicalizes and compares the value", () => {
    expect(canonicalizeShape(shape({ opacity: 1 })).opacity).toBeUndefined();
    expect(canonicalizeShape(shape({ opacity: 0.42 })).opacity).toBe(0.42);
    expect(workplaneShapesEqual(shape({ opacity: 0.4 }), shape({ opacity: 0.4 }))).toBe(true);
    expect(workplaneShapesEqual(shape({ opacity: 0.4 }), shape({ opacity: 0.5 }))).toBe(false);
    // workplaneShapesEqual compares raw shapes, so 1 and absent differ until
    // canonicalizeShape has folded them together - same as the mirror flags.
    expect(workplaneShapesEqual(shape({ opacity: 1 }), shape({}))).toBe(false);
    expect(workplaneShapesEqual(canonicalizeShape(shape({ opacity: 1 })), canonicalizeShape(shape({})))).toBe(true);
  });
});
