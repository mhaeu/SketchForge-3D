import { describe, expect, it } from "vitest";
import { mirrorSketchPoints, rotateSketchPoints, selectedSketchPoints } from "@/lib/sketchRotation";
import type { SketchProfile } from "@/types/sketchforge";

const rectangle: SketchProfile = {
  points: [
    { id: "a", x: 0, z: 0, handleOut: { x: 1, z: 0 } },
    { id: "b", x: 4, z: 0 },
    { id: "c", x: 4, z: 2 },
    { id: "d", x: 0, z: 2 },
  ],
  segments: [
    { id: "ab", startId: "a", endId: "b" },
    { id: "bc", startId: "b", endId: "c" },
    { id: "cd", startId: "c", endId: "d" },
    { id: "da", startId: "d", endId: "a" },
  ],
};

describe("Drehen und Spiegeln in der Skizze", () => {
  it("nimmt jede Auswahl von mindestens zwei Punkten", () => {
    // Geschlossen sein muss dabei nichts: ein offener Zug dreht sich so gut
    // wie ein Rechteck, und frueher ging beides nur am geschlossenen Umriss.
    const open = selectedSketchPoints(rectangle, { pointIds: ["a", "b"], segmentIds: ["ab"] });
    expect(open?.map((point) => point.id)).toEqual(["a", "b"]);
    const whole = selectedSketchPoints(rectangle, { pointIds: ["a", "b", "c", "d"], segmentIds: [] });
    expect(whole?.map((point) => point.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("laesst einen einzelnen Punkt und ein Vorlagenbild aussen vor", () => {
    // Ein Punkt hat keine Ausdehnung, um die sich etwas drehen liesse.
    expect(selectedSketchPoints(rectangle, { pointIds: ["a"], segmentIds: [] })).toBeNull();
    // Ein Bild haengt an eigenen Feldern und wird hier nicht mitgedreht.
    expect(selectedSketchPoints(rectangle, {
      pointIds: ["a", "b", "c", "d"],
      segmentIds: [],
      imageIds: ["reference-image"],
    })).toBeNull();
  });

  it("rotates points and bezier handles around the selection bounds center", () => {
    const rotated = rotateSketchPoints(rectangle.points, 90);
    const first = rotated.find((point) => point.id === "a");
    expect(first?.x).toBeCloseTo(3, 8);
    expect(first?.z).toBeCloseTo(-1, 8);
    expect(first?.handleOut?.x).toBeCloseTo(3, 8);
    expect(first?.handleOut?.z).toBeCloseTo(0, 8);
  });

  it("spiegelt an der Mittellinie der Auswahl, samt Kurvengriffen", () => {
    const mirrored = mirrorSketchPoints(rectangle.points, "x");
    // Die Mitte liegt bei x = 2, also tauschen 0 und 4 die Plaetze.
    expect(mirrored.map((point) => point.x)).toEqual([4, 0, 0, 4]);
    // Quer dazu bleibt alles stehen.
    expect(mirrored.map((point) => point.z)).toEqual([0, 0, 2, 2]);
    // Der Griff wandert mit: er sass 1 rechts von a, jetzt sitzt er 1 links.
    expect(mirrored.find((point) => point.id === "a")?.handleOut).toEqual({ x: 3, z: 0 });
  });

  it("spiegelt oben und unten genauso", () => {
    const mirrored = mirrorSketchPoints(rectangle.points, "z");
    expect(mirrored.map((point) => point.z)).toEqual([2, 2, 0, 0]);
    expect(mirrored.map((point) => point.x)).toEqual([0, 4, 4, 0]);
  });

  it("bringt zweimal Spiegeln an dieselbe Stelle zurueck", () => {
    const there = mirrorSketchPoints(rectangle.points, "x");
    const back = mirrorSketchPoints(there, "x");
    expect(back.map((point) => [point.x, point.z])).toEqual(rectangle.points.map((point) => [point.x, point.z]));
  });
});
