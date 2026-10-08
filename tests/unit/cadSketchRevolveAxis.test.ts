import { describe, expect, it } from "vitest";
import { revolveProfileFitsAxis } from "@/lib/cadSketchRevolve";
import type { SketchProfile } from "@/types/sketchforge";

/**
 * Die Weiche zwischen genauem Koerper und Netz.
 *
 * Wer hier falsch antwortet, bekommt keinen Fehler, sondern das schlechtere
 * Ergebnis: ein Umriss, der die Achse ueberquert, wuerde dem Kern gegeben,
 * der ihn durch sich selbst dreht - oder ein Umriss, der ganz links liegt,
 * bekaeme ein Netz, obwohl er genau gehen wuerde.
 */
function profile(points: SketchProfile["points"]): SketchProfile {
  return { points, segments: [] };
}

describe("revolveProfileFitsAxis", () => {
  it("nimmt einen Umriss links der Achse", () => {
    expect(revolveProfileFitsAxis(profile([{ id: "a", x: -10, z: 0 }, { id: "b", x: -2, z: 5 }]))).toBe(true);
  });

  it("nimmt einen, der die Achse beruehrt", () => {
    expect(revolveProfileFitsAxis(profile([{ id: "a", x: 0, z: 0 }, { id: "b", x: -5, z: 5 }]))).toBe(true);
  });

  it("lehnt einen ab, der sie ueberquert", () => {
    expect(revolveProfileFitsAxis(profile([{ id: "a", x: -5, z: 0 }, { id: "b", x: 3, z: 5 }]))).toBe(false);
  });

  /**
   * Ein leerer Umriss ist nicht "passt schon": Es gibt nichts zu drehen, und
   * `every` auf einer leeren Liste waere wahr.
   */
  it("lehnt einen leeren Umriss ab", () => {
    expect(revolveProfileFitsAxis(profile([]))).toBe(false);
  });

  /**
   * Die Griffe zaehlen mit. Eine Kurve verlaeuft dort, wo ihre Griffe
   * hinzeigen - ein Punkt links der Achse mit einem Griff rechts davon zieht
   * die Kurve ueber die Achse, auch wenn kein Punkt dort steht.
   */
  it("zaehlt einen Griff rechts der Achse mit", () => {
    expect(revolveProfileFitsAxis(profile([
      { id: "a", x: -10, z: 0, handleOut: { x: 4, z: 1 } },
      { id: "b", x: -10, z: 10 },
    ]))).toBe(false);
    expect(revolveProfileFitsAxis(profile([
      { id: "a", x: -10, z: 0 },
      { id: "b", x: -10, z: 10, handleIn: { x: 2, z: 9 } },
    ]))).toBe(false);
  });

  it("und laesst Griffe links der Achse durch", () => {
    expect(revolveProfileFitsAxis(profile([
      { id: "a", x: -10, z: 0, handleOut: { x: -4, z: 1 } },
      { id: "b", x: -10, z: 10, handleIn: { x: -8, z: 9 } },
    ]))).toBe(true);
  });

  /**
   * Eine Spur rechts der Achse ist Rundungsrest, nicht Absicht: Ein Punkt,
   * der aus einer Drehung oder einer Massumrechnung mit x = 1e-9 herauskommt,
   * steht gemeint auf der Achse.
   */
  it("nimmt eine Spur rechts der Achse als Rundungsrest", () => {
    expect(revolveProfileFitsAxis(profile([{ id: "a", x: 1e-9, z: 0 }, { id: "b", x: -5, z: 5 }]))).toBe(true);
    expect(revolveProfileFitsAxis(profile([{ id: "a", x: 1e-4, z: 0 }, { id: "b", x: -5, z: 5 }]))).toBe(false);
  });
});
