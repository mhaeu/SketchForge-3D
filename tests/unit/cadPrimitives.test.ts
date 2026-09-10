import { describe, expect, it, beforeAll } from "vitest";
import { OcctKernel } from "occt-wasm";
import { cadModifierPrimitiveForRoundShape } from "@/lib/cadBakeMetadata";
import type { CadModifierPrimitivePart } from "@/lib/cadModifierTypes";
import type { WorkplaneShape } from "@/types/sketchforge";

// A round shape reaches the CAD worker as an analytic solid instead of its
// tessellation, because filleting the 96-edge ring of a prism produces invalid
// geometry (volume grows, the enclosed face disappears) long before the radius
// is geometrically impossible. That only holds up if the analytic solid
// occupies exactly the box the viewport draws - otherwise an edge treatment
// would silently move or resize the object.

let kernel: Awaited<ReturnType<typeof OcctKernel.init>>;
beforeAll(async () => {
  kernel = await OcctKernel.init();
});

// Mirrors buildPrimitiveSolid + applyCadTransform in cadModifier.worker.ts.
// BRepPrimAPI builds cylinders/cones along +Z and spheres centred on the
// origin; the primitive frame is the box's (base at y = 0, centred on x/z).
function buildSolid(primitive: CadModifierPrimitivePart) {
  const localFrame = (axisToY: boolean, liftY: number) => {
    const c = Math.cos(-Math.PI / 2);
    const s = Math.sin(-Math.PI / 2);
    return axisToY
      ? [1, 0, 0, 0, 0, c, -s, liftY, 0, s, c, 0]
      : [1, 0, 0, 0, 0, 1, 0, liftY, 0, 0, 1, 0];
  };
  let solid: number;
  if (primitive.kind === "box") {
    solid = kernel.makeBoxFromCorners(
      { x: -primitive.width / 2, y: 0, z: -primitive.depth / 2 },
      { x: primitive.width / 2, y: primitive.height, z: primitive.depth / 2 },
    );
  } else if (primitive.kind === "cylinder") {
    solid = kernel.transform(kernel.makeCylinder(primitive.radius, primitive.height), localFrame(true, 0));
  } else if (primitive.kind === "cone") {
    solid = kernel.transform(kernel.makeCone(primitive.baseRadius, primitive.topRadius, primitive.height), localFrame(true, 0));
  } else {
    solid = kernel.transform(kernel.makeSphere(primitive.radius), localFrame(false, primitive.radius));
  }
  return primitive.transform ? kernel.transform(solid, primitive.transform) : solid;
}

const baseShape = {
  id: "s", name: "s", color: "#fff", x: 0, z: 0, elevation: 0, rotation: 0, size: 20,
} as unknown as WorkplaneShape;

describe("analytic CAD primitives for round shapes", () => {
  const cases: Array<{ label: string; shape: WorkplaneShape; volume: number }> = [
    {
      label: "cylinder",
      shape: { ...baseShape, kind: "cylinder", width: 20, depth: 20, height: 20 },
      volume: Math.PI * 100 * 20,
    },
    {
      label: "cylinder placed off-origin and raised",
      shape: { ...baseShape, kind: "cylinder", width: 20, depth: 20, height: 20, x: 7, z: -3, elevation: 5 },
      volume: Math.PI * 100 * 20,
    },
    {
      label: "truncated cone",
      shape: { ...baseShape, kind: "cone", width: 20, depth: 20, height: 30, baseRadius: 10, topRadius: 4 },
      volume: (Math.PI * 30 / 3) * (100 + 40 + 16),
    },
    {
      label: "sphere",
      shape: { ...baseShape, kind: "sphere", width: 16, depth: 16, height: 16 },
      volume: (4 / 3) * Math.PI * 8 ** 3,
    },
  ];

  it.each(cases)("$label occupies exactly the box the viewport draws", ({ shape, volume }) => {
    const primitive = cadModifierPrimitiveForRoundShape(shape);
    expect(primitive).not.toBeNull();
    const solid = buildSolid(primitive!);
    const box = kernel.getBoundingBox(solid);

    const width = shape.width ?? shape.size;
    const depth = shape.depth ?? shape.size;
    expect(box.xmin).toBeCloseTo(shape.x - width / 2, 3);
    expect(box.xmax).toBeCloseTo(shape.x + width / 2, 3);
    expect(box.zmin).toBeCloseTo(shape.z - depth / 2, 3);
    expect(box.zmax).toBeCloseTo(shape.z + depth / 2, 3);
    expect(box.ymin).toBeCloseTo(shape.elevation ?? 0, 3);
    expect(box.ymax).toBeCloseTo((shape.elevation ?? 0) + shape.height, 3);
    expect(kernel.getVolume(solid)).toBeCloseTo(volume, 1);
  });

  it("leaves shapes without an analytic counterpart on the mesh path", () => {
    // A low side count is a prism the user can see, an unequal footprint is an
    // ellipse, and an unequal sphere axis is an ellipsoid - OCCT has a
    // primitive for none of them.
    expect(cadModifierPrimitiveForRoundShape({ ...baseShape, kind: "cylinder", width: 20, depth: 20, height: 20, sides: 8 })).toBeNull();
    expect(cadModifierPrimitiveForRoundShape({ ...baseShape, kind: "cylinder", width: 20, depth: 12, height: 20 })).toBeNull();
    expect(cadModifierPrimitiveForRoundShape({ ...baseShape, kind: "sphere", width: 20, depth: 20, height: 12 })).toBeNull();
    expect(cadModifierPrimitiveForRoundShape({ ...baseShape, kind: "box", width: 20, depth: 20, height: 20 })).toBeNull();
  });

  it("fillets the top edge past the radius that broke on the tessellated path", () => {
    const primitive = cadModifierPrimitiveForRoundShape({ ...baseShape, kind: "cylinder", width: 20, depth: 20, height: 20 });
    const solid = buildSolid(primitive!);
    const edges = kernel.getSubShapes(solid, "edge");
    const box = kernel.getBoundingBox(solid);
    const top = edges.filter((edge) => {
      const points = kernel.wireframe(edge, 0.05).points;
      if (points.length < 6) return false;
      for (let i = 1; i < points.length; i += 3) if (Math.abs(points[i] - box.ymax) > 1e-6) return false;
      return true;
    });
    expect(top.length).toBe(1); // one circle, not 96 near-tangent segments

    let previous = kernel.getVolume(solid);
    for (const radius of [4.0, 4.88, 6.0, 9.0]) {
      const filleted = kernel.fillet(solid, top, radius);
      expect(kernel.isValid(filleted), `radius ${radius}`).toBe(true);
      const volume = kernel.getVolume(filleted);
      // A convex fillet can only remove material, and more of it as it grows.
      expect(volume, `radius ${radius}`).toBeLessThan(previous);
      previous = volume;
      kernel.release(filleted);
    }
  });
});
