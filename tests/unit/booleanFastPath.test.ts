import { describe, expect, it } from "vitest";
import { isAxisAlignedBoxCutter } from "@/lib/booleanFastPath";
import type { WorkplaneShape } from "@/types/sketchforge";

function box(patch: Partial<WorkplaneShape> = {}): WorkplaneShape {
  return {
    id: "b", name: "Quader", kind: "box", color: "#fff",
    x: 0, z: 0, elevation: 0, size: 20, width: 20, depth: 20, height: 20,
    rotation: 0, rotationX: 0, rotationZ: 0,
    ...patch,
  } as WorkplaneShape;
}

describe("Wer als achsenparalleler Quader durchgeht", () => {
  it("der gerade stehende Quader", () => {
    expect(isAxisAlignedBoxCutter(box())).toBe(true);
    // Halbe und ganze Drehungen lassen ihn auf den Achsen stehen.
    expect(isAxisAlignedBoxCutter(box({ rotation: 180 }))).toBe(true);
    expect(isAxisAlignedBoxCutter(box({ rotationX: 360 }))).toBe(true);
    expect(isAxisAlignedBoxCutter(box({ rotationZ: -180 }))).toBe(true);
  });

  it("kein schraeg stehender und keine andere Art", () => {
    expect(isAxisAlignedBoxCutter(box({ rotation: 30 }))).toBe(false);
    expect(isAxisAlignedBoxCutter(box({ rotationX: 90 }))).toBe(false);
    expect(isAxisAlignedBoxCutter(box({ rotationZ: 0.5 }))).toBe(false);
    expect(isAxisAlignedBoxCutter(box({ kind: "cylinder" }))).toBe(false);
  });

  /**
   * Gemeldet bei Layerling aus dem Forum, und wir hatten es genauso: Ein
   * verjuengter Quader mit verjuengter Aussparung - ein Trichter, ein
   * Uebergangsstueck zwischen zwei Rechtecken - kam nach dem Gruppieren als
   * gerader Quader heraus. Die Schnellwege rechnen ihn als Kasten, und ein
   * Kasten kennt keine Verjuengung.
   */
  it("kein verformter Quader, so gerade er auch stehen mag", () => {
    // Verjuengung ueber die Deckmasse ...
    expect(isAxisAlignedBoxCutter(box({ taperTopWidth: 10 }))).toBe(false);
    expect(isAxisAlignedBoxCutter(box({ taperBottomDepth: 12 }))).toBe(false);
    // ... und ueber den Anteil.
    expect(isAxisAlignedBoxCutter(box({ taperTopScale: 0.5 }))).toBe(false);
    // Drall und Versatz.
    expect(isAxisAlignedBoxCutter(box({ extrudeTwist: 15 }))).toBe(false);
    expect(isAxisAlignedBoxCutter(box({ extrudeTopOffsetX: 4 }))).toBe(false);
    expect(isAxisAlignedBoxCutter(box({ extrudeTopOffsetZ: -4 }))).toBe(false);
    // Und unsere ungleichen Seitenhoehen, die Layerling nicht kennt.
    expect(isAxisAlignedBoxCutter(box({ taperHeightLeft: 0.5 }))).toBe(false);
    expect(isAxisAlignedBoxCutter(box({ taperHeightBack: 0.8 }))).toBe(false);
  });

  it("laesst einen Quader durch, dessen Verformung auf null steht", () => {
    // Die Felder sind gesetzt, aendern aber nichts - dann darf der Schnellweg
    // bleiben, sonst verliert jeder Quader ihn, der einmal angefasst wurde.
    expect(isAxisAlignedBoxCutter(box({ taperTopWidth: 20, taperTopDepth: 20, extrudeTwist: 0 }))).toBe(true);
    expect(isAxisAlignedBoxCutter(box({ taperTopScale: 1, taperBottomScale: 1 }))).toBe(true);
  });
});
