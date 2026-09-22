import { describe, expect, it } from "vitest";
import { selectWholeValue } from "@/lib/numberField";

/**
 * Auf einem Tablet hat die Dezimaltastatur keine Pfeiltasten, und ein Feld
 * von fuenf Zeichen trifft man mit dem Finger nicht stellengenau. Wer in ein
 * Zahlenfeld springt, bekommt deshalb den ganzen Wert markiert - sonst muss
 * er aus "20.00" Zeichen fuer Zeichen eine "35" loeschen.
 */
describe("das Zahlenfeld beim Hineinspringen", () => {
  const field = (value: string) => {
    let selected = false;
    return { value, select: () => { selected = true; }, wasSelected: () => selected };
  };

  it("markiert den ganzen Wert", () => {
    const input = field("20.00");
    expect(selectWholeValue(input)).toBe(true);
    expect(input.wasSelected()).toBe(true);
  });

  it("laesst ein leeres Feld in Ruhe", () => {
    const input = field("");
    expect(selectWholeValue(input)).toBe(false);
    expect(input.wasSelected()).toBe(false);
  });

  it("kommt auch ohne Feld zurecht", () => {
    expect(selectWholeValue(null)).toBe(false);
    expect(selectWholeValue(undefined)).toBe(false);
  });
});
