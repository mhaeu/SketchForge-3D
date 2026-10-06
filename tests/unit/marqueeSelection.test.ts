import { describe, expect, it } from "vitest";
import { toggledMarqueeSelection } from "@/lib/marqueeSelection";

describe("Ein Rahmen mit Umschalt", () => {
  it("nimmt dazu, was noch nicht ausgewaehlt war", () => {
    expect(toggledMarqueeSelection(["a"], ["b", "c"])).toEqual(["a", "b", "c"]);
  });

  /**
   * Der Punkt der Sache: Mit Umschalt angeklickt faellt ein ausgewaehlter
   * Koerper heraus. Beim Rahmen tat er das nicht - dieselbe Taste am selben
   * Werkzeug war zweierlei.
   */
  it("nimmt heraus, was schon ausgewaehlt war", () => {
    expect(toggledMarqueeSelection(["a", "b"], ["b"])).toEqual(["a"]);
    expect(toggledMarqueeSelection(["a", "b", "c"], ["a", "c"])).toEqual(["b"]);
  });

  it("dreht gemischt beides um", () => {
    expect(toggledMarqueeSelection(["a", "b"], ["b", "c"])).toEqual(["a", "c"]);
  });

  it("leert die Auswahl, wenn der Rahmen genau sie trifft", () => {
    expect(toggledMarqueeSelection(["a", "b"], ["a", "b"])).toEqual([]);
  });

  it("laesst die Auswahl stehen, wenn der Rahmen leer bleibt", () => {
    expect(toggledMarqueeSelection(["a", "b"], [])).toEqual(["a", "b"]);
  });

  it("macht aus nichts die Koerper im Rahmen", () => {
    expect(toggledMarqueeSelection([], ["b", "a"])).toEqual(["b", "a"]);
  });

  /**
   * Die Reihenfolge haengt an etwas: Der erste Eintrag ist der Anker der
   * Auswahl (das Ausrichten richtet sich nach ihm). Also bleibt die bisherige
   * Reihenfolge vorn, und das Neue kommt in der Reihenfolge des Rahmens
   * hinterher.
   */
  it("behaelt die Reihenfolge, soweit es geht", () => {
    expect(toggledMarqueeSelection(["c", "a"], ["b", "d"])).toEqual(["c", "a", "b", "d"]);
  });

  it("nennt keinen Koerper doppelt", () => {
    const result = toggledMarqueeSelection(["a"], ["b", "b", "c"]);
    expect(result).toEqual(["a", "b", "c"]);
    expect(new Set(result).size).toBe(result.length);
  });

  it("ruehrt die uebergebenen Listen nicht an", () => {
    const current = ["a", "b"];
    const boxed = ["b", "c"];
    toggledMarqueeSelection(current, boxed);
    expect(current).toEqual(["a", "b"]);
    expect(boxed).toEqual(["b", "c"]);
  });
});
