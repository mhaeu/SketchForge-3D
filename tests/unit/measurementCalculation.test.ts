import { describe, expect, it } from "vitest";
import { parseMeasurementInput } from "@/lib/measurementUnits";

/**
 * Rechnen im Massfeld.
 *
 * Das ist keine Bequemlichkeit, sondern wie man an einem Teil rechnet: die
 * halbe Breite, drei Loecher auf eine Strecke, zwei Wandstaerken abgezogen.
 * Vorher nahm das Feld nur eine fertige Zahl - wer "40/2" eintippte, verlor
 * seine Eingabe.
 */
describe("Eine Zahl bleibt eine Zahl", () => {
  it("liest Punkt und Komma wie bisher", () => {
    expect(parseMeasurementInput("12.5")).toBe(12.5);
    expect(parseMeasurementInput("12,5")).toBe(12.5);
    expect(parseMeasurementInput("1.234,5")).toBe(1234.5);
    expect(parseMeasurementInput("1,234.5")).toBe(1234.5);
    expect(parseMeasurementInput(" 7 ")).toBe(7);
    expect(parseMeasurementInput(42)).toBe(42);
    /*
     * Leerzeichen fallen weg, auch die geschuetzten: So schreibt man im
     * Deutschen die Tausender ("1 234,5"), und daran aendert das Rechnen
     * nichts - "12 34" bleibt darum 1234 und nicht zwei Zahlen.
     */
    expect(parseMeasurementInput("1\u00a0234,5")).toBe(1234.5);
    expect(parseMeasurementInput("12 34")).toBe(1234);
  });

  it("gibt NaN, wo keine Zahl steht", () => {
    expect(parseMeasurementInput("")).toBeNaN();
    expect(parseMeasurementInput("breit")).toBeNaN();
    expect(parseMeasurementInput(Number.NaN)).toBeNaN();
    expect(parseMeasurementInput(Number.POSITIVE_INFINITY)).toBeNaN();
  });
});

describe("Und eine Rechnung wird gerechnet", () => {
  it("nimmt die vier Rechenarten", () => {
    expect(parseMeasurementInput("40/2")).toBe(20);
    expect(parseMeasurementInput("15*3")).toBe(45);
    expect(parseMeasurementInput("15x3")).toBe(45);
    expect(parseMeasurementInput("12+8")).toBe(20);
    expect(parseMeasurementInput("30-8")).toBe(22);
  });

  /** Punkt vor Strich, sonst waeren "120-2*4" nicht 112, sondern 472. */
  it("rechnet Punkt vor Strich", () => {
    expect(parseMeasurementInput("120-2*4")).toBe(112);
    expect(parseMeasurementInput("2+3*4")).toBe(14);
    expect(parseMeasurementInput("100/4/5")).toBe(5);
    expect(parseMeasurementInput("20-5-3")).toBe(12);
  });

  it("und Klammern vor allem", () => {
    expect(parseMeasurementInput("(40+2)/2")).toBe(21);
    expect(parseMeasurementInput("2*(3+4)")).toBe(14);
    expect(parseMeasurementInput("((10))")).toBe(10);
  });

  it("nimmt ein Vorzeichen, auch mitten in der Rechnung", () => {
    expect(parseMeasurementInput("-5")).toBe(-5);
    expect(parseMeasurementInput("10*-2")).toBe(-20);
    expect(parseMeasurementInput("-(3+4)")).toBe(-7);
  });

  /** Das Dezimalkomma gilt auch innerhalb einer Rechnung. */
  it("laesst das Komma in der Rechnung gelten", () => {
    expect(parseMeasurementInput("1,5*2")).toBe(3);
    expect(parseMeasurementInput("2,54*3")).toBeCloseTo(7.62, 9);
    expect(parseMeasurementInput("10-0,4")).toBeCloseTo(9.6, 9);
  });

  /**
   * Was keine Rechnung ist, bleibt NaN - das Feld behaelt dann seinen Wert,
   * statt eine geratene Zahl zu uebernehmen.
   */
  it("lehnt ab, was keine Rechnung ist", () => {
    expect(parseMeasurementInput("5)")).toBeNaN();
    expect(parseMeasurementInput("(5")).toBeNaN();
    expect(parseMeasurementInput("3+")).toBeNaN();
    expect(parseMeasurementInput("*3")).toBeNaN();
    expect(parseMeasurementInput("3mm")).toBeNaN();
    // Teilen durch null gibt keine Zahl, also auch keinen Wert.
    expect(parseMeasurementInput("5/0")).toBeNaN();
  });

  /**
   * Gerechnet wird von Hand, nicht mit `eval`: Eine Eingabe aus einem
   * Textfeld ist kein Programm. Diese Pruefung haelt das fest - mit `eval`
   * kaeme hier eine Zahl heraus.
   */
  it("fuehrt keinen Code aus", () => {
    expect(parseMeasurementInput("2**3")).toBeNaN();
    expect(parseMeasurementInput("Math.PI")).toBeNaN();
    expect(parseMeasurementInput("[1,2]")).toBeNaN();
  });
});
