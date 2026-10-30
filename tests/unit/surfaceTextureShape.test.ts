import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { describe, expect, it } from "vitest";
import { editorHistoryEntry } from "@/lib/editorHistory";
import { exportSkfProject, importSkfProject } from "@/lib/skfProject";
import { analyzeTriangleSoup } from "@/lib/svgImport";
import {
  canChangeSurfaceTexture,
  canTextureSurface,
  offersSurfaceTexture,
  offersSurfaceTextureMask,
  sceneWithSurfaceBody,
  shapeUnderSurfaceTexture,
  surfaceTextureEntry,
  surfaceTextureGoldShape,
  surfaceTextureMaskOf,
  surfaceTextureMasksFor,
  surfacePatternLabel,
  surfaceTexturedShape,
  surfaceTextureInput,
  textureSurfacePositions,
  type SurfaceTextureMesh,
} from "@/lib/surfaceTextureShape";
import { textureSurfaceOffThread } from "@/lib/surfaceTextureWorkerClient";
import { normalizeSurfaceTexture } from "@/lib/surfaceTexture";
import { DEFAULT_SNAP_GRID, DEFAULT_WORKPLANE_WORKSPACE } from "@/lib/workplaneSettings";
import { canonicalizeShape, workplaneShapesEqual } from "@/lib/workplaneShapes";
import type { WorkplaneShape } from "@/types/sketchforge";

/*
 * Nach layerling 1.121.1 (tests/unit/surfaceTextureShape.test.ts). Das Netz
 * einer Form baut bei uns der Editor; hier steht dafuer dieselbe
 * three.js-Geometrie, wie er sie fuer Zylinder und Quader nimmt.
 */

function shape(overrides: Partial<WorkplaneShape>): WorkplaneShape {
  return canonicalizeShape({
    id: "c1", name: "Cylinder", kind: "cylinder", color: "#d97813", x: 12, z: -7, elevation: 3,
    size: 30, width: 30, depth: 30, height: 20, rotation: 0, ...overrides,
  });
}

function geometryMesh(geometry: THREE.BufferGeometry, target: WorkplaneShape): SurfaceTextureMesh {
  geometry.translate(target.x, (target.elevation ?? 0) + target.height / 2, target.z);
  const welded = mergeVertices(geometry.deleteAttribute("normal").deleteAttribute("uv"), 1e-6);
  const position = welded.getAttribute("position");
  const index = welded.getIndex()!;
  const vertices: [number, number, number][] = [];
  for (let i = 0; i < position.count; i += 1) vertices.push([position.getX(i), position.getY(i), position.getZ(i)]);
  const faces: [number, number, number][] = [];
  for (let i = 0; i < index.count; i += 3) faces.push([index.getX(i), index.getX(i + 1), index.getX(i + 2)]);
  return { vertices, faces };
}

/** Das Netz, wie der Editor es zu einer Form stellt, dort wo sie steht. */
function meshOf(target: WorkplaneShape): SurfaceTextureMesh {
  if (target.kind === "box") return geometryMesh(new THREE.BoxGeometry(target.width, target.height, target.depth), target);
  if (target.importedMesh) {
    const p = target.importedMesh.positions;
    const vertices: [number, number, number][] = [];
    const faces: [number, number, number][] = [];
    for (let i = 0; i < p.length; i += 3) vertices.push([p[i] + target.x, p[i + 1] + (target.elevation ?? 0), p[i + 2] + target.z]);
    for (let i = 0; i < vertices.length; i += 3) faces.push([i, i + 1, i + 2]);
    return { vertices, faces };
  }
  return geometryMesh(new THREE.CylinderGeometry(target.width / 2, target.width / 2, target.height, 96, 1), target);
}

function soupOf(target: WorkplaneShape) {
  const mesh = meshOf(target);
  return mesh.faces.flatMap((face) => face.flatMap((index) => [...mesh.vertices[index]]));
}

describe("which shapes take a surface texture", () => {
  it("takes one solid body that is not locked and has no texture yet", () => {
    expect(canTextureSurface(shape({}))).toBe(true);
    expect(canTextureSurface(shape({ locked: true }))).toBe(false);
    expect(canTextureSurface(shape({ surfaceTexture: normalizeSurfaceTexture({}) }))).toBe(false);
    expect(canTextureSurface(shape({ kind: "ruler" }))).toBe(false);
    expect(canTextureSurface(shape({ kind: "reference" }))).toBe(false);
    expect(canTextureSurface(null)).toBe(false);
    // Ein strukturierter Koerper zeigt die Karte weiter, um zu sagen, was er traegt.
    expect(offersSurfaceTexture(shape({ surfaceTexture: normalizeSurfaceTexture({}) }))).toBe(true);
  });

  it("names the patterns in the current language", () => {
    expect(surfacePatternLabel("knurl")).toBe("Knurling");
    expect(surfacePatternLabel("honeycomb")).toBe("Honeycomb");
  });
});

describe("a textured shape", () => {
  it("reads the body where it stands in the design", () => {
    const cylinder = shape({});
    const mesh = meshOf(cylinder);
    const input = surfaceTextureInput(mesh);
    expect(input.length).toBe(mesh.faces.length * 9);
    let minY = Infinity;
    for (let i = 1; i < input.length; i += 3) minY = Math.min(minY, input[i]);
    expect(minY).toBeCloseTo(3, 6);
  });

  it("stands where the body stood, as a closed mesh that remembers its settings", () => {
    const cylinder = shape({});
    const settings = normalizeSurfaceTexture({ pattern: "grooves", spacing: 3, depth: 0.5, angle: 0 });
    const outcome = textureSurfacePositions(surfaceTextureInput(meshOf(cylinder)), settings, 200_000);
    expect(outcome.stats.nothing).toBe(false);
    expect(outcome.stats.around).toBe(Math.round((Math.PI * 30) / 3));
    const textured = surfaceTexturedShape(cylinder, outcome.positions, settings);
    if (!textured) throw new Error("no shape");
    expect(textured.kind).toBe("mesh");
    expect(textured.id).toBe(cylinder.id);
    expect(textured.color).toBe(cylinder.color);
    expect(textured.surfaceTexture).toEqual(settings);
    expect(textured.x).toBeCloseTo(12, 3);
    expect(textured.z).toBeCloseTo(-7, 3);
    expect(textured.elevation).toBeCloseTo(3, 6);
    expect(textured.height).toBeCloseTo(20, 3);
    // Rillen nach innen lassen den Aussendurchmesser, wie er war.
    expect(textured.width).toBeCloseTo(30, 2);
    const placed = soupOf(textured);
    expect(placed.length).toBe(outcome.positions.length);
    for (let i = 0; i < placed.length; i += 997) expect(placed[i]).toBeCloseTo(outcome.positions[i], 4);
    const analysis = analyzeTriangleSoup(placed);
    expect(analysis.boundaryEdges).toBe(0);
    expect(analysis.nonManifoldEdges).toBe(0);
    // Die Einstellungen der Struktur zaehlen als Aenderung der Form.
    expect(workplaneShapesEqual(textured, { ...textured, surfaceTexture: normalizeSurfaceTexture({ ...settings, depth: 1 }) })).toBe(false);
    expect(workplaneShapesEqual(textured, { ...textured, surfaceTexture: normalizeSurfaceTexture(settings) })).toBe(true);
    expect(workplaneShapesEqual(cylinder, { ...cylinder, surfaceTextureMask: "exclude" })).toBe(false);
  }, 30_000);

  it("works without a worker, here in the tests", async () => {
    const outcome = await textureSurfaceOffThread(surfaceTextureInput(meshOf(shape({}))), normalizeSurfaceTexture({ pattern: "honeycomb", spacing: 6 }), 150_000);
    expect(outcome.stats.triangles).toBeGreaterThan(1000);
    expect(outcome.positions.length).toBe(outcome.stats.triangles * 9);
  }, 30_000);
});

describe("texture masks", () => {
  const box = (overrides: Partial<WorkplaneShape>) => shape({ id: "m1", name: "Box", kind: "box", width: 40, depth: 40, height: 12, x: 12, z: -7, elevation: 14, ...overrides });

  it("are convex helper bodies with no texture of their own", () => {
    expect(offersSurfaceTextureMask(box({}))).toBe(true);
    expect(offersSurfaceTextureMask(shape({ id: "s", kind: "sphere" }))).toBe(true);
    expect(offersSurfaceTextureMask(shape({ id: "t", kind: "text" }))).toBe(false);
    expect(offersSurfaceTextureMask(box({ surfaceTexture: normalizeSurfaceTexture({}) }))).toBe(false);
  });

  it("describe a box by its six faces, pointing out, with its box", () => {
    const mask = surfaceTextureMaskOf(meshOf(box({})), "exclude");
    if (!mask) throw new Error("no mask");
    expect(mask.planes.length).toBe(24);
    for (let k = 0; k < mask.planes.length; k += 4) {
      expect(mask.planes[k] * 12 + mask.planes[k + 1] * 20 + mask.planes[k + 2] * -7).toBeLessThan(mask.planes[k + 3]);
    }
    expect(mask.box?.[1]).toBeCloseTo(14, 6);
    expect(mask.box?.[4]).toBeCloseTo(26, 6);
  });

  it("take part where a marked body reaches into the textured one, and keep its texture away", () => {
    const cylinder = shape({});
    const far = box({ id: "far", x: 200, surfaceTextureMask: "only" });
    const near = box({ surfaceTextureMask: "exclude" });
    const unmarked = box({ id: "plain" });
    const masks = surfaceTextureMasksFor(cylinder, [cylinder, far, near, unmarked], meshOf);
    expect(masks.map((mask) => mask.mode)).toEqual(["exclude"]);
    const settings = normalizeSurfaceTexture({ pattern: "knurl", spacing: 3, depth: 0.5, fade: 0.5, masks });
    const outcome = textureSurfacePositions(surfaceTextureInput(meshOf(cylinder)), settings, 200_000);
    // Ueber dem Boden der Maske (14 plus einen halben Millimeter Uebergang) bleibt die Wand, darunter traegt sie das Raendel.
    let deepest = Infinity;
    for (let i = 0; i < outcome.positions.length; i += 3) {
      const r = Math.hypot(outcome.positions[i] - 12, outcome.positions[i + 2] + 7);
      const y = outcome.positions[i + 1];
      if (y > 14.6 && y < 22.9 && r > 5) expect(r).toBeGreaterThan(15 * Math.cos(Math.PI / 96) - 1e-6);
      if (y > 5 && y < 12) deepest = Math.min(deepest, r);
    }
    expect(deepest).toBeLessThan(14.6);
    const textured = surfaceTexturedShape(cylinder, outcome.positions, settings);
    expect(textured?.surfaceTexture?.masks).toHaveLength(1);
  }, 30_000);
});

describe("a texture changed later", () => {
  const grooves = normalizeSurfaceTexture({ pattern: "grooves", spacing: 4, depth: 0.5, angle: 0 });
  const texture = (target: WorkplaneShape, settings = grooves) => {
    const textured = surfaceTexturedShape(target, textureSurfacePositions(surfaceTextureInput(meshOf(target)), settings, 150_000).positions, settings);
    if (!textured) throw new Error("no shape");
    return textured;
  };

  it("keeps the body under it, and gives it back where the textured body stands", () => {
    const cylinder = shape({});
    const textured = texture(cylinder);
    const entry = surfaceTextureEntry(textured);
    expect(entry?.feature.kind).toBe("surfaceTexture");
    expect(entry?.feature.surfaceTexture).toEqual(grooves);
    expect(canChangeSurfaceTexture(textured)).toBe(true);
    expect(canChangeSurfaceTexture({ ...textured, locked: true })).toBe(false);
    const under = shapeUnderSurfaceTexture(textured);
    expect(under?.kind).toBe("cylinder");
    expect(under?.surfaceTexture).toBeUndefined();
    expect(under?.edgeTreatmentHistory).toBeUndefined();
    expect(under?.x).toBeCloseTo(12, 2);
    expect(under?.z).toBeCloseTo(-7, 2);
    expect(under?.elevation).toBeCloseTo(3, 6);
    expect(under?.width).toBeCloseTo(30, 2);
    // Verschoben und hoeher gezogen: Der Koerper darunter kommt dort und so hoch zurueck.
    const moved = canonicalizeShape({ ...textured, x: textured.x + 10, elevation: (textured.elevation ?? 0) + 2, height: textured.height * 1.5 });
    const back = shapeUnderSurfaceTexture(moved);
    expect(back?.x).toBeCloseTo(22, 2);
    expect(back?.elevation).toBeCloseTo(5, 6);
    expect(back?.height).toBeCloseTo(30, 2);
    expect(back?.color).toBe(cylinder.color);
  }, 30_000);

  it("is made again from the body under it, and keeps the steps before it", () => {
    const earlier = {
      id: "edge-history-0",
      createdAt: 1,
      feature: { kind: "chamfer" as const, amount: 1, edgeCount: 1 },
      before: shape({ height: 20 }),
    };
    const chamfered = shape({ edgeTreatmentHistory: [earlier] });
    const textured = texture(chamfered);
    expect(textured.edgeTreatmentHistory?.map((step) => step.feature.kind)).toEqual(["chamfer", "surfaceTexture"]);
    const under = shapeUnderSurfaceTexture(textured);
    if (!under) throw new Error("no body under the texture");
    expect(under.edgeTreatmentHistory?.map((step) => step.id)).toEqual(["edge-history-0"]);
    const knurled = texture(under, normalizeSurfaceTexture({ pattern: "knurl", spacing: 3, depth: 0.4 }));
    expect(knurled.surfaceTexture?.pattern).toBe("knurl");
    expect(knurled.edgeTreatmentHistory?.map((step) => step.feature.kind)).toEqual(["chamfer", "surfaceTexture"]);
    expect(surfaceTextureEntry(knurled)?.before.kind).toBe("cylinder");
  }, 30_000);

  it("cannot be changed with a step after it, nor without the body under it", () => {
    const textured = texture(shape({}));
    const filleted = {
      ...textured,
      edgeTreatmentHistory: [...(textured.edgeTreatmentHistory ?? []), { id: "edge-history-9", createdAt: 9, feature: { kind: "fillet" as const, amount: 2, edgeCount: 1 }, before: textured }],
    };
    expect(surfaceTextureEntry(filleted)).toBeNull();
    expect(shapeUnderSurfaceTexture(filleted)).toBeNull();
    expect(surfaceTextureEntry({ ...textured, edgeTreatmentHistory: undefined })).toBeNull();
    expect(surfaceTextureEntry(shape({}))).toBeNull();
  }, 30_000);

  it("takes the gold of its cracks along when it is made again or taken off", () => {
    const textured = texture(shape({}));
    const gold = surfaceTextureGoldShape(textured, [0, 0, 0, 1, 0, 0, 0, 1, 0], "Gold");
    if (!gold) throw new Error("no gold");
    expect(gold.surfaceFillOf).toBe(textured.id);
    const other = shape({ id: "other" });
    const scene = sceneWithSurfaceBody([textured, other], textured.id, textured, gold);
    expect(scene.map((entry) => entry.id)).toEqual([textured.id, gold.id, "other"]);
    const under = shapeUnderSurfaceTexture(textured)!;
    expect(sceneWithSurfaceBody(scene, textured.id, under, null).map((entry) => entry.id)).toEqual([textured.id, "other"]);
  }, 30_000);

  it("keeps the body under it through saving and opening the project", async () => {
    const textured = texture(shape({}));
    const exported = await exportSkfProject({
      projectId: "project-texture",
      projectName: "Texture",
      createdAt: 1_700_000_000_000,
      modifiedAt: 1_700_000_100_000,
      shapes: [textured],
      history: [editorHistoryEntry([textured], [])],
      historyIndex: 0,
      assets: [],
      workspace: DEFAULT_WORKPLANE_WORKSPACE,
      snapGrid: DEFAULT_SNAP_GRID,
      placementElevation: 0,
    } as Parameters<typeof exportSkfProject>[0]);
    const restored = (await importSkfProject(exported)).shapes[0];
    expect(restored.surfaceTexture).toEqual(grooves);
    expect(surfaceTextureEntry(restored)?.feature.surfaceTexture).toEqual(grooves);
    const under = shapeUnderSurfaceTexture(restored);
    expect(under?.kind).toBe("cylinder");
    expect(under?.x).toBeCloseTo(12, 2);
    expect(under?.height).toBeCloseTo(20, 2);
  }, 30_000);
});
