import { describe, expect, it } from "vitest";
import { clampBuildHeight } from "@/lib/buildVolume";
import {
  PRINTER_PRESETS,
  PRINTER_PRESETS_SOURCE,
  PRINTER_VENDORS,
  normalizePrinterId,
  printerPresetById,
  workspaceForPrinter,
} from "@/lib/printerPresets";

describe("Die Druckerliste", () => {
  it("fuehrt genug Geraete, um die ueblichen abzudecken", () => {
    expect(PRINTER_PRESETS.length).toBeGreaterThan(150);
    expect(PRINTER_PRESETS_SOURCE).toMatch(/OrcaSlicer/);
  });

  it("nennt jede Kennung nur einmal", () => {
    expect(new Set(PRINTER_PRESETS.map((preset) => preset.id)).size).toBe(PRINTER_PRESETS.length);
  });

  /**
   * Jede Zahl muss als Arbeitsebene brauchbar sein: Ein Nullmass oder eine
   * fehlende Bauhoehe wuerde die Ansicht und die Hoehenwarnung zum Unsinn
   * machen.
   */
  it("hat fuer jedes Geraet drei brauchbare Masse", () => {
    PRINTER_PRESETS.forEach((preset) => {
      expect(preset.width, preset.id).toBeGreaterThan(50);
      expect(preset.depth, preset.id).toBeGreaterThan(50);
      expect(preset.height, preset.id).toBeGreaterThan(50);
      expect(Math.max(preset.width, preset.depth, preset.height), preset.id).toBeLessThan(2000);
      expect(preset.vendor.length, preset.id).toBeGreaterThan(0);
      expect(preset.model.length, preset.id).toBeGreaterThan(0);
    });
  });

  it("fuehrt jeden Hersteller einmal und in der Reihenfolge der Liste", () => {
    expect(new Set(PRINTER_VENDORS).size).toBe(PRINTER_VENDORS.length);
    expect(PRINTER_VENDORS[0]).toBe(PRINTER_PRESETS[0].vendor);
    PRINTER_PRESETS.forEach((preset) => {
      expect(PRINTER_VENDORS, preset.id).toContain(preset.vendor);
    });
  });

  /** Eine Stichprobe, die stehen muss: Die Masse sind keine Platzhalter. */
  it("kennt die Masse eines bekannten Geraets", () => {
    const bambu = printerPresetById("bambu-lab-p1s");
    expect(bambu).toMatchObject({ vendor: "Bambu Lab", model: "P1S", width: 256, depth: 256, height: 250 });
  });
});

describe("Ein Drucker aus einem Projekt", () => {
  it("wird an seiner Kennung wiedergefunden", () => {
    expect(printerPresetById("bambu-lab-a1-mini")?.model).toBe("A1 mini");
  });

  it("ist nichts, wo nichts steht", () => {
    expect(printerPresetById("")).toBeNull();
    expect(printerPresetById(null)).toBeNull();
    expect(printerPresetById(undefined)).toBeNull();
  });

  /**
   * Ein Projekt kann mit einem Geraet gespeichert sein, das die Liste nicht
   * mehr fuehrt. Dann steht dort wieder nichts - die Masse der Arbeitsebene
   * sind ohnehin mitgespeichert und bleiben stehen.
   */
  it("faellt auf nichts zurueck, wenn die Liste ihn nicht mehr fuehrt", () => {
    expect(printerPresetById("ein-drucker-von-gestern")).toBeNull();
    expect(normalizePrinterId("ein-drucker-von-gestern")).toBe("");
    expect(normalizePrinterId(42)).toBe("");
    expect(normalizePrinterId(undefined)).toBe("");
    expect(normalizePrinterId("bambu-lab-p1s")).toBe("bambu-lab-p1s");
  });
});

describe("Was die Wahl eines Druckers aendert", () => {
  /**
   * Der Kern der Sache: Ein Geraet setzt auch die Bauhoehe. Vorher stand sie
   * als eigene Zahl da und musste nachgetragen werden - und wer sie vergass,
   * bekam die Hoehenwarnung des falschen Druckers.
   */
  it("setzt Platte und Bauhoehe zusammen", () => {
    expect(workspaceForPrinter("bambu-lab-p1s")).toEqual({
      printer: "bambu-lab-p1s",
      width: 256,
      depth: 256,
      buildHeight: 250,
      sizePreset: "Custom",
    });
  });

  it("tut das fuer jedes Geraet der Liste", () => {
    PRINTER_PRESETS.forEach((preset) => {
      const patch = workspaceForPrinter(preset.id);
      expect(patch.width, preset.id).toBe(preset.width);
      expect(patch.depth, preset.id).toBe(preset.depth);
      expect(patch.buildHeight, preset.id).toBe(clampBuildHeight(preset.height));
      // Keine Bauhoehe darf an der Grenze haengenbleiben und still eine
      // andere werden als die des Geraets.
      expect(patch.buildHeight, preset.id).toBe(preset.height);
    });
  });

  /**
   * "Eigene Masse" leert nur die Kennung. Die Masse bleiben stehen - sie
   * zurueckzusetzen wuerde eine von Hand eingetragene Arbeitsebene
   * zerstoeren.
   */
  it("ruehrt die Masse nicht an, wenn kein Geraet gewaehlt ist", () => {
    expect(workspaceForPrinter("")).toEqual({ printer: "" });
    expect(workspaceForPrinter("ein-drucker-von-gestern")).toEqual({ printer: "" });
    expect(workspaceForPrinter(null)).toEqual({ printer: "" });
  });
});
