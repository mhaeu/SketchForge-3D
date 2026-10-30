import { beforeAll, describe, expect, it } from "vitest";
import manifoldModule from "manifold-3d";
import type { ManifoldToplevel } from "manifold-3d";
import * as THREE from "three";
import { editorHistoryEntry } from "@/lib/editorHistory";
import { createGridfinityGeometry } from "@/lib/gridfinityGeometry";
import { rememberManifoldRuntime } from "@/lib/manifoldHandle";
import { makeShapeFromAsset, toolbarShapeAssets } from "@/lib/shapeCatalog";
import { exportSkfProject, importSkfProject } from "@/lib/skfProject";
import { canonicalizeShape } from "@/lib/workplaneShapes";
import { DEFAULT_SNAP_GRID, DEFAULT_WORKPLANE_WORKSPACE } from "@/lib/workplaneSettings";
import type { WorkplaneShape } from "@/types/sketchforge";

/**
 * Gridfinity aus layerling: Masse nach der Spezifikation (42-mm-Raster,
 * Behaelter 0,5 mm kleiner, Hoeheneinheit 7 mm, Stapelrand 4,4 mm,
 * Grundplatte 5 mm), ein geschlossenes Netz und das Speichern.
 */
let runtime: ManifoldToplevel;

beforeAll(async () => {
  runtime = await manifoldModule();
  runtime.setup();
});

function gridfinity(overrides: Partial<WorkplaneShape> = {}) {
  const asset = toolbarShapeAssets.find((entry) => entry.kind === "gridfinity");
  if (!asset) throw new Error("no gridfinity asset");
  return canonicalizeShape({ ...makeShapeFromAsset(asset, { x: 0, z: 0 }), ...overrides });
}

/** Das Netz als Manifold: Scheitert das, ist es nicht geschlossen. */
function solidOf(geometry: THREE.BufferGeometry) {
  const position = geometry.getAttribute("position");
  const vertProperties = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i += 1) vertProperties.set([position.getX(i), position.getY(i), position.getZ(i)], i * 3);
  const triVerts = new Uint32Array(position.count);
  for (let i = 0; i < position.count; i += 1) triVerts[i] = i;
  const mesh = new runtime.Mesh({ numProp: 3, vertProperties, triVerts });
  mesh.merge();
  return new runtime.Manifold(mesh);
}

function size(geometry: THREE.BufferGeometry) {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  return [box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z].map((value) => Math.round(value * 1000) / 1000);
}

describe("gridfinity", () => {
  it("makes a new bin of 2 x 1 x 3 units with the lip", () => {
    const bin = gridfinity();
    expect(bin.gridfinityType).toBe("bin");
    expect([bin.width, bin.depth, bin.height]).toEqual([83.5, 41.5, 25.4]);
    const geometry = createGridfinityGeometry(bin);
    expect(size(geometry)).toEqual([83.5, 25.4, 41.5]);
    const solid = solidOf(geometry);
    expect(solid.status()).toBe("NoError");
    expect(solid.genus()).toBe(0);
    expect(solid.volume()).toBeGreaterThan(0);
    solid.delete();
  });

  it("snaps a dragged box back to whole units", () => {
    const bin = gridfinity({ width: 100, depth: 70, height: 40 });
    // 100 + 0,5 = 2,4 Einheiten -> 2; 70,5 -> 2 (1,68); (40 - 2,2) / 7 = 5,4 -> 5.
    expect([bin.width, bin.depth, bin.height]).toEqual([83.5, 83.5, 39.4]);
  });

  it("builds a baseplate of 42 mm per unit, 5 mm tall", () => {
    const plate = gridfinity({ gridfinityType: "baseplate", width: 126, depth: 84, height: 5 });
    expect([plate.width, plate.depth, plate.height]).toEqual([126, 84, 5]);
    const geometry = createGridfinityGeometry(plate);
    expect(size(geometry)).toEqual([126, 5, 84]);
    const solid = solidOf(geometry);
    expect(solid.status()).toBe("NoError");
    // Sechs Fassungen, jede ein Loch durch die Platte.
    expect(solid.genus()).toBe(6);
    solid.delete();
  });

  it("takes material away for magnet holes and adds it for dividers and a label shelf", () => {
    const volume = (shape: WorkplaneShape) => {
      const solid = solidOf(createGridfinityGeometry(shape));
      const value = solid.volume();
      solid.delete();
      return value;
    };
    const plain = volume(gridfinity());
    const magnets = volume(gridfinity({ gridfinityMagnets: true }));
    // Acht Loecher von 6,5 mm, 2,4 tief: 8 x pi x 3,25^2 x 2,4 = 637,1 mm3 (das Netz rundet sie in 32 Ecken).
    expect(plain - magnets).toBeGreaterThan(630);
    expect(plain - magnets).toBeLessThan(640);
    // Trennwaende und Leisten sind Teile, die Manifold anfuegt.
    rememberManifoldRuntime(runtime);
    const divided = volume(gridfinity({ gridfinityCompartmentsX: 2 }));
    expect(divided).toBeGreaterThan(plain);
    const labelled = volume(gridfinity({ gridfinityLabelBack: true }));
    expect(labelled).toBeGreaterThan(plain);
  });

  it("keeps its settings in a .skf file", async () => {
    const bin = gridfinity({ gridfinityMagnets: true, gridfinityCompartmentsX: 3, gridfinityLabelBack: true, gridfinityWallThickness: 1.2 });
    const bytes = await exportSkfProject({
      projectId: "p",
      projectName: "Gridfinity",
      createdAt: 1,
      modifiedAt: 2,
      shapes: [bin],
      history: [editorHistoryEntry([bin], [])],
      historyIndex: 0,
      assets: [],
      workspace: DEFAULT_WORKPLANE_WORKSPACE,
      snapGrid: DEFAULT_SNAP_GRID,
      placementElevation: 0,
    });
    const restored = (await importSkfProject(bytes)).shapes[0];
    expect(restored.kind).toBe("gridfinity");
    expect(restored.gridfinityMagnets).toBe(true);
    expect(restored.gridfinityCompartmentsX).toBe(3);
    expect(restored.gridfinityLabelBack).toBe(true);
    expect(restored.gridfinityWallThickness).toBe(1.2);
    expect([restored.width, restored.depth, restored.height]).toEqual([83.5, 41.5, 25.4]);
  });
});
