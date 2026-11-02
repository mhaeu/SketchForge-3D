import { describe, expect, it } from "vitest";
import { broughtBackShapes, findShapeInHistoryState, historyStateClockLabel, historyStatePartsTree, historyViewLevels } from "@/lib/historyRestore";
import type { WorkplaneShape } from "@/types/sketchforge";

function shape(overrides: Partial<WorkplaneShape> = {}): WorkplaneShape {
  return {
    id: "shape",
    name: "Shape",
    kind: "box",
    color: "#ff5a47",
    x: 0,
    z: 0,
    elevation: 0,
    size: 20,
    width: 20,
    depth: 20,
    height: 20,
    rotation: 0,
    locked: false,
    hidden: false,
    ...overrides,
  };
}

/*
 * Gruppieren und Oeffnen leben in SketchForge im Editor. Hier stehen sie
 * vereinfacht: Teile liegen relativ zur Mitte der Gruppe, und Oeffnen dreht
 * sie um die Hochachse und schiebt sie an die Stelle der Gruppe.
 */
let groupCount = 0;
function group(parts: WorkplaneShape[], overrides: Partial<WorkplaneShape> = {}): WorkplaneShape {
  groupCount += 1;
  const x = parts.reduce((sum, part) => sum + part.x, 0) / parts.length;
  return shape({
    kind: "group" as WorkplaneShape["kind"],
    x,
    groupedShapes: parts.map((part) => ({ ...part, id: `${part.id}-group-child-${groupCount}`, x: part.x - x })),
    ...overrides,
  });
}

const openGroup = (g: WorkplaneShape): WorkplaneShape[] => {
  const angle = (g.rotation * Math.PI) / 180;
  return (g.groupedShapes ?? []).map((part) => ({
    ...part,
    id: `${part.id}-ungroup-x`,
    x: g.x + part.x * Math.cos(angle) + part.z * Math.sin(angle),
    z: g.z - part.x * Math.sin(angle) + part.z * Math.cos(angle),
    rotation: part.rotation + g.rotation,
  }));
};

/** The id a part got inside the groups around it: grouping gives every part an id of its own. */
function idOf(shapes: WorkplaneShape[], name: string): string {
  for (const candidate of shapes) {
    if (candidate.name === name) return candidate.id;
    const inside = candidate.groupedShapes ? idOrNull(candidate.groupedShapes, name) : null;
    if (inside) return inside;
  }
  throw new Error(`no ${name} in the scene`);
}

function idOrNull(shapes: WorkplaneShape[], name: string) {
  try {
    return idOf(shapes, name);
  } catch {
    return null;
  }
}

// The story from the design: B grouped with C into G1, G1 grouped with G2 into G3.
function nestedScene() {
  const b = shape({ id: "b", name: "B", x: -30, width: 30, size: 30, color: "#d41721" });
  const c = shape({ id: "c", name: "C", x: 0 });
  const g1 = group([b, c], { id: "g1", name: "G1" });
  const g2 = shape({ id: "g2", name: "G2", x: 40 });
  const g3 = group([g1, g2], { id: "g3", name: "G3" });
  return { b, c, g1, g2, g3 };
}

describe("bringing objects back from the history", () => {
  it("finds an object on the plate as it is", () => {
    const box = shape({ id: "box", x: 12 });
    expect(findShapeInHistoryState([box], "box", openGroup)).toBe(box);
    expect(findShapeInHistoryState([box], "missing", openGroup)).toBeNull();
  });

  it("finds a part two groups deep at the spot it shows", () => {
    const { b, g3 } = nestedScene();
    const found = findShapeInHistoryState([g3], idOf([g3], "B"), openGroup);
    expect(found?.id).toBe(idOf([g3], "B"));
    expect(found?.x).toBeCloseTo(b.x, 4);
    expect(found?.z).toBeCloseTo(b.z, 4);
    expect(found?.width).toBeCloseTo(30, 4);
    expect(found?.color).toBe("#d41721");
  });

  it("follows the outer group when it was moved and turned", () => {
    const { g3 } = nestedScene();
    const placed = findShapeInHistoryState([g3], idOf([g3], "B"), openGroup);
    const turned = { ...g3, x: g3.x + 50, rotation: 90 };
    const found = findShapeInHistoryState([turned], idOf([g3], "B"), openGroup);
    if (!placed || !found) throw new Error("B was not found");
    // A quarter turn about the group's centre: B's offset swings from x onto z.
    const offsetX = placed.x - g3.x;
    const offsetZ = placed.z - g3.z;
    expect(Math.hypot(found.x - turned.x, found.z - turned.z)).toBeCloseTo(Math.hypot(offsetX, offsetZ), 4);
    expect(Math.abs(found.x - turned.x)).toBeCloseTo(Math.abs(offsetZ), 4);
  });

  it("brings copies with new ids, at every depth", () => {
    const { g3 } = nestedScene();
    const [copy] = broughtBackShapes([g3], [idOf([g3], "G1")], openGroup);
    expect(copy.id).not.toBe(idOf([g3], "G1"));
    expect(copy.name).toBe("G1");
    const partIds = (copy.groupedShapes ?? []).map((part) => part.id);
    expect(partIds).toHaveLength(2);
    expect(partIds).not.toContain(idOf([g3], "B"));
    expect(partIds).not.toContain(idOf([g3], "C"));
  });

  it("brings several objects in the order picked and skips a part of another picked one", () => {
    const { g3 } = nestedScene();
    const box = shape({ id: "box", name: "Box", x: 80 });
    const copies = broughtBackShapes([g3, box], ["box", idOf([g3], "G1"), idOf([g3], "B"), "missing"], openGroup);
    expect(copies.map((copy) => copy.name)).toEqual(["Box", "G1"]);
  });

  it("lists the parts of groups for AI tools", () => {
    const { g3 } = nestedScene();
    expect(historyStatePartsTree(shape())).toEqual({});
    const tree = historyStatePartsTree(g3);
    expect(tree.parts?.map((part) => part.name)).toEqual(["G1", "G2"]);
    expect(tree.parts?.[0].parts?.map((part) => part.id)).toEqual([idOf([g3], "B"), idOf([g3], "C")]);
  });
});

describe("the time a brought-back object is named after", () => {
  const now = new Date(2026, 9, 16, 15, 0).getTime();

  it("is the time alone for a state of today", () => {
    expect(historyStateClockLabel(new Date(2026, 9, 16, 12, 32).getTime(), "en-GB", now)).toBe("12:32");
  });

  it("carries the date for an older state", () => {
    const label = historyStateClockLabel(new Date(2026, 9, 14, 12, 32).getTime(), "en-GB", now);
    expect(label).toContain("12:32");
    expect(label).toContain("14");
  });

  it("is missing for a state from before times were recorded", () => {
    expect(historyStateClockLabel(undefined, "en", now)).toBeNull();
  });
});

describe("looking inside groups in the History view", () => {
  it("lays out the parts of an opened group where Edit group puts them, under their own ids", () => {
    const { g3 } = nestedScene();
    const box = shape({ id: "box", name: "Box", x: 80 });
    const turned = { ...g3, x: g3.x + 50, rotation: 90 };
    const view = historyViewLevels([turned, box], ["g3", idOf([g3], "G1")], openGroup);
    expect(view.open.map((group) => group.name)).toEqual(["G3", "G1"]);
    expect(view.shapes.map((part) => part.name)).toEqual(["B", "C", "G2", "Box"]);
    const b = view.shapes[0];
    expect(b.id).toBe(idOf([g3], "B"));
    const expected = findShapeInHistoryState([turned], b.id, openGroup);
    expect(b.x).toBeCloseTo(expected?.x ?? Number.NaN, 6);
    expect(b.z).toBeCloseTo(expected?.z ?? Number.NaN, 6);
  });

  it("brings back a part picked inside the opened groups", () => {
    const { g3 } = nestedScene();
    const view = historyViewLevels([g3], ["g3", idOf([g3], "G1")], openGroup);
    const [copy] = broughtBackShapes([g3], [view.shapes[0].id], openGroup);
    expect(copy.name).toBe("B");
    expect(copy.x).toBeCloseTo(view.shapes[0].x, 6);
  });

  it("stops opening at the first group the state does not have", () => {
    const { g3 } = nestedScene();
    const view = historyViewLevels([g3], ["g3", "gone", idOf([g3], "G1")], openGroup);
    expect(view.open.map((group) => group.name)).toEqual(["G3"]);
    expect(view.shapes.map((part) => part.name)).toEqual(["G1", "G2"]);
    expect(historyViewLevels([g3], ["box"], openGroup).shapes).toEqual([g3]);
  });
});
