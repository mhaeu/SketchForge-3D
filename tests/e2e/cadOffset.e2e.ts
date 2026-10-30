import { beforeAll, describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { OcctKernel } from "occt-wasm";
import { CANNOT_OFFSET_MESSAGE, offsetSolid } from "@/lib/cadOffset";

// Ein Koerper entlang seiner Flaechen gewachsen oder geschrumpft, fuer das Spiel einer Passung.
describe("offsetting a solid with the real OCCT kernel", () => {
  let kernel: OcctKernel;

  beforeAll(async () => {
    const wasm = join(dirname(fileURLToPath(import.meta.resolve("occt-wasm"))), "occt-wasm.wasm");
    kernel = await OcctKernel.init({ wasm });
  });

  it("grows a box by the distance on every side, with sharp corners", () => {
    const box = kernel.makeBox(40, 30, 20);
    const result = offsetSolid(kernel, box, 0.2, false, "sharp");
    expect(kernel.isValid(result)).toBe(true);
    expect(kernel.getVolume(result)).toBeCloseTo(40.4 * 30.4 * 20.4, 3);
    const bounds = kernel.getBoundingBox(result, false);
    expect(bounds.xmax - bounds.xmin).toBeCloseTo(40.4, 4);
    expect(bounds.ymax - bounds.ymin).toBeCloseTo(30.4, 4);
    expect(bounds.zmax - bounds.zmin).toBeCloseTo(20.4, 4);
    kernel.release(result);
    kernel.release(box);
  });

  it("rounds the corners of the grown box when asked", () => {
    const box = kernel.makeBox(40, 30, 20);
    const sharp = offsetSolid(kernel, box, 2, false, "sharp");
    const round = offsetSolid(kernel, box, 2, false, "round");
    // Rund: der Quader, sechs Platten, zwoelf Viertelzylinder, acht Kugelachtel.
    const expected = 40 * 30 * 20 + 2 * 2 * (40 * 30 + 40 * 20 + 30 * 20) + Math.PI * 4 * (40 + 30 + 20) + (4 / 3) * Math.PI * 8;
    expect(kernel.getVolume(sharp)).toBeCloseTo(44 * 34 * 24, 3);
    expect(kernel.getVolume(round)).toBeCloseTo(expected, 0);
    [sharp, round, box].forEach((handle) => kernel.release(handle));
  });

  it("shrinks a box, and grows a plate with a hole", () => {
    const box = kernel.makeBox(40, 30, 20);
    const small = offsetSolid(kernel, box, 1, true, "sharp");
    expect(kernel.getVolume(small)).toBeCloseTo(38 * 28 * 18, 3);
    const pin = kernel.translate(kernel.makeCylinder(5, 20), 20, 15, 0);
    const plateBox = kernel.makeBox(40, 30, 20);
    const plate = kernel.cut(plateBox, pin);
    const grown = offsetSolid(kernel, plate, 0.5, false, "sharp");
    expect(kernel.isValid(grown)).toBe(true);
    // Aussen 41 x 31 x 21, das Loch schrumpft auf r 4,5 und bleibt 21 hoch.
    expect(kernel.getVolume(grown)).toBeCloseTo(41 * 31 * 21 - Math.PI * 4.5 * 4.5 * 21, 1);
    [small, grown, box, plate, plateBox, pin].forEach((handle) => kernel.release(handle));
  });

  it("refuses a shrink that eats the whole body", () => {
    const box = kernel.makeBox(4, 4, 4);
    expect(() => offsetSolid(kernel, box, 5, true)).toThrow(CANNOT_OFFSET_MESSAGE);
    kernel.release(box);
  });
});
