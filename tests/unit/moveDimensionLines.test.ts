import { describe, expect, it } from "vitest";
import { createMoveDimensionOverlay, formatMoveDimension, pointAlongAxis } from "@/lib/moveDimensionLines";
import { placementWorkplaneFromSurface } from "@/lib/placementWorkplane";

describe("move dimension lines", () => {
  const project = ({ x, z }: { x: number; y: number; z: number }) => ({ x: 400 + x * 4, y: 300 + z * 4 });

  it("creates signed X and Z measurements from the common drag origin", () => {
    const overlay = createMoveDimensionOverlay({
      origin: { x: 10, y: 0, z: -5 },
      deltaX: -14,
      deltaZ: -17,
      accuracy: 2,
      width: 800,
      height: 600,
      project,
    });

    expect(overlay?.lines.map((line) => [line.axis, line.label])).toEqual([
      ["x", "-14.00"],
      ["z", "-17.00"],
    ]);
    expect(overlay?.lines[0]).toMatchObject({ x1: 452, y1: 280, x2: 384, y2: 280 });
    expect(overlay?.lines[1]).toMatchObject({ x1: 440, y1: 292, x2: 440, y2: 212 });
    expect(overlay?.guides).toEqual([
      { axis: "x", x1: 384, y1: 280, x2: 384, y2: 212 },
      { axis: "z", x1: 440, y1: 212, x2: 384, y2: 212 },
    ]);
  });

  it("uses the workspace accuracy and suppresses near-zero movement", () => {
    expect(formatMoveDimension(-0.0001, 2)).toBe("0.00");
    expect(createMoveDimensionOverlay({
      origin: { x: 0, y: 0, z: 0 },
      deltaX: 0.004,
      deltaZ: -0.004,
      accuracy: 2,
      width: 800,
      height: 600,
      project,
    })).toBeNull();
  });

  it("shows only the axis that actually moved", () => {
    const overlay = createMoveDimensionOverlay({
      origin: { x: 0, y: 0, z: 0 },
      deltaX: 12.5,
      deltaZ: 0,
      accuracy: 1,
      width: 800,
      height: 600,
      project,
    });

    expect(overlay?.lines).toHaveLength(1);
    expect(overlay?.lines[0]).toMatchObject({ axis: "x", label: "12.5" });
  });

  it("keeps a single-axis label on a stable side when projection noise changes sign", () => {
    const makeOverlay = (noise: number) => createMoveDimensionOverlay({
      origin: { x: 0, y: 0, z: 0 },
      deltaX: 12.5,
      deltaZ: 0,
      accuracy: 1,
      width: 800,
      height: 600,
      project: ({ x, z }) => ({
        x: 400 + x * 4,
        y: 300 + z * 4 + (x === 0 && z === 0 ? noise : 0),
      }),
    });

    const above = makeOverlay(0.001)?.lines[0];
    const below = makeOverlay(-0.001)?.lines[0];
    expect(above?.labelY).toBeGreaterThan(300);
    expect(below?.labelY).toBeGreaterThan(300);
  });

  /**
   * Bis hierher zeigte die Anzeige nur auf der Hauptarbeitsebene etwas: sie
   * rechnete in Weltachsen, und auf einer gekippten Flaeche haetten ihre
   * Linien neben der Flaeche gelegen statt darin.
   */
  it("misst auf einer gekippten Arbeitsebene laengs deren Achsen", () => {
    // Eine Flaeche, die senkrecht steht: ihre Normale zeigt nach oben-vorn.
    const upright = placementWorkplaneFromSurface({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, { x: 1, y: 0, z: 0 });
    // Ein Zeiger, der die Hoehe sichtbar macht: y geht in die Bildschirm-Y ein.
    const spatial = ({ x, y, z }: { x: number; y: number; z: number }) => ({ x: 400 + x * 4 + z * 3, y: 300 - y * 4 + z * 2 });
    const overlay = createMoveDimensionOverlay({
      origin: { x: 0, y: 0, z: 0 },
      xAxis: upright.xAxis,
      zAxis: upright.zAxis,
      deltaX: 10,
      deltaZ: 20,
      accuracy: 2,
      width: 800,
      height: 600,
      project: spatial,
    });
    expect(overlay?.lines.map((line) => line.label)).toEqual(["10.00", "20.00"]);
    // Die Querachse dieser Flaeche zeigt senkrecht nach oben oder unten, also
    // laeuft die zweite Masslinie im Bild senkrecht - waagerecht waere sie
    // nur, wenn weiter in Weltachsen gerechnet wuerde.
    const across = overlay!.lines[1];
    expect(Math.abs(across.x2 - across.x1)).toBeLessThan(1e-6);
    expect(Math.abs(across.y2 - across.y1)).toBeGreaterThan(50);
  });

  it("legt einen Punkt laengs einer Achse ab", () => {
    expect(pointAlongAxis({ x: 1, y: 2, z: 3 }, { x: 0, y: 1, z: 0 }, 4)).toEqual({ x: 1, y: 6, z: 3 });
  });
});
