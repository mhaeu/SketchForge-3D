import { describe, expect, it } from "vitest";
import { importExtensionSupported } from "@/lib/importExtensions";

describe("importExtensionSupported", () => {
  it("accepts STL, OBJ, 3MF, and SVG imports", () => {
    expect(importExtensionSupported("part.stl")).toBe(true);
    // 3MF ist das Hausformat von PrusaSlicer, OrcaSlicer, Bambu Studio und
    // Cura - damit kommt ein Modell ohne Umweg ueber STL zurueck.
    expect(importExtensionSupported("teil.3mf")).toBe(true);
    expect(importExtensionSupported("TEIL.3MF")).toBe(true);
    expect(importExtensionSupported("assembly.obj")).toBe(true);
    expect(importExtensionSupported("MODEL.OBJ")).toBe(true);
    expect(importExtensionSupported("logo.svg")).toBe(true);
    expect(importExtensionSupported("profile.SVG")).toBe(true);
  });

  it("rejects unsupported dashboard import extensions", () => {
    expect(importExtensionSupported("drawing.png")).toBe(false);
    expect(importExtensionSupported("assembly.step")).toBe(false);
  });
});
