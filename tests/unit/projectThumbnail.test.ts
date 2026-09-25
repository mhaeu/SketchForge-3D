import { describe, expect, it } from "vitest";
import {
  PROJECT_THUMBNAIL_DIR_MAX_BYTES,
  projectThumbnailDimensions,
  projectThumbnailSceneChanged,
  thumbnailsToDrop,
} from "@/lib/projectThumbnail";

describe("project thumbnails", () => {
  it("reduces a high-DPI editor canvas to the thumbnail bounds", () => {
    expect(projectThumbnailDimensions(2048, 992)).toEqual({ width: 512, height: 248 });
    expect(projectThumbnailDimensions(800, 1200)).toEqual({ width: 213, height: 320 });
    expect(projectThumbnailDimensions(320, 180)).toEqual({ width: 320, height: 180 });
  });

  it("captures only changed scenes within the same project", () => {
    const original = { projectId: "project-1", fingerprint: "scene-a" };
    expect(projectThumbnailSceneChanged(null, original)).toBe(false);
    expect(projectThumbnailSceneChanged(original, original)).toBe(false);
    expect(projectThumbnailSceneChanged(original, { ...original, fingerprint: "scene-b" })).toBe(true);
    expect(projectThumbnailSceneChanged(original, { projectId: "project-2", fingerprint: "scene-b" })).toBe(false);
  });
});

/**
 * Die Route, die diese Bilder ablegt, hat keine Anmeldung. Wer sie erreicht,
 * kann unter immer neuen Kennungen hochladen - die Grenze von 5 MB je Bild
 * haelt das nicht auf, nur eine Grenze fuer den ganzen Ordner tut das.
 */
describe("die Grenze fuer den Bilderordner", () => {
  const mb = 1024 * 1024;
  const file = (name: string, bytes: number, writtenAt: number) => ({ path: name, bytes, writtenAt });

  it("laesst alles stehen, solange der Ordner passt", () => {
    const stored = [file("a.png", 10 * mb, 1), file("b.png", 10 * mb, 2)];
    expect(thumbnailsToDrop(stored, "b.png", 100 * mb)).toEqual([]);
  });

  it("wirft die aeltesten weg, bis es wieder passt - und nur so viele", () => {
    // Bewusst nach Alter absteigend, damit das blosse Durchlaufen der Liste
    // die falschen Bilder erwischen wuerde: Es zaehlt das Schreibdatum.
    const stored = [
      file("neu.png", 30 * mb, 400),
      file("juenger.png", 30 * mb, 300),
      file("mittel.png", 30 * mb, 200),
      file("alt.png", 30 * mb, 100),
    ];
    // 120 MB bei 70 MB Grenze: zwei muessen weg, das dritte bleibt stehen.
    expect(thumbnailsToDrop(stored, "neu.png", 70 * mb)).toEqual(["alt.png", "mittel.png"]);
    // Und bei 100 MB reicht ein einziges - es wird nicht auf Vorrat geraeumt.
    expect(thumbnailsToDrop(stored, "neu.png", 100 * mb)).toEqual(["alt.png"]);
  });

  it("raeumt das gerade geschriebene Bild nie selbst weg", () => {
    // Das neue Bild ist fuer sich schon zu gross. Ohne diese Ausnahme wuerde
    // jeder Upload sich unmittelbar selbst loeschen.
    const stored = [file("alt.png", 1 * mb, 1), file("neu.png", 200 * mb, 2)];
    const dropped = thumbnailsToDrop(stored, "neu.png", 100 * mb);
    expect(dropped).not.toContain("neu.png");
    expect(dropped).toEqual(["alt.png"]);
  });

  it("haelt an einer Grenze fest, die eine Platte nicht fuellt", () => {
    expect(PROJECT_THUMBNAIL_DIR_MAX_BYTES).toBe(256 * mb);
  });
});
