import { beforeAll, describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { JoinType, OcctKernel, type ShapeHandle } from "occt-wasm";
import {
  HOLLOW_SIDES,
  describeHollowFaces,
  hollowSidesWithoutFace,
  openingFaceIndexes,
  sideFaceIndexes,
  type CadHollowOpening,
} from "@/lib/cadHollow";

/**
 * Stimmt die Seitenauswahl auch auf echten Kernflaechen?
 *
 * Die Pruefungen daneben (tests/unit/cadHollow.test.ts) arbeiten mit
 * handgebauten Flaechen - die sagen nichts darueber, ob Mitte, Normale und
 * Umlaufrichtung aus OpenCascade zusammenpassen. Eine umgekehrt orientierte
 * Flaeche traegt ihre Normale nach innen; ohne das Vorzeichen waere der
 * Deckel eines Koerpers manchmal sein Boden, und das faellt nur hier auf.
 */

let cad: OcctKernel;

beforeAll(async () => {
  const wasm = join(dirname(fileURLToPath(import.meta.resolve("occt-wasm"))), "occt-wasm.wasm");
  cad = await OcctKernel.init({ wasm });
}, 180000);

/** Ein Kasten in unserem Rahmen: mittig auf x und z, Unterseite auf y = 0. */
function box(width: number, height: number, depth: number) {
  const solid = cad.makeBox(width, height, depth);
  return cad.transform(solid, [1, 0, 0, -width / 2, 0, 1, 0, 0, 0, 0, 1, -depth / 2]);
}

/** Dieselben Schritte, die der Arbeiter geht (hollowSolid in cadModifier.worker.ts). */
function hollow(solid: ShapeHandle, opening: CadHollowOpening, wall: number) {
  const faces = cad.getSubShapes(solid, "face");
  const described = describeHollowFaces(cad, faces);
  expect(hollowSidesWithoutFace(described, opening)).toEqual([]);
  const open = openingFaceIndexes(described, opening).map((index) => faces[index]);
  if (open.length === 0) return cad.cut(solid, cad.shell(solid, [], wall, 1e-6, JoinType.Arc));
  return cad.shell(solid, open, wall, 1e-6, JoinType.Arc);
}

describe("Die Seitenauswahl auf echten Kernflaechen", () => {
  /**
   * Zuerst die Zuordnung selbst: Ein Kasten hat sechs Flaechen, und jede Seite
   * muss genau ihre finden. Faellt das hier, zeigt eine Normale in die falsche
   * Richtung - und das Aushoehlen oeffnet die Gegenseite.
   */
  it("findet zu jeder der sechs Seiten genau eine Flaeche", () => {
    const solid = box(20, 30, 20);
    const described = describeHollowFaces(cad, cad.getSubShapes(solid, "face"));
    expect(described).toHaveLength(6);
    HOLLOW_SIDES.forEach((side) => {
      expect(sideFaceIndexes(described, side), side).toHaveLength(1);
    });
    // Und sechs verschiedene: keine Flaeche gilt fuer zwei Seiten.
    expect(openingFaceIndexes(described, [...HOLLOW_SIDES])).toHaveLength(6);
  });

  /**
   * Die Richtungen sind die des Ansichtswuerfels: vorn ist +z. Hier steht die
   * Zusage als Zahl - die Mitte der vorderen Flaeche liegt bei +z.
   */
  it("legt vorn nach +z und hinten nach -z, wie der Ansichtswuerfel", () => {
    const solid = box(20, 30, 10);
    const faces = cad.getSubShapes(solid, "face");
    const described = describeHollowFaces(cad, faces);
    const centreOf = (side: (typeof HOLLOW_SIDES)[number]) => described[sideFaceIndexes(described, side)[0]].centre;
    expect(centreOf("front").z).toBeCloseTo(5, 6);
    expect(centreOf("back").z).toBeCloseTo(-5, 6);
    expect(centreOf("right").x).toBeCloseTo(10, 6);
    expect(centreOf("left").x).toBeCloseTo(-10, 6);
    expect(centreOf("top").y).toBeCloseTo(30, 6);
    expect(centreOf("bottom").y).toBeCloseTo(0, 6);
  });

  /**
   * Und das Aushoehlen selbst, am Rauminhalt nachgerechnet: Ein Kasten von
   * 20 x 30 x 20 mit 2 mm Wand und offener Vorderseite ist ein Schubfach. Die
   * fuenf stehenden Waende und der Boden ergeben
   * 20*30*20 - 16*28*18 = 4.
   */
  it("macht aus einem Kasten mit offener Vorderseite ein Schubfach", () => {
    const solid = box(20, 30, 20);
    const shell = hollow(solid, ["front"], 2);
    expect(cad.isValid(shell)).toBe(true);
    /*
     * Der Hohlraum ist nach vorn offen, also fehlt nur dort die Wand: Er
     * reicht 16 breit (20 minus die linke und rechte Wand), 26 hoch (30 minus
     * Boden und Deckel) und 18 tief (20 minus nur die hintere Wand, denn vorn
     * steht keine). 12.000 minus 7.488 sind 4.512.
     */
    expect(cad.getVolume(shell)).toBeCloseTo(20 * 30 * 20 - 16 * 26 * 18, 4);
  });

  /** Links und rechts offen ist ein Tunnel: dort fehlen zwei Waende. */
  it("macht aus links und rechts offen einen Tunnel", () => {
    const solid = box(20, 30, 20);
    const shell = hollow(solid, ["left", "right"], 2);
    expect(cad.isValid(shell)).toBe(true);
    expect(cad.getVolume(shell)).toBeCloseTo(20 * 30 * 20 - 20 * 26 * 16, 4);
  });

  /** Und ohne offene Seite bleibt der Koerper ringsherum zu. */
  /**
   * Und ringsherum zu ist ein Koerper mit Hohlraum, kein geschrumpfter Klotz.
   * `shell` allein kann das nicht: Ohne eine Flaeche zum Wegnehmen gibt es den
   * Innenkasten zurueck (6.656 mm^3). Erst aussen minus innen ergibt die
   * Schale - zwoelf Flaechen, sechs aussen und sechs innen.
   */
  it("laesst ohne offene Seite einen Hohlraum, keinen geschrumpften Klotz", () => {
    const solid = box(20, 30, 20);
    const shrunk = cad.shell(box(20, 30, 20), [], 2, 1e-6, JoinType.Arc);
    expect(cad.getVolume(shrunk)).toBeCloseTo(16 * 26 * 16, 4);
    const shell = hollow(solid, [], 2);
    expect(cad.isValid(shell)).toBe(true);
    expect(cad.getVolume(shell)).toBeCloseTo(20 * 30 * 20 - 16 * 26 * 16, 4);
    expect(cad.getSubShapes(shell, "face")).toHaveLength(12);
  });

  /**
   * Eine Kugel hat keine flache Flaeche, die einer Seite gehoert - das muss
   * gesagt werden, statt eine Oeffnung weniger zu liefern als bestellt.
   */
  it("meldet eine Seite, auf der keine Flaeche liegt", () => {
    const sphere = cad.makeSphere(10);
    const described = describeHollowFaces(cad, cad.getSubShapes(sphere, "face"));
    // Die eine Kugelflaeche schaut im Mittel nirgendwohin bestimmt.
    expect(hollowSidesWithoutFace(described, ["top"]).length).toBeGreaterThan(0);
  });
});
