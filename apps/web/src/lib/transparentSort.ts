import * as THREE from "three";

/** The fields of a Three.js render item this comparator looks at. */
export type TransparentRenderItem = {
  id: number;
  object: THREE.Object3D;
  groupOrder: number;
  renderOrder: number;
};

/**
 * Blending is only correct when the surfaces of the transparent pass arrive
 * back to front, and Three.js orders that pass by the distance of each
 * object's origin - which says nothing about where its surfaces actually are.
 * Two shapes reaching into each other, or a small one sitting inside a large
 * one, come out in an order that has far surfaces blending over near ones, so
 * a part sticking out of another shape gets painted over by it.
 *
 * Sorting by the closest point of the world bounding box instead puts the
 * object whose surface the viewer meets first on top. Depths are cached for
 * the length of a frame; `beginFrame` drops the cache and is meant to run from
 * the scene's onBeforeRender, which Three.js calls before it builds and sorts
 * the render list.
 */
export function createTransparentSurfaceSort() {
  const depths = new Map<number, number>();
  const box = new THREE.Box3();
  const point = new THREE.Vector3();
  let camera: THREE.Camera | null = null;

  const depthOf = (object: THREE.Object3D) => {
    const cached = depths.get(object.id);
    if (cached !== undefined) return cached;
    let depth = 0;
    if (camera) {
      const geometry = (object as Partial<THREE.Mesh>).geometry;
      if (geometry && !geometry.boundingBox) {
        geometry.computeBoundingBox();
      }
      if (geometry?.boundingBox) {
        box.copy(geometry.boundingBox).applyMatrix4(object.matrixWorld);
        // Zero while the camera sits inside the box, which is the right
        // answer: nothing can be nearer than the shape the viewer is in.
        depth = box.distanceToPoint(camera.position);
      } else {
        depth = camera.position.distanceTo(point.setFromMatrixPosition(object.matrixWorld));
      }
    }
    depths.set(object.id, depth);
    return depth;
  };

  return {
    beginFrame(frameCamera: THREE.Camera) {
      depths.clear();
      camera = frameCamera;
    },
    compare(a: TransparentRenderItem, b: TransparentRenderItem) {
      if (a.groupOrder !== b.groupOrder) return a.groupOrder - b.groupOrder;
      if (a.renderOrder !== b.renderOrder) return a.renderOrder - b.renderOrder;
      const depthA = depthOf(a.object);
      const depthB = depthOf(b.object);
      if (depthA !== depthB) return depthB - depthA;
      return a.id - b.id;
    },
  };
}
