import { describe, expect, it } from "vitest";
import {
  CUSTOM_SNAP_GRID_DIVISORS,
  FIXED_SNAP_GRIDS,
  MAX_CUSTOM_SNAP_GRIDS,
  MAX_CUSTOM_SNAP_GRID_NAME,
  customSnapGridLabel,
  customSnapGridSize,
  normalizeCustomSnapGrids,
  normalizeSnapGrid,
  parseCustomSnapGrid,
  snapGridOptions,
  snapGridStep,
} from "@/lib/workplaneSettings";
import type { CustomSnapGrid } from "@/types/sketchforge";

/** Das Lochraster von Platinen und Steckerleisten: 2,54 mm. */
const pinPitch: CustomSnapGrid = { name: "Lochraster", size: 2.54 };

describe("Ein eigenes Rastermass als Fangschritt", () => {
  it("laesst sich schreiben und wieder lesen", () => {
    expect(customSnapGridSize(2.54, 2)).toBe("custom:2.54:2");
    expect(parseCustomSnapGrid("custom:2.54:2")).toEqual({ size: 2.54, divisor: 2 });
  });

  it("liest nichts aus allem anderen", () => {
    expect(parseCustomSnapGrid("1.0 mm")).toBeNull();
    expect(parseCustomSnapGrid("Brick")).toBeNull();
    expect(parseCustomSnapGrid("custom:zwei:2")).toBeNull();
    expect(parseCustomSnapGrid("custom:2.54")).toBeNull();
    expect(parseCustomSnapGrid(254)).toBeNull();
    expect(parseCustomSnapGrid(null)).toBeNull();
  });

  /** Nur ganz, halb und geviertelt - ein anderer Teiler ist kein Schritt von uns. */
  it("nimmt nur die drei Teiler", () => {
    CUSTOM_SNAP_GRID_DIVISORS.forEach((divisor) => {
      expect(parseCustomSnapGrid(`custom:2.54:${divisor}`)?.divisor).toBe(divisor);
    });
    expect(parseCustomSnapGrid("custom:2.54:3")).toBeNull();
    expect(parseCustomSnapGrid("custom:2.54:0")).toBeNull();
  });

  it("weist ein Mass ausserhalb der Grenzen ab", () => {
    expect(parseCustomSnapGrid("custom:0:1")).toBeNull();
    expect(parseCustomSnapGrid("custom:5000:1")).toBeNull();
  });
});

describe("Der Fangschritt in Millimetern", () => {
  it("bleibt bei den festen Stufen, wie er war", () => {
    expect(snapGridStep("Off")).toBe(0);
    expect(snapGridStep("Brick")).toBe(8);
    expect(snapGridStep("2.0 mm")).toBe(2);
    expect(snapGridStep("0.25 mm")).toBe(0.25);
  });

  /**
   * Der Punkt der Sache: Vorher las `Number.parseFloat` an "custom:2.54:2"
   * nichts und landete still bei einem Millimeter.
   */
  it("teilt ein eigenes Mass nach seinem Teiler", () => {
    expect(snapGridStep("custom:2.54:1")).toBeCloseTo(2.54, 9);
    expect(snapGridStep("custom:2.54:2")).toBeCloseTo(1.27, 9);
    expect(snapGridStep("custom:2.54:4")).toBeCloseTo(0.635, 9);
  });
});

describe("Was das Fangmenue anbietet", () => {
  it("sind ohne eigene Masse genau die festen Stufen", () => {
    expect(snapGridOptions()).toEqual([...FIXED_SNAP_GRIDS]);
  });

  it("haengt jedes eigene Mass ganz, halb und geviertelt hinten an", () => {
    expect(snapGridOptions([pinPitch])).toEqual([
      ...FIXED_SNAP_GRIDS,
      "custom:2.54:1",
      "custom:2.54:2",
      "custom:2.54:4",
    ]);
  });

  it("nennt dasselbe Mass nicht doppelt", () => {
    const options = snapGridOptions([pinPitch, { name: "Noch einmal", size: 2.54 }]);
    expect(options.length).toBe(FIXED_SNAP_GRIDS.length + 3);
    expect(new Set(options).size).toBe(options.length);
  });
});

describe("Wie ein eigener Schritt heisst", () => {
  it("nennt Bruch und Namen", () => {
    expect(customSnapGridLabel("custom:2.54:1", [pinPitch])).toBe("1 × Lochraster");
    expect(customSnapGridLabel("custom:2.54:2", [pinPitch])).toBe("½ × Lochraster");
    expect(customSnapGridLabel("custom:2.54:4", [pinPitch])).toBe("¼ × Lochraster");
  });

  /**
   * Ein Projekt kann auf einem Mass stehen, das aus den Einstellungen
   * entfernt wurde. Dann sagt der Schritt seine Millimeter - er funktioniert
   * weiter, und man sieht, woran er haengt.
   */
  it("faellt auf die Millimeter zurueck, wenn das Mass nicht mehr da ist", () => {
    expect(customSnapGridLabel("custom:2.54:2", [])).toBe("½ × 2.54 mm");
  });

  it("nennt nichts fuer eine feste Stufe", () => {
    expect(customSnapGridLabel("1.0 mm", [pinPitch])).toBeNull();
    expect(customSnapGridLabel("Off")).toBeNull();
  });

  it("nimmt einen leeren Namen nicht", () => {
    expect(customSnapGridLabel("custom:2.54:1", [{ name: "   ", size: 2.54 }])).toBe("1 × 2.54 mm");
  });
});

describe("Die gespeicherten eigenen Masse", () => {
  it("bleiben, wenn sie brauchbar sind", () => {
    expect(normalizeCustomSnapGrids([pinPitch])).toEqual([pinPitch]);
  });

  it("werfen weg, was kein Mass ist", () => {
    expect(normalizeCustomSnapGrids([{ name: "Leer" }, { size: 0 }, { size: -3 }, "nein", null, 7])).toEqual([]);
  });

  it("halten das Mass in den Grenzen", () => {
    expect(normalizeCustomSnapGrids([{ name: "Winzig", size: 0.0001 }])[0].size).toBe(0.01);
    expect(normalizeCustomSnapGrids([{ name: "Riesig", size: 99999 }])[0].size).toBe(1000);
  });

  it("kuerzen einen langen Namen und schneiden Leerzeichen ab", () => {
    const long = "x".repeat(MAX_CUSTOM_SNAP_GRID_NAME + 20);
    expect(normalizeCustomSnapGrids([{ name: `  ${long}  `, size: 5 }])[0].name.length).toBe(MAX_CUSTOM_SNAP_GRID_NAME);
    expect(normalizeCustomSnapGrids([{ name: "  Raster  ", size: 5 }])[0].name).toBe("Raster");
  });

  it("nehmen nicht beliebig viele", () => {
    const many = Array.from({ length: MAX_CUSTOM_SNAP_GRIDS + 5 }, (_unused, index) => ({ name: `R${index}`, size: index + 1 }));
    expect(normalizeCustomSnapGrids(many).length).toBe(MAX_CUSTOM_SNAP_GRIDS);
  });

  it("faellt auf den Vorgabewert zurueck, wenn es keine Liste ist", () => {
    expect(normalizeCustomSnapGrids(undefined, [pinPitch])).toEqual([pinPitch]);
    expect(normalizeCustomSnapGrids("nein", [pinPitch])).toEqual([pinPitch]);
  });
});

describe("Ein gespeicherter Fangschritt", () => {
  it("bleibt ein eigener, auch wenn sein Mass aus den Einstellungen weg ist", () => {
    expect(normalizeSnapGrid("custom:2.54:2")).toBe("custom:2.54:2");
  });

  it("faellt bei Unsinn auf die Vorgabe zurueck", () => {
    expect(normalizeSnapGrid("custom:2.54:7")).toBe("1.0 mm");
    expect(normalizeSnapGrid("7 Ellen")).toBe("1.0 mm");
    expect(normalizeSnapGrid(undefined)).toBe("1.0 mm");
  });

  it("laesst die festen Stufen durch", () => {
    FIXED_SNAP_GRIDS.forEach((size) => {
      expect(normalizeSnapGrid(size)).toBe(size);
    });
  });
});
