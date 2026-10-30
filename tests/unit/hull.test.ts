import { beforeAll, describe, expect, it } from "vitest";
import manifoldModule from "manifold-3d";
import type { ManifoldToplevel } from "manifold-3d";

/**
 * Die Huelle des Editors (buildHullShapeFromSelection): Manifold.hull der
 * Koerper, danach die Loecher abgezogen. Hier wird nachgerechnet, dass die
 * Rechnung die Koerper ergibt, die das Werkzeug verspricht.
 */
let runtime: ManifoldToplevel;

beforeAll(async () => {
  runtime = await manifoldModule();
  runtime.setup();
});

describe("hull", () => {
  it("turns two spheres into a capsule", () => {
    const { Manifold } = runtime;
    const a = Manifold.sphere(5, 96).translate([-10, 0, 0]);
    const b = Manifold.sphere(5, 96).translate([10, 0, 0]);
    const hull = Manifold.hull([a, b]);
    // Kapsel: Zylinder r=5, l=20 plus eine ganze Kugel r=5.
    const capsule = Math.PI * 25 * 20 + (4 / 3) * Math.PI * 125;
    expect(hull.volume()).toBeGreaterThan(capsule * 0.99);
    expect(hull.volume()).toBeLessThanOrEqual(capsule);
    expect(hull.genus()).toBe(0);
    [a, b, hull].forEach((m) => m.delete());
  });

  it("turns four corner posts into a box with round corners", () => {
    const { Manifold } = runtime;
    const posts = [[-10, -10], [10, -10], [10, 10], [-10, 10]].map(([x, y]) => Manifold.cylinder(10, 2, 2, 128).translate([x, y, 0]));
    const hull = Manifold.hull(posts);
    // 24 x 24 grosse Grundflaeche, Ecken mit r=2 gerundet, 10 hoch.
    const area = 24 * 24 - (4 - Math.PI) * 4;
    expect(hull.volume()).toBeCloseTo(area * 10, 0);
    const box = hull.boundingBox();
    expect(box.max[0] - box.min[0]).toBeCloseTo(24, 3);
    expect(box.max[2] - box.min[2]).toBeCloseTo(10, 6);
    [...posts, hull].forEach((m) => m.delete());
  });

  it("cuts a hole out after wrapping", () => {
    const { Manifold } = runtime;
    const a = Manifold.cube([10, 10, 10], true).translate([-10, 0, 0]);
    const b = Manifold.cube([10, 10, 10], true).translate([10, 0, 0]);
    const hole = Manifold.cube([4, 20, 4], true);
    const hull = Manifold.hull([a, b]);
    const cut = hull.subtract(hole);
    // Huelle 30 x 10 x 10, Loch 4 x 10 x 4 quer hindurch.
    expect(hull.volume()).toBeCloseTo(3000, 6);
    expect(cut.volume()).toBeCloseTo(3000 - 160, 6);
    expect(cut.genus()).toBe(1);
    [a, b, hole, hull, cut].forEach((m) => m.delete());
  });
});
