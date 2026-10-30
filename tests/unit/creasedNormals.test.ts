import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { toCreasedNormals as threeCreasedNormals } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { toCreasedNormals } from "@/lib/creasedNormals";
import { createThreadGeometry } from "@/lib/threadGeometry";

/**
 * Die schnellere Fassung von three's toCreasedNormals (aus layerling 1.118.0)
 * muss dieselben Normalen liefern. Gemessen an einem Gewinde 20 x 60 mit
 * 27.800 Dreiecken: three 86,0 ms, diese 28,4 ms (Median aus fuenf Laeufen).
 */
function maxNormalDifference(geometry: THREE.BufferGeometry, angle: number) {
  const a = threeCreasedNormals(geometry, angle).getAttribute("normal");
  const b = toCreasedNormals(geometry, angle).getAttribute("normal");
  expect(b.count).toBe(a.count);
  let max = 0;
  for (let i = 0; i < a.count * 3; i += 1) max = Math.max(max, Math.abs(a.array[i] - b.array[i]));
  return max;
}

describe("creased normals", () => {
  it("match three's on a thread", () => {
    const raw = createThreadGeometry({ width: 20, depth: 20, height: 60 } as never).toNonIndexed();
    raw.deleteAttribute("normal");
    expect(maxNormalDifference(raw, THREE.MathUtils.degToRad(20))).toBeLessThan(1e-6);
  });

  it("match three's on an indexed sphere with a sharp crease angle and a smooth one", () => {
    const sphere = new THREE.SphereGeometry(10, 32, 16);
    sphere.deleteAttribute("normal");
    expect(maxNormalDifference(sphere, THREE.MathUtils.degToRad(5))).toBeLessThan(1e-6);
    expect(maxNormalDifference(sphere, THREE.MathUtils.degToRad(60))).toBeLessThan(1e-6);
  });
});
