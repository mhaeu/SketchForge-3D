import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeSavedViews, readSavedViews, savedViewSlotForEvent, writeSavedView } from "@/lib/savedViews";

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
});
