import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeSavedViews, normalizeStartView, perspectiveDistanceForFlatView, readSavedViews, readStartView, savedViewSlotForEvent, writeSavedView, writeStartView } from "@/lib/savedViews";

const view = { position: [1, 2, 3] as [number, number, number], target: [0, 0, 0] as [number, number, number], up: [0, 1, 0] as [number, number, number], orthographic: true, zoom: 2, halfHeight: 40 };

function key(code: string, extra: Partial<KeyboardEvent> = {}) {
  return { code, ctrlKey: false, metaKey: false, altKey: false, ...extra };
}

describe("saved views", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reads the slot from the key's position, digits and number pad alike", () => {
    expect(savedViewSlotForEvent(key("Digit7"))).toBe("7");
    expect(savedViewSlotForEvent(key("Numpad0"))).toBe("0");
    expect(savedViewSlotForEvent(key("Digit1"))).toBeNull();
    expect(savedViewSlotForEvent(key("Digit8", { ctrlKey: true }))).toBeNull();
    expect(savedViewSlotForEvent(key("KeyA"))).toBeNull();
  });

  it("drops broken entries", () => {
    expect(normalizeSavedViews({ "7": view, "8": { position: [1, 2] }, "5": view })).toEqual({ "7": view });
  });

  it("keeps the four views per design in the browser", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) } });
    expect(writeSavedView("design-a", "9", view)).toBe(true);
    expect(readSavedViews("design-a")).toEqual({ "9": view });
    expect(readSavedViews("design-b")).toEqual({});
  });

  it("keeps one start view for the whole browser and forgets it on Standard", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) } });
    expect(readStartView()).toBeNull();
    expect(writeStartView(view)).toBe(true);
    // Projektion und Zoom gehoeren nicht dazu, nur wohin die Kamera schaut.
    expect(readStartView()).toEqual({ position: [1, 2, 3], target: [0, 0, 0], up: [0, 1, 0] });
    expect(writeStartView(null)).toBe(true);
    expect(readStartView()).toBeNull();
    expect(store.size).toBe(0);
  });

  it("refuses a start view that cannot look anywhere", () => {
    expect(normalizeStartView({ ...view, target: [1, 2, 3] })).toBeNull();
    expect(normalizeStartView({ ...view, up: [0, 0, 0] })).toBeNull();
    expect(normalizeStartView({ position: [1, 2], target: [0, 0, 0], up: [0, 1, 0] })).toBeNull();
  });

  it("turns a flat view's zoom into the distance that shows as much", () => {
    // Standardansicht: Abstand 194.5 mm, Oeffnungswinkel 38 Grad.
    const distance = Math.hypot(118, 96, 118);
    const halfHeight = distance * Math.tan((38 * Math.PI) / 360);
    expect(perspectiveDistanceForFlatView(halfHeight, 1, 38)).toBeCloseTo(distance, 9);
    expect(perspectiveDistanceForFlatView(halfHeight, 2, 38)).toBeCloseTo(distance / 2, 9);
  });
});
