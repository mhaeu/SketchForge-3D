import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { groupedContentScale, scaleGroupedVertices, type GroupChildBounds } from "@/lib/groupScale";
import type { WorkplaneShape } from "@/types/sketchforge";

function shape(overrides: Partial<WorkplaneShape> = {}): WorkplaneShape {
  return {
    id: "group",
    name: "Group",
    kind: "box",
    color: "#0098c7",
    x: 0,
    z: 0,
    size: 30,
    width: 30,
    depth: 10,
    height: 8,
    rotation: 0,
    ...overrides,
  };
}

/** Die Ausdehnung zweier Kaesten nebeneinander: 30 breit, 8 hoch, 10 tief. */
const bounds: GroupChildBounds = { minX: -15, maxX: 15, minY: 0, maxY: 8, minZ: -5, maxZ: 5 };

describe("Wie weit eine Gruppe ihre Teile streckt", () => {
  it("ist eins, solange die Gruppe ihre Gruppiergroesse hat", () => {
    const group = shape({ groupedBaseWidth: 30, groupedBaseHeight: 8, groupedBaseDepth: 10 });
    expect(groupedContentScale(group, () => bounds)).toEqual([1, 1, 1]);
  });

  it("nennt den Faktor je Richtung", () => {
    const group = shape({
      width: 60, size: 60, height: 4, depth: 30,
      groupedBaseWidth: 30, groupedBaseHeight: 8, groupedBaseDepth: 10,
    });
    expect(groupedContentScale(group, () => bounds)).toEqual([2, 0.5, 3]);
  });

  /**
   * Eine Gruppe aus einer aelteren Fassung hat ihre Gruppiergroesse nicht
   * gespeichert. Dann sagt die Ausdehnung der Teile, wie gross sie war.
   */
  it("faellt ohne Gruppiergroesse auf die Ausdehnung der Teile zurueck", () => {
    expect(groupedContentScale(shape(), () => bounds)).toEqual([1, 1, 1]);
    expect(groupedContentScale(shape({ width: 15, size: 15 }), () => bounds)[0]).toBe(0.5);
  });

  it("faellt nicht auf eine Teilung durch null herein", () => {
    const flat: GroupChildBounds = { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 };
    const factors = groupedContentScale(shape(), () => flat);
    expect(factors.every((factor) => Number.isFinite(factor))).toBe(true);
    expect(groupedContentScale(shape({ groupedBaseWidth: 0 }), () => bounds)[0]).toBeGreaterThan(0);
  });

  /**
   * Die Ausdehnung der Teile zu bestimmen heisst, jedes Teilnetz zu bauen -
   * und das Netz der Gruppe baut sie gleich danach noch einmal. Bei einer
   * Gruppe mit gespeicherter Gruppiergroesse darf das darum gar nicht
   * passieren.
   */
  it("fragt die Ausdehnung der Teile nur, wenn ein Mass fehlt", () => {
    let asked = 0;
    const counting = () => {
      asked += 1;
      return bounds;
    };
    groupedContentScale(shape({ groupedBaseWidth: 30, groupedBaseHeight: 8, groupedBaseDepth: 10 }), counting);
    expect(asked).toBe(0);

    groupedContentScale(shape({ groupedBaseHeight: 8, groupedBaseDepth: 10 }), counting);
    expect(asked).toBe(1);

    // Und fehlen mehrere, wird sie trotzdem nur einmal bestimmt.
    groupedContentScale(shape(), counting);
    expect(asked).toBe(2);
  });

  it("nimmt die Breite, die die Form wirklich hergibt", () => {
    // Eine runde Gruppe traegt ihr Mass in `size`, nicht in `width`.
    const round = shape({ kind: "cylinder", width: undefined, size: 60, groupedBaseWidth: 30, groupedBaseHeight: 8, groupedBaseDepth: 10 });
    expect(groupedContentScale(round, () => bounds)[0]).toBe(2);
  });
});

describe("Das Strecken der Eckpunkte", () => {
  it("streckt jede Richtung um ihren Faktor", () => {
    expect(scaleGroupedVertices([[2, 3, 4]], [2, 0.5, 3])).toEqual([[4, 1.5, 12]]);
  });

  it("laesst die uebergebenen Punkte in Ruhe", () => {
    const vertices: [number, number, number][] = [[2, 3, 4]];
    scaleGroupedVertices(vertices, [2, 2, 2]);
    expect(vertices).toEqual([[2, 3, 4]]);
  });

  it("kommt mit nichts zurecht", () => {
    expect(scaleGroupedVertices([], [2, 2, 2])).toEqual([]);
  });
});

/**
 * Der Fehler selbst, an Netzen wie die der Ansicht: Zwei Kaesten
 * nebeneinander werden gruppiert, die Gruppe wird auf das Doppelte gezogen.
 * Ihr Netz muss danach doppelt so breit sein - vorher kam es in der Groesse
 * von vor dem Gruppieren heraus, und genau das landete in STL, OBJ und 3MF.
 */
describe("Eine gezogene Gruppe", () => {
  function boxVertices(width: number, height: number, depth: number, centreX: number) {
    const geometry = new THREE.BoxGeometry(width, height, depth).toNonIndexed();
    geometry.translate(centreX, height / 2, 0);
    const position = geometry.getAttribute("position");
    const vertices: [number, number, number][] = [];
    for (let index = 0; index < position.count; index += 1) {
      vertices.push([position.getX(index), position.getY(index), position.getZ(index)]);
    }
    return vertices;
  }

  // Zwei Kaesten von je 10 x 8 x 10, Mitten bei -10 und +10: zusammen 30 breit.
  const children = [...boxVertices(10, 8, 10, -10), ...boxVertices(10, 8, 10, 10)];
  const span = (vertices: ReadonlyArray<readonly [number, number, number]>, axis: 0 | 1 | 2) => {
    const values = vertices.map((vertex) => vertex[axis]);
    return Math.max(...values) - Math.min(...values);
  };

  it("hat ein Netz in der Groesse, die sie zeigt", () => {
    expect(span(children, 0)).toBeCloseTo(30, 6);
    const group = shape({
      width: 60, size: 60, height: 16, depth: 20,
      groupedBaseWidth: 30, groupedBaseHeight: 8, groupedBaseDepth: 10,
    });
    const stretched = scaleGroupedVertices(children, groupedContentScale(group, () => bounds));
    expect(span(stretched, 0)).toBeCloseTo(60, 6);
    expect(span(stretched, 1)).toBeCloseTo(16, 6);
    expect(span(stretched, 2)).toBeCloseTo(20, 6);
  });

  it("laesst ihre Teile in Ruhe, solange sie nicht gezogen wurde", () => {
    const group = shape({ groupedBaseWidth: 30, groupedBaseHeight: 8, groupedBaseDepth: 10 });
    expect(scaleGroupedVertices(children, groupedContentScale(group, () => bounds))).toEqual(children);
  });

  /**
   * Die Luecke zwischen den Teilen waechst mit: Gestreckt wird die Gruppe und
   * nicht jedes Teil fuer sich.
   */
  it("zieht die Luecke zwischen den Teilen mit", () => {
    const group = shape({ width: 60, size: 60, groupedBaseWidth: 30, groupedBaseHeight: 8, groupedBaseDepth: 10 });
    const stretched = scaleGroupedVertices(children, groupedContentScale(group, () => bounds));
    const left = stretched.slice(0, children.length / 2);
    const right = stretched.slice(children.length / 2);
    // Jedes Teil ist doppelt so breit, und seine Mitte liegt doppelt so weit aussen.
    expect(span(left, 0)).toBeCloseTo(20, 6);
    expect(Math.max(...left.map((vertex) => vertex[0]))).toBeCloseTo(-10, 6);
    expect(Math.min(...right.map((vertex) => vertex[0]))).toBeCloseTo(10, 6);
  });
});
