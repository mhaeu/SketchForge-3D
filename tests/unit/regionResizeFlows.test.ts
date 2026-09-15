import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { fullShapeRegion, regionResizedShape, tightenRegionToShape, type RegionResizeMode, type ResizeRegion } from "@/lib/regionResize";
import type { WorkplaneShape } from "@/types/sketchforge";

// The editor's own meshes come from three.js geometries, which are not
// bit-exact closed: a cylinder's seam column exists twice, 2e-16 apart. So
// closedness is checked on positions rounded to a ten-millionth - which is
// also how the region logic matches vertices.
const KEY_SCALE = 1e7;
function openEdges(positions: number[]) {
  const counts = new Map<string, number>();
  const key = (i: number) => `${Math.round(positions[i] * KEY_SCALE)},${Math.round(positions[i + 1] * KEY_SCALE)},${Math.round(positions[i + 2] * KEY_SCALE)}`;
  for (let i = 0; i + 8 < positions.length; i += 9) {
    for (let e = 0; e < 3; e += 1) {
      const a = key(i + e * 3);
      const b = key(i + ((e + 1) % 3) * 3);
      const edge = a < b ? `${a}|${b}` : `${b}|${a}`;
      counts.set(edge, (counts.get(edge) ?? 0) + 1);
    }
  }
  return [...counts.entries()].filter(([, count]) => count !== 2).map(([edge]) => edge);
}

// Mirrors bakeShapeTransformIntoMesh: the geometry as a triangle soup in the
// mesh frame (x/z centred, y from the underside), sized to its bounds.
function meshShape(geometry: THREE.BufferGeometry): WorkplaneShape {
  const soup = geometry.index ? geometry.toNonIndexed() : geometry;
  const positions = Array.from(soup.getAttribute("position").array as ArrayLike<number>);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i + 2 < positions.length; i += 3) {
    for (let c = 0; c < 3; c += 1) {
      min[c] = Math.min(min[c], positions[i + c]);
      max[c] = Math.max(max[c], positions[i + c]);
    }
  }
  const centerX = (min[0] + max[0]) / 2;
  const centerZ = (min[2] + max[2]) / 2;
  for (let i = 0; i + 2 < positions.length; i += 3) {
    positions[i] -= centerX;
    positions[i + 1] -= min[1];
    positions[i + 2] -= centerZ;
  }
  const width = max[0] - min[0];
  const depth = max[2] - min[2];
  const height = max[1] - min[1];
  return {
    id: "s", name: "s", color: "#fff", kind: "mesh", x: 0, z: 0, elevation: 0, rotation: 0,
    size: Math.max(width, depth), width, depth, height,
    importedMesh: { positions, baseWidth: width, baseDepth: depth, baseHeight: height, triangleCount: positions.length / 9, sourceFormat: "json" },
  } as unknown as WorkplaneShape;
}

// The editor's own four-sided pyramid: an indexed base and four sides.
function editorPyramid(width: number, height: number, depth: number) {
  const w = width / 2;
  const d = depth / 2;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array([-w, 0, -d, w, 0, -d, w, 0, d, -w, 0, d, 0, height, 0]), 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3, 0, 4, 1, 1, 4, 2, 2, 4, 3, 3, 4, 0]);
  return geometry;
}

const geometries: Record<string, () => THREE.BufferGeometry> = {
  box: () => new THREE.BoxGeometry(20, 10, 20),
  "editor pyramid": () => editorPyramid(20, 10, 20),
  cylinder: () => new THREE.CylinderGeometry(10, 10, 10, 32),
  pyramid: () => new THREE.CylinderGeometry(0, 10, 10, 4),
  cone: () => new THREE.CylinderGeometry(3, 10, 10, 32),
  sphere: () => new THREE.SphereGeometry(8, 24, 16),
};

// What the handles do to the box, as the viewport reports it: the height
// handle grows the top (with the other axes linked, both sides of them too),
// the lift arrow shifts the whole box, side handles move one face.
const flows: Record<string, Array<(r: ResizeRegion) => Partial<ResizeRegion>>> = {
  "height, lift": [(r) => ({ maxY: r.maxY + 3 }), (r) => ({ minY: r.minY + 3, maxY: r.maxY + 3 })],
  "height with linked axes, lift": [
    (r) => ({ maxY: r.maxY + 3, minX: r.minX - 1, maxX: r.maxX + 1, minZ: r.minZ - 1, maxZ: r.maxZ + 1 }),
    (r) => ({ minY: r.minY + 3, maxY: r.maxY + 3 }),
  ],
  "height shrink with linked axes, lift": [
    (r) => ({ maxY: r.maxY - 2, minX: r.minX + 1, maxX: r.maxX - 1, minZ: r.minZ + 1, maxZ: r.maxZ - 1 }),
    (r) => ({ minY: r.minY + 3, maxY: r.maxY + 3 }),
  ],
  "bottom height handle, lift": [(r) => ({ minY: r.minY - 2 }), (r) => ({ minY: r.minY + 3, maxY: r.maxY + 3 })],
  "side, lift": [(r) => ({ maxX: r.maxX + 3 }), (r) => ({ minY: r.minY + 3, maxY: r.maxY + 3 })],
  "lift, height": [(r) => ({ minY: r.minY + 3, maxY: r.maxY + 3 }), (r) => ({ maxY: r.maxY + 3 })],
  "lift twice": [(r) => ({ minY: r.minY + 3, maxY: r.maxY + 3 }), (r) => ({ minY: r.minY + 2, maxY: r.maxY + 2 })],
  "height shrink, lift": [(r) => ({ maxY: r.maxY - 2 }), (r) => ({ minY: r.minY + 3, maxY: r.maxY + 3 })],
  "shrink width, shrink length, lift": [(r) => ({ maxX: r.maxX - 2 }), (r) => ({ maxZ: r.maxZ - 2 }), (r) => ({ minY: r.minY + 3, maxY: r.maxY + 3 })],
  "lift down": [(r) => ({ minY: r.minY - 2, maxY: r.maxY - 2 })],
};

// Where the box sits on the shape, as fractions of its height.
const placements: Record<string, [number, number]> = { "upper half": [0.5, 1], "lower half": [0, 0.5], "middle third": [1 / 3, 2 / 3] };

describe("region resize keeps real meshes closed through handle sequences", () => {
  const modes: RegionResizeMode[] = ["stretch", "push"];
  for (const [shapeName, build] of Object.entries(geometries)) {
    for (const [placementName, [fromFraction, toFraction]] of Object.entries(placements)) {
    for (const [flowName, steps] of Object.entries(flows)) {
      for (const first of modes) {
        for (const second of modes) {
          it(`${shapeName}, ${placementName}: ${flowName} (${first}, then ${second})`, () => {
            let shape = meshShape(build());
            expect(openEdges(shape.importedMesh!.positions)).toEqual([]);
            const full = fullShapeRegion(shape);
            // The box, shrunk onto the geometry within it the way the editor
            // does before the handles get to work.
            let region: ResizeRegion = tightenRegionToShape(shape, { ...full, minY: full.maxY * fromFraction, maxY: full.maxY * toFraction });
            steps.forEach((step, index) => {
              const mode = index === 0 ? first : second;
              const result = regionResizedShape(shape, region, { ...region, ...step(region) }, mode);
              expect(result, `step ${index}`).not.toBeNull();
              shape = { ...shape, ...result!.patch } as WorkplaneShape;
              region = result!.region;
              expect(openEdges(shape.importedMesh!.positions), `step ${index}`).toEqual([]);
            });
          });
        }
      }
    }
    }
  }
});
