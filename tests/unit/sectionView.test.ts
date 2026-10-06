import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  clampSectionOffset,
  pointIsCutAway,
  sectionBoundsOf,
  sectionCentre,
  sectionOffsetLimits,
  sectionPlane,
  type SectionBounds,
} from "@/lib/sectionView";

const BOX: SectionBounds = { min: { x: -10, y: 0, z: -5 }, max: { x: 10, y: 40, z: 5 } };

describe("Die Schnittebene", () => {
  /**
   * three.js laesst stehen, wo `normal * p + constant >= 0` gilt. Die Probe
   * laeuft darum durch die echte Ebene und nicht nur durch die eigene
   * Rechnung - sonst koennte das Vorzeichen verdreht sein und beide Seiten
   * waeren sich einig.
   */
  it("laesst stehen, was unter dem Schnitt liegt", () => {
    const { normal, constant } = sectionPlane({ axis: "y", offset: 20, flipped: false });
    const plane = new THREE.Plane(new THREE.Vector3(normal.x, normal.y, normal.z), constant);
    expect(plane.distanceToPoint(new THREE.Vector3(0, 5, 0))).toBeGreaterThan(0);
    expect(plane.distanceToPoint(new THREE.Vector3(0, 35, 0))).toBeLessThan(0);
  });

  it("laesst umgeschlagen die andere Haelfte stehen", () => {
    const { normal, constant } = sectionPlane({ axis: "y", offset: 20, flipped: true });
    const plane = new THREE.Plane(new THREE.Vector3(normal.x, normal.y, normal.z), constant);
    expect(plane.distanceToPoint(new THREE.Vector3(0, 35, 0))).toBeGreaterThan(0);
    expect(plane.distanceToPoint(new THREE.Vector3(0, 5, 0))).toBeLessThan(0);
  });

  it("schneidet auf jeder der drei Achsen", () => {
    expect(sectionPlane({ axis: "x", offset: 3, flipped: false }).normal).toEqual({ x: -1, y: 0, z: 0 });
    expect(sectionPlane({ axis: "y", offset: 3, flipped: false }).normal).toEqual({ x: 0, y: -1, z: 0 });
    expect(sectionPlane({ axis: "z", offset: 3, flipped: false }).normal).toEqual({ x: 0, y: 0, z: -1 });
  });

  it("steht bei null dort, wo die Achse null ist", () => {
    expect(sectionPlane({ axis: "x", offset: 0, flipped: false }).constant).toBe(0);
  });
});

describe("Was weggeschnitten ist", () => {
  it("nennt die verborgene Seite", () => {
    const view = { axis: "y" as const, offset: 20, flipped: false };
    expect(pointIsCutAway({ x: 0, y: 30, z: 0 }, view)).toBe(true);
    expect(pointIsCutAway({ x: 0, y: 10, z: 0 }, view)).toBe(false);
  });

  /**
   * Die Schnittflaeche selbst muss anklickbar bleiben: Dort liegt das
   * Innere, das man sich ansehen will, und ein Punkt genau auf der Ebene
   * gehoert noch dazu.
   */
  it("zaehlt die Schnittflaeche selbst als sichtbar", () => {
    const view = { axis: "y" as const, offset: 20, flipped: false };
    expect(pointIsCutAway({ x: 0, y: 20, z: 0 }, view)).toBe(false);
    expect(pointIsCutAway({ x: 0, y: 20.0000001, z: 0 }, view)).toBe(false);
  });

  it("dreht sich mit dem Umschlagen", () => {
    const view = { axis: "x" as const, offset: 0, flipped: true };
    expect(pointIsCutAway({ x: -5, y: 0, z: 0 }, view)).toBe(true);
    expect(pointIsCutAway({ x: 5, y: 0, z: 0 }, view)).toBe(false);
  });
});

describe("Wie weit die Ebene wandern darf", () => {
  it("bleibt an der Ausdehnung dessen, was da ist", () => {
    const limits = sectionOffsetLimits(BOX, "y");
    // 40 hoch, zwei Prozent Luft sind 0,8.
    expect(limits.min).toBeCloseTo(-0.8, 6);
    expect(limits.max).toBeCloseTo(40.8, 6);
  });

  it("laesst an beiden Enden Luft, damit man das Schneiden anfangen sieht", () => {
    const limits = sectionOffsetLimits(BOX, "y");
    expect(limits.min).toBeLessThan(BOX.min.y);
    expect(limits.max).toBeGreaterThan(BOX.max.y);
  });

  it("gibt einen brauchbaren Bereich, wenn nichts da ist", () => {
    const empty = sectionBoundsOf([]);
    expect(sectionOffsetLimits(empty, "x")).toEqual({ min: -100, max: 100 });
  });

  it("haelt die Stelle in den Grenzen", () => {
    expect(clampSectionOffset(20, BOX, "y")).toBe(20);
    expect(clampSectionOffset(999, BOX, "y")).toBeCloseTo(40.8, 6);
    expect(clampSectionOffset(-999, BOX, "y")).toBeCloseTo(-0.8, 6);
  });

  it("faengt eine Stelle ab, die keine Zahl ist", () => {
    expect(clampSectionOffset(Number.NaN, BOX, "y")).toBeCloseTo(20, 6);
  });

  it("fangt in der Mitte an", () => {
    expect(sectionCentre(BOX, "y")).toBe(20);
    expect(sectionCentre(BOX, "x")).toBe(0);
    expect(sectionCentre(sectionBoundsOf([]), "x")).toBe(0);
  });
});

describe("Der Rahmen um mehrere Koerper", () => {
  it("schliesst alle ein", () => {
    const bounds = sectionBoundsOf([
      { min: { x: -10, y: 0, z: -5 }, max: { x: 10, y: 40, z: 5 } },
      { min: { x: 20, y: -3, z: 0 }, max: { x: 30, y: 10, z: 8 } },
    ]);
    expect(bounds.min).toEqual({ x: -10, y: -3, z: -5 });
    expect(bounds.max).toEqual({ x: 30, y: 40, z: 8 });
  });
});
