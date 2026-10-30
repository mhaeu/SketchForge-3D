import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { acceleratedRaycast, computeBoundsTree } from "three-mesh-bvh";
import { cadFaceHighlightPositions, cadTriangleFaces, toggleCadFace } from "@/lib/cadFacePick";

describe("picking CAD faces", () => {
  it("gives every triangle the face its group names, found by hash", () => {
    // Zwei Flaechen, die Gruppen in umgekehrter Reihenfolge: erst Flaeche 1 (Hash 22), dann Flaeche 0 (Hash 11).
    const groups = [0, 6, 22, 6, 3, 11];
    expect(Array.from(cadTriangleFaces(groups, [11, 22], 3))).toEqual([1, 1, 0]);
    expect(Array.from(cadTriangleFaces(groups, [11, 22], 3, 10))).toEqual([11, 11, 10]);
    expect(Array.from(cadTriangleFaces([0, 3, 99], [11], 2))).toEqual([-1, -1]);
  });

  it("takes a face in and out again", () => {
    expect(toggleCadFace([3], 1)).toEqual([1, 3]);
    expect(toggleCadFace([1, 3], 3)).toEqual([1]);
  });

  it("keeps the kernel's triangle numbers when the bounds tree is built indirect", () => {
    // Viele Dreiecke in einer Reihe, damit der Baum wirklich umsortieren wuerde.
    const positions: number[] = [];
    const indices: number[] = [];
    for (let i = 0; i < 200; i += 1) {
      const x = (i * 37) % 200;
      positions.push(x, 0, 0, x + 0.9, 0, 0, x, 0.9, 0);
      indices.push(i * 3, i * 3 + 1, i * 3 + 2);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
    geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
    computeBoundsTree.call(geometry, { targetLeafSize: 12, indirect: true });
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    mesh.raycast = acceleratedRaycast;
    for (const triangle of [0, 17, 199]) {
      const x = (triangle * 37) % 200;
      const ray = new THREE.Raycaster(new THREE.Vector3(x + 0.2, 0.2, 5), new THREE.Vector3(0, 0, -1));
      expect(ray.intersectObject(mesh)[0]?.faceIndex).toBe(triangle);
    }
  });

  it("lights up only the triangles of the picked faces", () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 5, 5, 5]);
    const indices = new Uint32Array([0, 1, 2, 1, 2, 3]);
    const corners = cadFaceHighlightPositions(positions, indices, new Int32Array([4, 7]), [7]);
    expect(Array.from(corners)).toEqual([1, 0, 0, 0, 1, 0, 5, 5, 5]);
  });
});
