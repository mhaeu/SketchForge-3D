import { describe, expect, it } from "vitest";
import { safeFileName, uniqueFileName } from "@/lib/fileDownload";

describe("Ein Name, der sich ablegen laesst", () => {
  it("laesst einen gewoehnlichen Namen in Ruhe", () => {
    expect(safeFileName("Halterung fuer die Lampe")).toBe("Halterung fuer die Lampe");
  });

  it("nimmt heraus, was in einem Dateinamen nicht geht", () => {
    expect(safeFileName('Deckel: 3/4" <neu>')).toBe("Deckel 3 4 neu");
  });

  it("nimmt den Punkt am Anfang weg - er machte die Datei unsichtbar", () => {
    expect(safeFileName("...Entwurf")).toBe("Entwurf");
  });

  it("nimmt den Punkt am Ende weg - Windows haengt sonst an ihm", () => {
    expect(safeFileName("Entwurf.")).toBe("Entwurf");
  });

  it("gibt den Ausweichnamen, wenn nichts uebrig bleibt", () => {
    expect(safeFileName("///")).toBe("design");
    expect(safeFileName("   ", "Zeichnung")).toBe("Zeichnung");
  });

  it("kuerzt sehr lange Namen", () => {
    expect(safeFileName("x".repeat(200))).toHaveLength(80);
  });
});

describe("Zweimal derselbe Name", () => {
  it("haengt ab dem zweiten eine Zahl an, vor der Endung", () => {
    const taken = new Set<string>();
    expect(uniqueFileName("Deckel.skf", taken)).toBe("Deckel.skf");
    expect(uniqueFileName("Deckel.skf", taken)).toBe("Deckel (2).skf");
    expect(uniqueFileName("Deckel.skf", taken)).toBe("Deckel (3).skf");
  });

  /**
   * Gross- und Kleinschreibung zaehlt nicht: Auf Windows und macOS waeren
   * "Deckel.skf" und "deckel.skf" dieselbe Datei, und im Archiv lagen dann
   * zwei Namen, von denen beim Auspacken einer verschwindet.
   */
  it("unterscheidet nicht nach Gross- und Kleinschreibung", () => {
    const taken = new Set<string>();
    expect(uniqueFileName("Deckel.skf", taken)).toBe("Deckel.skf");
    expect(uniqueFileName("deckel.skf", taken)).toBe("deckel (2).skf");
  });

  it("kommt auch mit einem Namen ohne Endung zurecht", () => {
    const taken = new Set<string>();
    expect(uniqueFileName("Entwurf", taken)).toBe("Entwurf");
    expect(uniqueFileName("Entwurf", taken)).toBe("Entwurf (2)");
  });
});
