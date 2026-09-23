import { describe, expect, it } from "vitest";
import { alignSketchPoint, persistentSketchGuides, type SketchAlignmentTarget } from "@/lib/sketchAlignment";

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

describe("Dauerhafte Hilfslinien", () => {
  const targets = [
    { id: "a", x: 0, z: 0 },
    { id: "b", x: 4, z: 0 },
    { id: "c", x: 4, z: 3 },
    { id: "d", x: 0, z: 3 },
  ];

  it("verbindet Punkte gleicher Breite und gleicher Tiefe", () => {
    const guides = persistentSketchGuides(targets, []);
    expect(guides.filter((guide) => guide.axis === "x")).toHaveLength(2);
    expect(guides.filter((guide) => guide.axis === "z")).toHaveLength(2);
  });

  it("laesst weg, wo ohnehin eine Kante laeuft", () => {
    // Die Kante sagt schon, dass die beiden zusammengehoeren - eine
    // gestrichelte Linie daneben waere nur Rauschen.
    const guides = persistentSketchGuides(targets, [
      { startId: "a", endId: "b" },
      { startId: "b", endId: "c" },
      { startId: "c", endId: "d" },
      { startId: "d", endId: "a" },
    ]);
    expect(guides).toHaveLength(0);
  });

  it("verbindet nur die naechsten Nachbarn, nicht jeden mit jedem", () => {
    // Fuenf Punkte auf einer Senkrechten ergeben vier Linien und nicht zehn.
    const column = [0, 1, 2, 3, 4].map((index) => ({ id: `p${index}`, x: 2, z: index }));
    const guides = persistentSketchGuides(column, []);
    expect(guides.filter((guide) => guide.axis === "x")).toHaveLength(4);
    guides.forEach((guide) => expect(Math.abs(guide.to.z - guide.from.z)).toBeCloseTo(1, 9));
  });

  it("zaehlt einen einzelnen Punkt nicht und braucht keine Kanten", () => {
    expect(persistentSketchGuides([{ id: "a", x: 1, z: 1 }], [])).toEqual([]);
    expect(persistentSketchGuides([], [])).toEqual([]);
  });

  it("nimmt winzige Abweichungen als dieselbe Linie", () => {
    const nearly = [{ id: "a", x: 1, z: 0 }, { id: "b", x: 1 + 1e-9, z: 5 }];
    expect(persistentSketchGuides(nearly, [])).toHaveLength(1);
    // Ein sichtbarer Unterschied ist dagegen keine Ausrichtung.
    expect(persistentSketchGuides([{ id: "a", x: 1, z: 0 }, { id: "b", x: 1.2, z: 5 }], [])).toHaveLength(0);
  });
});
