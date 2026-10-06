import { describe, expect, it } from "vitest";
import {
  DEFAULT_OVERHANG_ANGLE,
  MAX_OVERHANG_ANGLE,
  MIN_OVERHANG_ANGLE,
  normalizeOverhangAngle,
  overhangDownwardLimit,
} from "@/lib/overhangLimits";

describe("Der Ueberhangwinkel", () => {
  it("bleibt in den Grenzen", () => {
    expect(normalizeOverhangAngle(45)).toBe(45);
    expect(normalizeOverhangAngle(0)).toBe(MIN_OVERHANG_ANGLE);
    expect(normalizeOverhangAngle(90)).toBe(MAX_OVERHANG_ANGLE);
  });

  it("nimmt ganze Grade", () => {
    expect(normalizeOverhangAngle(47.4)).toBe(47);
    expect(normalizeOverhangAngle(47.6)).toBe(48);
  });

  it("faellt auf den Vorgabewinkel zurueck, wenn nichts Brauchbares kommt", () => {
    expect(normalizeOverhangAngle(undefined)).toBe(DEFAULT_OVERHANG_ANGLE);
    expect(normalizeOverhangAngle("50")).toBe(DEFAULT_OVERHANG_ANGLE);
    expect(normalizeOverhangAngle(Number.NaN)).toBe(DEFAULT_OVERHANG_ANGLE);
    expect(normalizeOverhangAngle(Number.NaN, 60)).toBe(60);
  });
});

describe("Ab wann eine Flaeche ueberhaengt", () => {
  /**
   * Der Winkel zaehlt von der Senkrechten, darum der Sinus: Eine senkrechte
   * Wand zeigt mit `-normal.y = 0` nach unten, eine waagerechte Decke mit 1.
   */
  it("liegt bei 45 Grad in der Mitte", () => {
    expect(overhangDownwardLimit(45)).toBeCloseTo(Math.SQRT1_2, 12);
  });

  it("wird mit kleinerem Winkel strenger", () => {
    expect(overhangDownwardLimit(30)).toBeCloseTo(0.5, 12);
    expect(overhangDownwardLimit(30)).toBeLessThan(overhangDownwardLimit(45));
    expect(overhangDownwardLimit(70)).toBeGreaterThan(overhangDownwardLimit(45));
  });

  /**
   * Die Faelle, auf die es in der Ansicht ankommt: Eine senkrechte Wand ist
   * nie ein Ueberhang, eine waagerechte Decke immer - bei jedem Winkel, den
   * man einstellen kann.
   */
  it("laesst Waende stehen und faengt Decken, bei jedem Winkel", () => {
    for (let angle = MIN_OVERHANG_ANGLE; angle <= MAX_OVERHANG_ANGLE; angle += 5) {
      const limit = overhangDownwardLimit(angle);
      // Senkrechte Wand: Normale waagerecht, -normal.y = 0.
      expect(0 > limit, `Wand bei ${angle}`).toBe(false);
      // Waagerechte Decke: Normale zeigt gerade nach unten, -normal.y = 1.
      expect(1 > limit, `Decke bei ${angle}`).toBe(true);
    }
  });

  it("haelt sich auch an einen unbrauchbaren Winkel nicht fest", () => {
    expect(overhangDownwardLimit(Number.NaN)).toBeCloseTo(Math.SQRT1_2, 12);
  });
});
