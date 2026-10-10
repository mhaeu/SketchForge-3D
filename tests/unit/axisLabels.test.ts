import { describe, expect, it } from "vitest";
import { sceneAxisFromLetter, sceneAxisLetter } from "@/lib/axisLabels";
import { splitAxisFromLabel, splitAxisLabel } from "@/lib/modelSplit";

/**
 * Welcher Buchstabe ueber welcher Achse steht.
 *
 * Die Zuordnung ist eine Zusage an den Nutzer, nicht eine Rechnung: Wer
 * unsere Zahlen neben Bambu Studio oder OrcaSlicer legt, muss dieselben
 * Buchstaben sehen. Darum steht sie an einer Stelle und wird hier
 * festgenagelt.
 */
describe("Die Buchstaben der Achsen", () => {
  it("nennt die Hoehe Z und die Tiefe Y", () => {
    expect(sceneAxisLetter("x")).toBe("X");
    // y ist in der Szene die Hoehe - und heisst darum Z.
    expect(sceneAxisLetter("y")).toBe("Z");
    // z ist in der Szene die Tiefe - und heisst darum Y.
    expect(sceneAxisLetter("z")).toBe("Y");
  });

  it("und liest sie genauso zurueck", () => {
    expect(sceneAxisFromLetter("X")).toBe("x");
    expect(sceneAxisFromLetter("Y")).toBe("z");
    expect(sceneAxisFromLetter("Z")).toBe("y");
    expect(sceneAxisFromLetter(" z ")).toBe("y");
    expect(sceneAxisFromLetter("hoch")).toBeNull();
  });

  /**
   * Hin und zurueck muss dasselbe ergeben - sonst liest ein Feld etwas
   * anderes, als es schreibt.
   */
  it("ist in beide Richtungen dieselbe Zuordnung", () => {
    (["x", "y", "z"] as const).forEach((axis) => {
      expect(sceneAxisFromLetter(sceneAxisLetter(axis))).toBe(axis);
    });
  });

  /**
   * Das Teilen-Werkzeug hatte diese Zuordnung schon, als das Positionsfeld
   * noch Y fuer die Hoehe schrieb. Jetzt teilen sich beide dieselbe Stelle -
   * und diese Pruefung faellt, wenn eine wieder eine eigene bekommt.
   */
  it("gilt auch fuer das Teilen-Werkzeug", () => {
    expect(splitAxisLabel("y")).toBe("Z");
    expect(splitAxisLabel("z")).toBe("Y");
    expect(splitAxisFromLabel("Z")).toBe("y");
    expect(splitAxisFromLabel("Y")).toBe("z");
  });
});
