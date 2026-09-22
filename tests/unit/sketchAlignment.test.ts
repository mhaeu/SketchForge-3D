import { describe, expect, it } from "vitest";
import { alignSketchPoint, type SketchAlignmentTarget } from "@/lib/sketchAlignment";

const targets: SketchAlignmentTarget[] = [
  { id: "a", x: 0, z: 0 },
  { id: "b", x: 20, z: 0 },
  { id: "c", x: 20, z: 15 },
];

/**
 * Hilfslinien im rechten Winkel: Wer einen Punkt in die Naehe der Breite oder
 * der Tiefe eines anderen zieht, soll dort einrasten und sehen, woran er
 * gerade ausgerichtet ist - ohne nachmessen zu muessen.
 */
describe("Punkte aneinander ausrichten", () => {
  it("rastet auf der Breite eines anderen Punktes ein", () => {
    const aligned = alignSketchPoint({ x: 19.4, z: 30 }, targets, 1);
    expect(aligned.point).toEqual({ x: 20, z: 30 });
    expect(aligned.guides).toHaveLength(1);
    expect(aligned.guides[0].axis).toBe("x");
    // Die Linie laeuft von dem Punkt, an dem eingerastet wurde, zum Zeiger.
    expect(aligned.guides[0].to).toEqual({ x: 20, z: 30 });
  });

  it("rastet auf beiden Achsen zugleich ein", () => {
    // Die Ecke, die b und c aufspannen: Breite von b, Tiefe von c.
    const aligned = alignSketchPoint({ x: 20.3, z: 14.6 }, targets, 1);
    expect(aligned.point).toEqual({ x: 20, z: 15 });
    expect(aligned.guides.map((guide) => guide.axis)).toEqual(["x", "z"]);
    // Beide Linien enden am fertigen Punkt, nicht an einem Zwischenstand.
    aligned.guides.forEach((guide) => expect(guide.to).toEqual({ x: 20, z: 15 }));
  });

  it("nimmt den naechsten Nachbarn", () => {
    // 0,7 liegt naeher an d (0,9) als an a (0) - also gewinnt d.
    const aligned = alignSketchPoint({ x: 0.7, z: 40 }, [...targets, { id: "d", x: 0.9, z: 40 }], 1);
    expect(aligned.point.x).toBe(0.9);
  });

  it("laesst den Punkt in Ruhe, wo nichts in der Naehe ist", () => {
    const aligned = alignSketchPoint({ x: 8, z: 30 }, targets, 1);
    expect(aligned.point).toEqual({ x: 8, z: 30 });
    expect(aligned.guides).toEqual([]);
  });

  it("rastet nicht an sich selbst ein", () => {
    // Der gezogene Punkt ist selbst Teil der Zeichnung - ohne diese Ausnahme
    // klebte er an seiner eigenen alten Stelle fest.
    const aligned = alignSketchPoint({ x: 20.2, z: 0.2 }, targets, 1, "b");
    expect(aligned.point).toEqual({ x: 20, z: 0 });
    // Die Breite kam von c, die Tiefe von a - b selbst war ausgenommen.
    expect(aligned.guides.map((guide) => [guide.axis, guide.from])).toEqual([
      ["x", { x: 20, z: 15 }],
      ["z", { x: 0, z: 0 }],
    ]);
  });

  it("tut nichts ohne Spielraum", () => {
    expect(alignSketchPoint({ x: 19.9, z: 0 }, targets, 0).guides).toEqual([]);
  });
});
