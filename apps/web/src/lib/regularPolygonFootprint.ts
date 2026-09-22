export type RegularPolygonFootprintScale = {
  x: number;
  z: number;
  offsetX: number;
  offsetZ: number;
};

export type RegularPolygonBounds = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

function regularPolygonBounds(sides: number, angleOffset = 0): RegularPolygonBounds {
  const count = Math.max(3, Math.round(sides));
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * Math.PI * 2 + angleOffset;
    const x = Math.sin(angle);
    const z = Math.cos(angle);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  return { minX, maxX, minZ, maxZ };
}

/**
 * How wide and how deep a polygon with circumradius 1 measures. A hexagon is
 * wider across its corners than across its flats, a pentagon different again -
 * whoever changes the side count and still wants a regular polygon has to
 * carry width and depth along in this ratio.
 */
export function regularPolygonAspect(sides: number) {
  const bounds = regularPolygonBounds(sides);
  return { width: bounds.maxX - bounds.minX, depth: bounds.maxZ - bounds.minZ };
}

export function regularPolygonFootprintScale(
  width: number,
  depth: number,
  sides: number,
  angleOffset = 0,
): RegularPolygonFootprintScale {
  const { minX, maxX, minZ, maxZ } = regularPolygonBounds(sides, angleOffset);
  const x = Math.max(0.001, width) / Math.max(0.001, maxX - minX);
  const z = Math.max(0.001, depth) / Math.max(0.001, maxZ - minZ);
  return {
    x,
    z,
    offsetX: -((minX + maxX) / 2) * x,
    offsetZ: -((minZ + maxZ) / 2) * z,
  };
}
