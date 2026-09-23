import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { Brush, Evaluator, SUBTRACTION } from "three-bvh-csg";
import {
  createRoundedBoxGeometry,
  normalizeCornerFillet,
  normalizeTopBottomFillet,
  normalizeRoundedBoxQuality,
} from "@/lib/roundedBoxGeometry";

function edgeUseCounts(position: { count: number; getX: (index: number) => number; getY: (index: number) => number; getZ: (index: number) => number }) {
  const uses = new Map<string, number>();
  const keyForPoint = (index: number) => [position.getX(index), position.getY(index), position.getZ(index)]
    .map((value) => value.toFixed(5))
    .join(",");
  for (let index = 0; index + 2 < position.count; index += 3) {
    const triangle = [keyForPoint(index), keyForPoint(index + 1), keyForPoint(index + 2)];
    for (let edge = 0; edge < 3; edge += 1) {
      const a = triangle[edge];
      const b = triangle[(edge + 1) % 3];
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      uses.set(key, (uses.get(key) ?? 0) + 1);
    }
  }
  return uses;
}

function signedVolume(position: { count: number; getX: (index: number) => number; getY: (index: number) => number; getZ: (index: number) => number }) {
  let volume = 0;
  for (let i = 0; i + 2 < position.count; i += 3) {
    const ax = position.getX(i), ay = position.getY(i), az = position.getZ(i);
    const bx = position.getX(i + 1), by = position.getY(i + 1), bz = position.getZ(i + 1);
    const cx = position.getX(i + 2), cy = position.getY(i + 2), cz = position.getZ(i + 2);
    volume += ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx);
  }
  return volume / 6;
}

describe("roundedBox geometry", () => {
  it("creates a closed, watertight 2-manifold rounded box with only vertical corner fillets", () => {
    const geometry = createRoundedBoxGeometry({
      width: 40,
      depth: 30,
      height: 20,
      cornerFillet: 5,
      topBottomFillet: 0,
      roundedBoxQuality: 8,
    });
    const position = geometry.getAttribute("position");

    expect(position.count).toBeGreaterThan(40);
    expect(signedVolume(position)).toBeGreaterThan(0);
    expect([...edgeUseCounts(position).values()].every((uses) => uses === 2)).toBe(true);

    expect(geometry.boundingBox?.min.y).toBeCloseTo(0, 4);
    expect(geometry.boundingBox?.max.y).toBeCloseTo(20, 4);
    expect((geometry.boundingBox?.max.x ?? 0) - (geometry.boundingBox?.min.x ?? 0)).toBeCloseTo(40, 3);
    expect((geometry.boundingBox?.max.z ?? 0) - (geometry.boundingBox?.min.z ?? 0)).toBeCloseTo(30, 3);
  });

  it("creates a closed, watertight 2-manifold rounded box with both corner and top/bottom fillets", () => {
    const geometry = createRoundedBoxGeometry({
      width: 50,
      depth: 40,
      height: 25,
      cornerFillet: 6,
      topBottomFillet: 4,
      roundedBoxQuality: 8,
    });
    const position = geometry.getAttribute("position");

    expect(position.count).toBeGreaterThan(40);
    expect(signedVolume(position)).toBeGreaterThan(0);
    expect([...edgeUseCounts(position).values()].every((uses) => uses === 2)).toBe(true);

    expect(geometry.boundingBox?.min.y).toBeCloseTo(0, 4);
    expect(geometry.boundingBox?.max.y).toBeCloseTo(25, 4);
    expect((geometry.boundingBox?.max.x ?? 0) - (geometry.boundingBox?.min.x ?? 0)).toBeCloseTo(50, 3);
    expect((geometry.boundingBox?.max.z ?? 0) - (geometry.boundingBox?.min.z ?? 0)).toBeCloseTo(40, 3);
  });

  it("keeps the corner radius constant when changing dimensions (no stretching)", () => {
    const r = 5;
    const geomSmall = createRoundedBoxGeometry({
      width: 40,
      depth: 30,
      height: 20,
      cornerFillet: r,
      topBottomFillet: 0,
      roundedBoxQuality: 16,
    });

    const geomLarge = createRoundedBoxGeometry({
      width: 100,
      depth: 60,
      height: 20,
      cornerFillet: r,
      topBottomFillet: 0,
      roundedBoxQuality: 16,
    });

    // In small box: corner arc center is at (40/2 - 5, 30/2 - 5) = (15, 10).
    // The outermost corner point is at (20, 15), distance from center is sqrt(5^2 + 5^2) = 5*sqrt(2) approx 7.071.
    // In large box: corner arc center is at (100/2 - 5, 60/2 - 5) = (45, 25).
    // The distance from the center to any arc point must remain exactly r = 5.
    const posSmall = geomSmall.getAttribute("position");
    const posLarge = geomLarge.getAttribute("position");

    // Check that maximum extent in X and Z is exactly width/2 and depth/2
    let maxDistFromArcCenterSmall = 0;
    const arcCenterSmallX = 40 / 2 - r;
    const arcCenterSmallZ = 30 / 2 - r;
    for (let i = 0; i < posSmall.count; i += 1) {
      const x = posSmall.getX(i);
      const z = posSmall.getZ(i);
      if (x >= arcCenterSmallX && z >= arcCenterSmallZ) {
        const dist = Math.hypot(x - arcCenterSmallX, z - arcCenterSmallZ);
        if (dist > maxDistFromArcCenterSmall) maxDistFromArcCenterSmall = dist;
      }
    }

    let maxDistFromArcCenterLarge = 0;
    const arcCenterLargeX = 100 / 2 - r;
    const arcCenterLargeZ = 60 / 2 - r;
    for (let i = 0; i < posLarge.count; i += 1) {
      const x = posLarge.getX(i);
      const z = posLarge.getZ(i);
      if (x >= arcCenterLargeX && z >= arcCenterLargeZ) {
        const dist = Math.hypot(x - arcCenterLargeX, z - arcCenterLargeZ);
        if (dist > maxDistFromArcCenterLarge) maxDistFromArcCenterLarge = dist;
      }
    }

    // Both arc radii must match exactly 5 mm!
    expect(maxDistFromArcCenterSmall).toBeCloseTo(r, 2);
    expect(maxDistFromArcCenterLarge).toBeCloseTo(r, 2);
  });

  it("participates cleanly in CSG boolean operations", () => {
    const boxGeom = createRoundedBoxGeometry({
      width: 40,
      depth: 30,
      height: 20,
      cornerFillet: 5,
      topBottomFillet: 2,
    });
    const cutterGeom = new THREE.CylinderGeometry(5, 5, 30, 16);
    cutterGeom.translate(0, 10, 0);

    const boxBrush = new Brush(boxGeom);
    const cutterBrush = new Brush(cutterGeom);
    boxBrush.updateMatrixWorld(true);
    cutterBrush.updateMatrixWorld(true);

    const evaluator = new Evaluator();
    evaluator.useGroups = false;
    evaluator.attributes = ["position", "normal"];
    const result = evaluator.evaluate(boxBrush, cutterBrush, SUBTRACTION);
    const pos = result.geometry.getAttribute("position");
    expect(pos.count).toBeGreaterThan(0);
    expect(signedVolume(pos)).toBeGreaterThan(0);
  });

  it("normalizes parameters correctly", () => {
    expect(normalizeCornerFillet(null)).toBe(5);
    expect(normalizeCornerFillet(7.33)).toBe(7.3);
    expect(normalizeCornerFillet(100, 15)).toBe(15);
    expect(normalizeCornerFillet(-5)).toBe(0);

    expect(normalizeTopBottomFillet(undefined)).toBe(0);
    expect(normalizeTopBottomFillet(3.48)).toBe(3.5);
    expect(normalizeTopBottomFillet(50, 8)).toBe(8);

    expect(normalizeRoundedBoxQuality(2)).toBe(4);
    expect(normalizeRoundedBoxQuality(50)).toBe(32);
    expect(normalizeRoundedBoxQuality(12)).toBe(12);
  });
});
