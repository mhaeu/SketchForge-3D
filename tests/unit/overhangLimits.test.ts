import { describe, expect, it } from "vitest";
import {
  DEFAULT_OVERHANG_ANGLE,
  MAX_OVERHANG_ANGLE,
  MIN_OVERHANG_ANGLE,
  normalizeOverhangAngle,
  OVERHANG_ANGLE_MARGIN,
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
  it("liegt bei 45 Grad in der Mitte, ein Haar darueber", () => {
    expect(overhangDownwardLimit(45)).toBeCloseTo(Math.sin(((45 + OVERHANG_ANGLE_MARGIN) * Math.PI) / 180), 12);
    expect(overhangDownwardLimit(45) - Math.SQRT1_2).toBeCloseTo(0.000123, 6);
  });

  /**
   * Das Haar ueber dem Winkel: Eine Flaeche **genau** auf dem Winkel - die
   * Fase von 45 Grad bei der Vorgabe von 45 - bleibt aussen vor, auch wenn
   * ihre Normale um das Rauschen eines float32 daneben liegt. Eine Flaeche,
   * die wirklich steiler haengt, wird weiter gefangen: bei 45,02 Grad schon.
   */
  it("laesst eine Flaeche genau auf dem Winkel aussen vor", () => {
    const limit = overhangDownwardLimit(45);
    const at = (degrees: number) => Math.sin((degrees * Math.PI) / 180);
    expect(at(45) > limit).toBe(false);
    // Das gemessene Rauschen einer echten Fase aus dem Kern: 1,2e-8.
    expect(at(45) + 1.2e-8 > limit).toBe(false);
    // Und das der Ansicht, die je Bildpunkt neu normiert: etwa 1e-7.
    expect(at(45) + 1e-7 > limit).toBe(false);
    // Knapp darueber - das Haar ist 0,01 Grad breit.
    expect(at(45.02) > limit).toBe(true);
    expect(at(45.4) > limit).toBe(true);
  });

  it("wird mit kleinerem Winkel strenger", () => {
    expect(overhangDownwardLimit(30)).toBeCloseTo(Math.sin(((30 + OVERHANG_ANGLE_MARGIN) * Math.PI) / 180), 12);
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
    expect(overhangDownwardLimit(Number.NaN)).toBeCloseTo(overhangDownwardLimit(DEFAULT_OVERHANG_ANGLE), 12);
  });
});
