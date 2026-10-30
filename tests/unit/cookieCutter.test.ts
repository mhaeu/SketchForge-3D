import { beforeAll, describe, expect, it } from "vitest";
import manifoldModule from "manifold-3d";
import type { ManifoldToplevel } from "manifold-3d";
import { buildCookieCutter, COOKIE_CUTTER_DEFAULTS, footprintHasHoles, normalizeCookieCutterOptions } from "@/lib/cookieCutter";

let runtime: ManifoldToplevel;

beforeAll(async () => {
  runtime = await manifoldModule();
  runtime.setup();
});

const flat = { ...COOKIE_CUTTER_DEFAULTS, edge: COOKIE_CUTTER_DEFAULTS.wall };

describe("cookie cutter", () => {
  it("builds a wall and a rim round a square", () => {
    const square = runtime.CrossSection.square([40, 40], true);
    const cutter = buildCookieCutter(runtime, square, flat)!;
    const box = cutter.boundingBox();
    // Aussen 40 + 2 x (1,2 Wand + 4 Rand) = 50,4; 15 hoch.
    expect(box.max[0] - box.min[0]).toBeCloseTo(50.4, 1);
    expect(box.max[2] - box.min[2]).toBeCloseTo(15, 6);
    expect(cutter.genus()).toBe(1);
    // Wand: (42,4^2 - 40^2) x 15 abzueglich der gerundeten Ecken, Rand: 2 hoch ab der halben Wand.
    const wall = (42.4 * 42.4 - 40 * 40 - (4 - Math.PI) * 1.2 * 1.2) * 15;
    expect(cutter.volume()).toBeGreaterThan(wall);
    square.delete();
    cutter.delete();
  });

  it("runs the top of the wall in to a cutting edge", () => {
    const square = runtime.CrossSection.square([40, 40], true);
    const flatCutter = buildCookieCutter(runtime, square, flat)!;
    const sharp = buildCookieCutter(runtime, square, COOKIE_CUTTER_DEFAULTS)!;
    // Die Schraege nimmt oben (1,2 - 0,4) / 2 = 0,4 mm Hoehe weg, in Stufen; das spart Material.
    expect(sharp.volume()).toBeLessThan(flatCutter.volume());
    expect(sharp.boundingBox().max[2]).toBeCloseTo(15, 6);
    [square, flatCutter, sharp].forEach((item) => item.delete());
  });

  it("gives a hole a wall of its own and holds it by bridges", () => {
    const ring = runtime.CrossSection.square([40, 40], true).subtract(runtime.CrossSection.square([20, 20], true));
    expect(footprintHasHoles(ring)).toBe(true);
    const loose = buildCookieCutter(runtime, ring, { ...flat, bridges: false })!;
    // Ohne Stege: aussen Wand und Rand, innen eine lose Wand - zwei Teile.
    expect(loose.decompose().length).toBe(2);
    const held = buildCookieCutter(runtime, ring, flat)!;
    expect(held.decompose().length).toBe(1);
    [ring, loose, held].forEach((item) => item.delete());
  });

  it("stands where the shape stood, as the editor turns it", () => {
    // Die Schritte aus applyCookieCutter: Szene y nach oben, Manifold schneidet in z.
    // Ein L aus zwei Quadern, 30 in x und 20 in z verschoben, auf y = 5.
    const long = runtime.Manifold.cube([30, 10, 10]).translate([15, 5, 30]);
    const foot = runtime.Manifold.cube([10, 10, 30]).translate([15, 5, 10]);
    const shape = long.add(foot);
    const turned = shape.rotate([90, 0, 0]);
    const bottom = turned.boundingBox().min[2];
    expect(bottom).toBeCloseTo(5, 6);
    let footprint = turned.slice(bottom + 0.05);
    const box = footprint.bounds();
    footprint = footprint.mirror([1, 0]).translate([box.min[0] + box.max[0], 0]);
    const cutter = buildCookieCutter(runtime, footprint, flat)!;
    const placed = cutter.rotate([-90, 0, 0]).translate([0, bottom, 0]);
    const world = placed.boundingBox();
    const reach = 1.2 + 4;
    expect(world.min[1]).toBeCloseTo(5, 6);
    expect(world.max[1]).toBeCloseTo(20, 6);
    expect(world.min[0]).toBeCloseTo(15 - reach, 1);
    expect(world.max[0]).toBeCloseTo(45 + reach, 1);
    expect(world.min[2]).toBeCloseTo(10 - reach, 1);
    expect(world.max[2]).toBeCloseTo(40 + reach, 1);
    // Gespiegelt in x: Der Fuss des L stand bei x 15..25, jetzt bei 35..45.
    const slice = placed.rotate([90, 0, 0]).slice(world.min[1] + 10);
    const sliceBox = slice.bounds();
    expect(sliceBox.max[0]).toBeCloseTo(45 + 1.2, 1);
    // Bei z = 15 steht nur der Fuss: Seine Waende liegen jetzt bei x 33,8 bis 46,2.
    const footSide = slice.intersect(runtime.CrossSection.square([100, 2]).translate([0, -16]));
    expect(footSide.bounds().min[0]).toBeCloseTo(35 - 1.2, 1);
    expect(footSide.bounds().max[0]).toBeCloseTo(45 + 1.2, 1);
    [long, foot, shape, turned, cutter, placed, slice, footSide].forEach((item) => item.delete());
  });

  it("keeps the options within their limits", () => {
    const options = normalizeCookieCutterOptions({ wall: 0.1, height: 500, edge: 9, rimHeight: 50, bridgeCount: 3.6 });
    expect(options.wall).toBe(0.4);
    expect(options.height).toBe(100);
    expect(options.edge).toBe(0.4);
    expect(options.rimHeight).toBe(20);
    expect(options.bridgeCount).toBe(4);
  });
});
