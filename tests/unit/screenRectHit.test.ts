import { describe, expect, it } from "vitest";
import { triangleTouchesRect, type ScreenRect } from "@/lib/screenRectHit";

const rect: ScreenRect = { left: 10, top: 10, right: 20, bottom: 20 };

describe("Ein Dreieck auf dem Schirm gegen einen Auswahlrahmen", () => {
  it("ist getroffen, wenn eine seiner Ecken im Rahmen liegt", () => {
    expect(triangleTouchesRect(15, 15, 40, 40, 40, 0, rect)).toBe(true);
  });

  it("ist getroffen, wenn nur eine Kante durch den Rahmen laeuft", () => {
    expect(triangleTouchesRect(0, 15, 30, 15, 15, 60, rect)).toBe(true);
  });

  /**
   * Der Fall, den die beiden anderen Fragen nicht finden: Das Dreieck ist so
   * gross, dass der ganze Rahmen darin liegt - keine Ecke und keine Kante ist
   * in der Naehe.
   */
  it("ist getroffen, wenn der Rahmen ganz darin liegt", () => {
    expect(triangleTouchesRect(-100, -100, 200, -100, 15, 300, rect)).toBe(true);
  });

  /**
   * Und der Fall, um den es ueberhaupt geht: Der *Rahmen* des Dreiecks deckt
   * den Auswahlrahmen, das Dreieck selbst nicht. Genau so liegt der
   * Zwischenraum zwischen zwei Teilen einer Gruppe.
   */
  it("ist verfehlt, wenn der Rahmen daneben liegt - auch innerhalb seines Rahmens", () => {
    expect(triangleTouchesRect(0, 0, 100, 0, 100, 100, { left: 5, top: 40, right: 20, bottom: 60 })).toBe(false);
  });

  it("ist verfehlt, wenn es weit weg liegt", () => {
    expect(triangleTouchesRect(30, 30, 40, 30, 35, 40, rect)).toBe(false);
  });

  /** Beruehrung zaehlt: Eine Ecke genau auf dem Rand ist drin. */
  it("zaehlt eine Ecke genau auf dem Rand", () => {
    expect(triangleTouchesRect(10, 10, 40, 40, 40, 0, rect)).toBe(true);
    expect(triangleTouchesRect(20, 20, 60, 60, 60, 40, rect)).toBe(true);
  });

  /**
   * Ein entartetes Dreieck - alle drei Ecken auf einem Punkt - darf nicht
   * aus Versehen alles treffen. Im Netz einer Kugel stehen solche an den
   * Polen.
   */
  it("behandelt ein entartetes Dreieck wie seinen Punkt", () => {
    expect(triangleTouchesRect(15, 15, 15, 15, 15, 15, rect)).toBe(true);
    expect(triangleTouchesRect(50, 50, 50, 50, 50, 50, rect)).toBe(false);
  });

  /** Die Reihenfolge der Ecken sagt nichts ueber das Treffen. */
  it("faellt bei gedrehter Wicklung gleich aus", () => {
    expect(triangleTouchesRect(0, 15, 30, 15, 15, 60, rect)).toBe(true);
    expect(triangleTouchesRect(15, 60, 30, 15, 0, 15, rect)).toBe(true);
  });
});
