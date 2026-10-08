import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { MAX_MATE_GAP, mateMotion, mateTurnDegrees, shortestTurn } from "@/lib/mateFaces";
import type { PlacementPoint } from "@/lib/placementWorkplane";

const point = (x: number, y: number, z: number): PlacementPoint => ({ x, y, z });

/** Wohin eine Richtung nach der Drehung zeigt. */
function turned(direction: PlacementPoint, rotation: THREE.Quaternion) {
  const vector = new THREE.Vector3(direction.x, direction.y, direction.z).applyQuaternion(rotation);
  return [vector.x, vector.y, vector.z].map((value) => Number(value.toFixed(9)));
}

describe("Die kuerzeste Drehung", () => {
  it("richtet eine Richtung auf die andere", () => {
    const rotation = shortestTurn(point(1, 0, 0), point(0, 1, 0));
    expect(rotation).not.toBeNull();
    expect(turned(point(1, 0, 0), rotation!)).toEqual([0, 1, 0]);
    expect(mateTurnDegrees(rotation!)).toBeCloseTo(90, 9);
  });

  it("dreht nicht, wenn beide schon gleich zeigen", () => {
    const rotation = shortestTurn(point(0, 0, 1), point(0, 0, 2));
    expect(mateTurnDegrees(rotation!)).toBeCloseTo(0, 9);
  });

  /**
   * Zeigen sie genau gegeneinander, gibt es unendlich viele Achsen, um die man
   * umschlagen kann. Welche gewaehlt wird, ist nicht bestimmt - dass die
   * Richtung danach stimmt, schon.
   */
  it("schlaegt eine entgegengesetzte Richtung um, ueber irgendeine Achse", () => {
    const rotation = shortestTurn(point(0, 1, 0), point(0, -1, 0));
    expect(rotation).not.toBeNull();
    expect(turned(point(0, 1, 0), rotation!)).toEqual([0, -1, 0]);
    expect(mateTurnDegrees(rotation!)).toBeCloseTo(180, 6);
  });

  it("gibt null, wenn eine der Richtungen keine ist", () => {
    expect(shortestTurn(point(0, 0, 0), point(0, 1, 0))).toBeNull();
    expect(shortestTurn(point(0, 1, 0), point(0, 0, 0))).toBeNull();
  });
});

describe("Ruecken an Ruecken", () => {
  /**
   * Der Grundfall: Die bewegte Flaeche schaut nach rechts (+x), die Zielflaeche
   * nach links (-x). Sie liegen schon parallel und gegeneinander - es bleibt
   * eine Verschiebung, und zwar nur laengs x.
   */
  it("verschiebt nur laengs der Normale, wenn die Flaechen schon passen", () => {
    const motion = mateMotion(
      { point: point(5, 10, 3), normal: point(1, 0, 0) },
      { point: point(20, 40, -7), normal: point(-1, 0, 0) },
      "against",
    );
    expect(motion).not.toBeNull();
    expect(motion!.rotation).toBeNull();
    // Nur x bewegt sich: Hoehe und Tiefe des Koerpers bleiben, wo sie waren.
    expect(motion!.translation).toEqual({ x: 15, y: 0, z: 0 });
  });

  /**
   * Und das ist der Sinn der Sache: Der Koerper rutscht auf die **Flaeche** zu,
   * nicht auf den angeklickten Punkt. Haette man ihn zum Punkt geschoben,
   * stuende er danach 30 hoeher und 10 weiter hinten.
   */
  it("schiebt den Koerper nicht auf den angeklickten Punkt", () => {
    const motion = mateMotion(
      { point: point(0, 0, 0), normal: point(0, 1, 0) },
      { point: point(50, 8, -25), normal: point(0, -1, 0) },
      "against",
    );
    expect(motion!.translation).toEqual({ x: 0, y: 8, z: 0 });
  });

  it("dreht den Koerper, bis die Flaechen gegeneinander stehen", () => {
    const motion = mateMotion(
      { point: point(0, 0, 0), normal: point(1, 0, 0) },
      { point: point(0, 10, 0), normal: point(0, -1, 0) },
      "against",
    );
    expect(motion!.rotation).not.toBeNull();
    // Die bewegte Normale zeigt danach nach oben - der anderen entgegen.
    expect(turned(point(1, 0, 0), motion!.rotation!)).toEqual([0, 1, 0]);
    expect(mateTurnDegrees(motion!.rotation!)).toBeCloseTo(90, 9);
  });

  /**
   * Der Drehpunkt ist der angeklickte Punkt. Deshalb bleibt er beim Drehen
   * stehen, und erst die Verschiebung danach bringt ihn an seinen Platz - das
   * ist dieselbe Reihenfolge wie beim Flachlegen.
   */
  it("dreht um den angeklickten Punkt", () => {
    const motion = mateMotion(
      { point: point(7, -2, 4), normal: point(1, 0, 0) },
      { point: point(0, 10, 0), normal: point(0, -1, 0) },
      "against",
    );
    expect([motion!.pivot.x, motion!.pivot.y, motion!.pivot.z]).toEqual([7, -2, 4]);
  });
});

describe("In einer Ebene", () => {
  /**
   * Flaechen in einer Ebene schauen in dieselbe Richtung: Zwei Teile, deren
   * Seiten eine durchgehende Flaeche bilden. Ruecken an Ruecken waere hier
   * genau falsch - der Koerper laege hinter der Flaeche statt neben ihr.
   */
  it("dreht die bewegte Flaeche in dieselbe Richtung wie die andere", () => {
    const motion = mateMotion(
      { point: point(0, 0, 0), normal: point(-1, 0, 0) },
      { point: point(30, 0, 0), normal: point(1, 0, 0) },
      "flush",
    );
    expect(turned(point(-1, 0, 0), motion!.rotation!)).toEqual([1, 0, 0]);
    expect(mateTurnDegrees(motion!.rotation!)).toBeCloseTo(180, 6);
  });

  it("legt zwei schon gleich gerichtete Flaechen nur in eine Ebene", () => {
    const motion = mateMotion(
      { point: point(0, 5, 0), normal: point(0, 1, 0) },
      { point: point(0, 12, 0), normal: point(0, 1, 0) },
      "flush",
    );
    expect(motion!.rotation).toBeNull();
    expect(motion!.translation).toEqual({ x: 0, y: 7, z: 0 });
  });
});

describe("Das Spiel", () => {
  /**
   * Das Spiel wird aus der Zielflaeche heraus gemessen, also laengs ihrer
   * Normale. Bei Ruecken an Ruecken ruecken die Koerper damit auseinander.
   */
  it("laesst Luft zwischen den beiden Ebenen", () => {
    const base = {
      source: { point: point(0, 0, 0), normal: point(0, -1, 0) },
      target: { point: point(0, 10, 0), normal: point(0, 1, 0) },
    };
    expect(mateMotion(base.source, base.target, "against", 0)!.translation.y).toBeCloseTo(10, 9);
    expect(mateMotion(base.source, base.target, "against", 2)!.translation.y).toBeCloseTo(12, 9);
    // Und ein negatives Spiel schiebt hinein - fuer eine Presspassung.
    expect(mateMotion(base.source, base.target, "against", -1)!.translation.y).toBeCloseTo(9, 9);
  });

  it("misst es laengs der Zielnormale, auch wenn die schraeg steht", () => {
    const motion = mateMotion(
      { point: point(0, 0, 0), normal: point(0, 1, 0) },
      { point: point(0, 0, 0), normal: point(0, -1, 0) },
      "against",
      5,
    );
    // Die Zielnormale zeigt nach unten, also geht das Spiel nach unten.
    expect(motion!.translation.y).toBeCloseTo(-5, 9);
  });

  it("hat eine Obergrenze, damit der Koerper nicht aus dem Bild rutscht", () => {
    expect(MAX_MATE_GAP).toBeGreaterThan(0);
  });
});

describe("Wo nichts zu rechnen ist", () => {
  it("gibt null, wenn die Zielflaeche keine Normale hat", () => {
    expect(mateMotion(
      { point: point(0, 0, 0), normal: point(0, 1, 0) },
      { point: point(0, 10, 0), normal: point(0, 0, 0) },
      "against",
    )).toBeNull();
  });

  it("und auch, wenn die bewegte keine hat", () => {
    expect(mateMotion(
      { point: point(0, 0, 0), normal: point(0, 0, 0) },
      { point: point(0, 10, 0), normal: point(0, 1, 0) },
      "against",
    )).toBeNull();
  });

  /**
   * Keine negative Null in der Verschiebung: Sie rechnet sich richtig,
   * schreibt sich aber in die Projektdatei und vergleicht sich nicht gleich -
   * dieselbe Regel wie in `placementWorkplane` und `dragAxisLock`.
   */
  it("schreibt keine negative Null", () => {
    const motion = mateMotion(
      { point: point(0, 0, 0), normal: point(0, 1, 0) },
      { point: point(0, 0, 0), normal: point(0, -1, 0) },
      "against",
    );
    expect(Object.is(motion!.translation.x, -0)).toBe(false);
    expect(Object.is(motion!.translation.y, -0)).toBe(false);
    expect(Object.is(motion!.translation.z, -0)).toBe(false);
  });
});
