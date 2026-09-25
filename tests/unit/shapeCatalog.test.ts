import { describe, expect, it } from "vitest";
import type { ShapeAsset } from "@/types/sketchforge";
import { makeShapeFromAsset, sceneShape, toolbarShapeAssets } from "@/lib/shapeCatalog";
import { cadModifierPrimitiveForRoundShape } from "@/lib/cadBakeMetadata";
import { canonicalizeShape, isSolidShape, solidShapesOnly } from "@/lib/workplaneShapes";

describe("shape catalog", () => {
  it("does not expose removed decorative shapes in the toolbar catalog", () => {
    const kinds = toolbarShapeAssets.map((asset) => asset.kind);

    expect(kinds).not.toContain("star");
    expect(kinds).not.toContain("heart");
  });

  it("creates placed shapes from toolbar assets", () => {
    const asset: ShapeAsset = { id: "box", name: "Box", src: "box.png", kind: "box", color: "#d41721" };
    const placed = makeShapeFromAsset(asset, { x: 12, z: -8, elevation: 4 });

    expect(placed.id).toMatch(/^box-/);
    expect(placed).toMatchObject({
      name: "Box",
      kind: "box",
      color: "#d41721",
      x: 12,
      z: -8,
      elevation: 4,
      size: 20,
      width: 20,
      depth: 20,
      height: 20,
      radius: 0,
      steps: 10,
      locked: false,
      hidden: false,
    });
  });

  it("uses shape-specific defaults for text and round profiles", () => {
    const text = makeShapeFromAsset({ id: "text", name: "Text", src: "text.png", kind: "text", color: "#cf101b" });
    const torus = makeShapeFromAsset({ id: "torus", name: "Torus", src: "torus.png", kind: "torus", color: "#0098c7" });
    const gear = makeShapeFromAsset({ id: "gear", name: "Gear", src: "gear.svg", kind: "gear", color: "#6f7f8d" });

    expect(text).toMatchObject({ width: 86, depth: 28, height: 10, text: "TEXT", font: "Multilanguage" });
    expect(torus).toMatchObject({ size: 22, width: 22, depth: 22, height: 5 });
    expect(gear).toMatchObject({
      size: 30,
      width: 30,
      depth: 30,
      height: 6,
      teeth: 12,
      toothSize: 2.5,
      centerHoleSize: 6,
      gearType: "spur",
      helixAngle: 22.5,
      helixQuality: 16,
    });

    const loft = makeShapeFromAsset({ id: "loft", name: "Loft", src: "loft.svg", kind: "loft", color: "#5b5ce2" });
    expect(loft).toMatchObject({
      size: 24,
      width: 24,
      depth: 24,
      height: 28,
      loftBottomShape: "Rectangle",
      loftTopShape: "Oval",
      loftTopWidth: 24,
      loftTopDepth: 24,
      loftBottomRotation: 0,
      loftTopRotation: 0,
      loftSegments: 40,
      loftLayers: 24,
    });
  });

  it("applies only explicitly customized creation dimensions", () => {
    const asset: ShapeAsset = { id: "cone", name: "Cone", src: "cone.png", kind: "cone", color: "#6e2786" };
    const appDefault = makeShapeFromAsset(asset);
    const customized = makeShapeFromAsset(asset, undefined, { width: 320, depth: 240, height: 180 });

    expect(appDefault).toMatchObject({ width: 20, depth: 20, height: 20, baseRadius: 10 });
    expect(customized).toMatchObject({ width: 320, depth: 240, height: 180, size: 320, baseRadius: 160 });
  });

  it("applies shape-specific creation defaults only when customized", () => {
    const cone = makeShapeFromAsset(
      { id: "cone", name: "Cone", src: "cone.png", kind: "cone", color: "#6e2786" },
      undefined,
      { topRadius: 3, baseRadius: 18, sides: 48 },
    );
    const text = makeShapeFromAsset(
      { id: "text", name: "Text", src: "text.png", kind: "text", color: "#cf101b" },
      undefined,
      { text: "HELLO", font: "Serif", bevel: 2, segments: 6 },
    );
    const gear = makeShapeFromAsset(
      { id: "gear", name: "Gear", src: "gear.svg", kind: "gear", color: "#6f7f8d" },
      undefined,
      { gearType: "helical", teeth: 24, toothSize: 3, toothWidth: 2, centerHoleSize: 10, helixAngle: 30, helixQuality: 24 },
    );

    expect(cone).toMatchObject({ topRadius: 3, baseRadius: 18, sides: 48 });
    expect(text).toMatchObject({ text: "HELLO", font: "Serif", bevel: 2, segments: 6 });
    expect(gear).toMatchObject({ gearType: "helical", teeth: 24, toothSize: 3, toothWidth: 2, centerHoleSize: 10, helixAngle: 30, helixQuality: 24 });
  });

  it("creates canonical scene shapes with stable defaults", () => {
    const created = sceneShape({
      name: "Part",
      kind: "box",
      color: "#d41721",
      width: 12,
      depth: 18,
      rotation: 359.9,
      mirrorX: false,
    });

    expect(created.id).toMatch(/^shape-/);
    expect(created).toMatchObject({
      name: "Part",
      kind: "box",
      color: "#d41721",
      x: 0,
      z: 0,
      elevation: 0,
      width: 12,
      depth: 18,
      height: 20,
      size: 18,
      rotation: 0,
      locked: false,
      hidden: false,
    });
    expect(created.mirrorX).toBeUndefined();
  });
});

/**
 * The shapes brought over from Layerling. What matters here is that each one
 * arrives on the workplane as its own body rather than as a default box: with
 * its own footprint, its own parameters and - for the ruler - without being
 * counted as material.
 */
describe("shapes from the extended palette", () => {
  const assetFor = (kind: string) => {
    const asset = toolbarShapeAssets.find((entry) => entry.kind === kind);
    expect(asset).toBeDefined();
    return asset!;
  };

  it("offers every kind in the palette", () => {
    const kinds = toolbarShapeAssets.map((asset) => asset.kind);
    ["ellipse", "polygon", "thread", "spring", "ruler"].forEach((kind) => {
      expect(kinds).toContain(kind);
    });
  });

  it("gives the ellipse an unequal footprint so it is not a cylinder", () => {
    const shape = makeShapeFromAsset(assetFor("ellipse"));
    expect(shape.width).not.toBeCloseTo(shape.depth, 3);
    expect(shape.sides).toBe(96);
  });

  it("inserts the polygon as a regular hexagon", () => {
    const shape = makeShapeFromAsset(assetFor("polygon"));
    expect(shape.sides).toBe(6);
    // Across the corners a hexagon measures 2/sqrt(3) of its across-flats size.
    expect(Math.max(shape.width, shape.depth) / Math.min(shape.width, shape.depth)).toBeCloseTo(2 / Math.sqrt(3), 3);
  });

  it("gives the thread its standard footprint and a hex socket", () => {
    const shape = makeShapeFromAsset(assetFor("thread"));
    expect(shape.kind).toBe("thread");
    expect(shape.threadRole).toBe("rod");
    expect(shape.threadDrive).toBe("hex");
    expect(shape.threadDiameter).toBe(6);
    expect(shape.width).toBeCloseTo(6, 6);
    expect(shape.depth).toBeCloseTo(6, 6);
  });

  it("keeps a thread round when a handle pulls it out of shape", () => {
    const shape = makeShapeFromAsset(assetFor("thread"));
    const stretched = canonicalizeShape({ ...shape, width: shape.width * 2, depth: shape.depth });
    expect(stretched.width).toBeCloseTo(stretched.depth, 6);
    expect(stretched.threadDiameter).toBeGreaterThan(shape.threadDiameter!);
  });

  it("fits the spring's wire and turns into its size", () => {
    const shape = makeShapeFromAsset(assetFor("spring"));
    expect(shape.springTurns).toBeGreaterThan(0);
    expect(shape.springWire).toBeGreaterThan(0);
    expect(shape.springWire! * shape.springTurns!).toBeLessThan(shape.height);
  });

  /**
   * Die Kugel bekam Breite und Tiefe aus dem runden Profil (22), ihre Hoehe
   * aber aus der allgemeinen Vorgabe (20). Damit war jede frisch eingefuegte
   * Kugel ein Ellipsoid, und OpenCascade hat dafuer keinen Grundkoerper: Sie
   * fiel vom exakten Weg auf das Dreiecksnetz zurueck, und Verrundungen an
   * einer Kugelnaht wurden verbeult statt rund.
   */
  it("legt die Kugel so an, dass sie den exakten CAD-Weg auch trifft", () => {
    const sphere = makeShapeFromAsset(assetFor("sphere"));
    expect(sphere.width).toBe(sphere.height);
    expect(sphere.depth).toBe(sphere.height);

    const primitive = cadModifierPrimitiveForRoundShape(sphere);
    expect(primitive).not.toBeNull();
    expect(primitive!.kind).toBe("sphere");
    expect((primitive as { radius: number }).radius).toBeCloseTo(sphere.height / 2, 6);

    // Und eine von Hand gezogene Kugel bleibt richtigerweise draussen.
    expect(cadModifierPrimitiveForRoundShape({ ...sphere, height: sphere.height - 2 })).toBeNull();
  });

  it("keeps the ruler out of every solid operation", () => {
    const ruler = makeShapeFromAsset(assetFor("ruler"));
    expect(ruler.height).toBe(3);
    expect(isSolidShape(ruler)).toBe(false);
    expect(isSolidShape(makeShapeFromAsset(assetFor("box")))).toBe(true);
    expect(solidShapesOnly([ruler, makeShapeFromAsset(assetFor("box"))])).toHaveLength(1);
  });
});
