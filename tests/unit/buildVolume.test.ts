import { describe, expect, it } from "vitest";
import { bodiesTooTall, clampBuildHeight, DEFAULT_BUILD_HEIGHT_MM } from "@/lib/buildVolume";
import { createReferencePoint } from "@/lib/referencePoint";
import type { WorkplaneShape } from "@/types/sketchforge";

function body(id: string, overrides: Partial<WorkplaneShape> = {}): WorkplaneShape {
  return {
    id, name: id, kind: "box", color: "#123456",
    x: 0, z: 0, elevation: 0, size: 20, width: 20, depth: 20, height: 20,
    rotation: 0, rotationX: 0, rotationZ: 0,
    ...overrides,
  } as WorkplaneShape;
}

describe("Zu hoch fuer den Drucker", () => {
  it("nennt den Koerper, der ueber die Bauhoehe hinausragt", () => {
    const tooTall = bodiesTooTall([body("klein", { height: 50 }), body("gross", { height: 300 })], 250);
    expect(tooTall.map((entry) => entry.id)).toEqual(["gross"]);
    expect(tooTall[0].over).toBeCloseTo(50, 6);
    expect(tooTall[0].top).toBeCloseTo(300, 6);
  });

  it("zaehlt die Hoehe ueber der Platte und nicht die Koerperhoehe", () => {
    // Ein flacher Koerper, aber weit oben: Er passt nicht.
    const tooTall = bodiesTooTall([body("schwebend", { height: 10, elevation: 260 })], 250);
    expect(tooTall).toHaveLength(1);
    expect(tooTall[0].over).toBeCloseTo(20, 6);
  });

  /**
   * Der Fall, den man am Drucker erst sieht: Ein gekippter Koerper ist hoeher
   * als seine Hoehe. Ein Kasten von 20 x 20, um 45 Grad gekippt, misst
   * senkrecht 20 * Wurzel(2) = 28,28.
   */
  it("rechnet mit dem gedrehten Koerper", () => {
    const tilted = body("gekippt", { height: 20, depth: 20, rotationX: 45 });
    // Senkrecht endet er bei 10 + 14,14 = 24,14: unter 20 passt er nicht mehr,
    // unter 25 gerade noch - aufrecht waeren es nur 20 gewesen.
    const tooTall = bodiesTooTall([tilted], 20);
    expect(tooTall).toHaveLength(1);
    expect(tooTall[0].top).toBeCloseTo(10 + Math.SQRT2 * 10, 4);
    expect(tooTall[0].over).toBeCloseTo(Math.SQRT2 * 10 - 10, 4);
    expect(bodiesTooTall([tilted], 25)).toHaveLength(0);
  });

  it("laesst Abzugskoerper, Helfer und Ausgeblendetes aus", () => {
    const shapes = [
      body("abzug", { height: 400, hole: true }),
      body("versteckt", { height: 400, hidden: true }),
      { ...createReferencePoint(), height: 400 } as WorkplaneShape,
      body("lineal", { height: 400, kind: "ruler" }),
    ];
    expect(bodiesTooTall(shapes, 250)).toEqual([]);
  });

  it("ordnet den groessten Ueberstand nach vorn", () => {
    const tooTall = bodiesTooTall([
      body("etwas", { height: 260 }),
      body("viel", { height: 500 }),
      body("mittel", { height: 300 }),
    ], 250);
    expect(tooTall.map((entry) => entry.id)).toEqual(["viel", "mittel", "etwas"]);
  });

  it("warnt nicht wegen eines Zehntelmillimeters", () => {
    expect(bodiesTooTall([body("knapp", { height: 250.05 })], 250)).toEqual([]);
    expect(bodiesTooTall([body("drueber", { height: 250.5 })], 250)).toHaveLength(1);
  });

  it("warnt gar nicht, wenn keine Bauhoehe gesetzt ist", () => {
    expect(bodiesTooTall([body("gross", { height: 900 })], 0)).toEqual([]);
    expect(bodiesTooTall([body("gross", { height: 900 })], Number.NaN)).toEqual([]);
  });
});

describe("Die eingestellte Bauhoehe", () => {
  it("bleibt in den Grenzen", () => {
    expect(clampBuildHeight(300)).toBe(300);
    expect(clampBuildHeight(0)).toBe(10);
    expect(clampBuildHeight(9999)).toBe(2000);
  });

  it("nimmt den ueblichen Wert, wenn nichts Brauchbares kommt", () => {
    expect(clampBuildHeight(undefined)).toBe(DEFAULT_BUILD_HEIGHT_MM);
    expect(clampBuildHeight("hoch")).toBe(DEFAULT_BUILD_HEIGHT_MM);
    expect(clampBuildHeight(Number.NaN)).toBe(DEFAULT_BUILD_HEIGHT_MM);
  });
});
