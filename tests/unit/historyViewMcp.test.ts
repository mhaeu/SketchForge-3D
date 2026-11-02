import { describe, expect, it } from "vitest";
import { historyViewMcpCommand, type HistoryViewMcpContext } from "@/components/workplane/historyViewMcp";
import { editorHistoryEntry } from "@/lib/editorHistory";
import type { WorkplaneShape } from "@/types/sketchforge";

function box(overrides: Partial<WorkplaneShape> = {}): WorkplaneShape {
  return {
    id: "box-1",
    name: "Box",
    kind: "box",
    color: "#d41721",
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

function context(): HistoryViewMcpContext {
  const entries = [
    editorHistoryEntry([], [], []),
    editorHistoryEntry([box()], [], []),
    editorHistoryEntry([box({ x: 15 })], [], []),
  ];
  return {
    entries: () => entries,
    current: () => 2,
    showing: () => null,
    openView: () => {},
    closeView: () => {},
    showState: () => {},
    busy: () => false,
    clearHistory: () => 0,
    bringBack: () => [],
    summary: (shape) => shape.id,
  };
}

describe("set_history_view steps", () => {
  it("lists every state with the step that led to it when asked", () => {
    const answer = historyViewMcpCommand("set_history_view", { steps: true }, context()) as { steps: { index: number; step: string }[] };
    expect(answer.steps).toEqual([
      { index: 0, step: "Start of the history" },
      { index: 1, step: "Added Box" },
      { index: 2, step: "Moved Box (15 mm)" },
    ]);
  });

  it("leaves the list out unless asked", () => {
    const answer = historyViewMcpCommand("set_history_view", {}, context()) as Record<string, unknown>;
    expect(answer.steps).toBeUndefined();
    expect(answer.undoStep).toBe("Moved Box (15 mm)");
  });
});

describe("Verlaufsbefehle der Bruecke", () => {
  it("loescht den Verlauf nur mit confirm", () => {
    expect(() => historyViewMcpCommand("clear_history", {}, context())).toThrow(/confirm: true/);
    expect(historyViewMcpCommand("clear_history", { confirm: true }, context())).toMatchObject({ cleared: true });
  });

  it("verlangt fuer das Zurueckholen einen Stand und Kennungen", () => {
    expect(() => historyViewMcpCommand("restore_from_history", { ids: ["box-1"] }, context())).toThrow(/index/);
    expect(() => historyViewMcpCommand("restore_from_history", { index: 9, ids: ["box-1"] }, context())).toThrow(/no state 9/);
    expect(() => historyViewMcpCommand("restore_from_history", { index: 1, ids: [] }, context())).toThrow(/ids/);
    expect(() => historyViewMcpCommand("restore_from_history", { index: 1, ids: ["box-1"] }, context())).toThrow(/none of these/);
  });

  it("laesst andere Befehle durch", () => {
    expect(historyViewMcpCommand("create_shape", {}, context())).toBeUndefined();
  });
});
