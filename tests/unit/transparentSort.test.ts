import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { createTransparentSurfaceSort, type TransparentRenderItem } from "@/lib/transparentSort";

// The camera looks down -Z from z = 100, so a larger z is nearer to it.
const camera = new THREE.PerspectiveCamera();
camera.position.set(0, 0, 100);
camera.updateMatrixWorld();

let nextId = 1;
function boxAt(z: number, size = 10, groupOrder = 0, renderOrder = 0): TransparentRenderItem {
  const object = new THREE.Mesh(new THREE.BoxGeometry(size, size, size));
  object.position.set(0, 0, z);
  object.updateMatrixWorld();
  return { id: nextId++, object, groupOrder, renderOrder };
}
const order = (items: TransparentRenderItem[], compare: (a: TransparentRenderItem, b: TransparentRenderItem) => number) =>
  [...items].sort(compare).map((item) => item.id);

describe("transparent surface sort", () => {
  it("draws the shape whose surface is furthest away first", () => {
    const sort = createTransparentSurfaceSort();
    sort.beginFrame(camera);
    const near = boxAt(20);
    const far = boxAt(-40);
    expect(order([near, far], sort.compare)).toEqual([far.id, near.id]);
    expect(order([far, near], sort.compare)).toEqual([far.id, near.id]);
  });

  it("puts an enclosing shape over the small one inside it", () => {
    // Both share a centre, so ordering by object origin is a coin flip - and
    // getting it wrong blends the outer shell under the shape it contains.
    const sort = createTransparentSurfaceSort();
    sort.beginFrame(camera);
    const inner = boxAt(0, 4);
    const outer = boxAt(0, 40);
    expect(order([inner, outer], sort.compare)).toEqual([inner.id, outer.id]);
    expect(order([outer, inner], sort.compare)).toEqual([inner.id, outer.id]);
  });

  it("orders two overlapping shapes by the surface the viewer meets first", () => {
    // Centres put "behind" nearer to the camera, its surfaces do not.
    const sort = createTransparentSurfaceSort();
    sort.beginFrame(camera);
    const reachesForward = boxAt(0, 40);
    const behind = boxAt(15, 4);
    expect(order([behind, reachesForward], sort.compare)).toEqual([behind.id, reachesForward.id]);
  });

  it("keeps render order ahead of any distance", () => {
    // The workplane and the overlay helpers rely on their fixed places.
    const sort = createTransparentSurfaceSort();
    sort.beginFrame(camera);
    const shape = boxAt(40);
    const ground = boxAt(-40, 10, 0, -2);
    const overlay = boxAt(-40, 10, 0, 999);
    expect(order([shape, overlay, ground], sort.compare)).toEqual([ground.id, shape.id, overlay.id]);
  });

  it("follows the camera once the next frame starts", () => {
    const sort = createTransparentSurfaceSort();
    const near = boxAt(20);
    const far = boxAt(-40);
    sort.beginFrame(camera);
    expect(order([near, far], sort.compare)).toEqual([far.id, near.id]);

    const opposite = new THREE.PerspectiveCamera();
    opposite.position.set(0, 0, -100);
    opposite.updateMatrixWorld();
    sort.beginFrame(opposite);
    expect(order([near, far], sort.compare)).toEqual([near.id, far.id]);
  });
});
