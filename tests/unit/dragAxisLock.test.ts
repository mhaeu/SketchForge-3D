import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { dragAxisLock, type AxisLockPlane } from "@/lib/dragAxisLock";

/** Die ebene Arbeitsflaeche: X nach rechts, Z nach vorn. */
const flat: AxisLockPlane = { xAxis: { x: 1, y: 0, z: 0 }, zAxis: { x: 0, y: 0, z: 1 } };

describe("Ein Zug mit Umschalt auf der ebenen Flaeche", () => {
  it("nimmt die Richtung, in die er weiter gegangen ist", () => {
    expect(dragAxisLock(flat, 12, 0, 3)).toEqual({ along: "x", delta: { x: 12, y: 0, z: 0 } });
    expect(dragAxisLock(flat, 3, 0, -12)).toEqual({ along: "z", delta: { x: 0, y: 0, z: -12 } });
  });

  it("laesst die andere Richtung ganz weg", () => {
    expect(dragAxisLock(flat, 12, 0, 3).delta.z).toBe(0);
    expect(dragAxisLock(flat, 3, 0, 12).delta.x).toBe(0);
  });

  it("behaelt das Vorzeichen", () => {
    expect(dragAxisLock(flat, -20, 0, 1).delta.x).toBe(-20);
  });

  /**
   * Auf der Winkelhalbierenden muss die Antwort stehen bleiben: Flackerte sie
   * zwischen den Achsen, zappelte der Koerper beim Ziehen.
   */
  it("bleibt bei Gleichstand bei derselben Achse", () => {
    expect(dragAxisLock(flat, 7, 0, 7).along).toBe("x");
    expect(dragAxisLock(flat, 7, 0, -7).along).toBe("x");
    expect(dragAxisLock(flat, -7, 0, 7).along).toBe("x");
  });

  it("gibt bei keinem Zug keine Verschiebung", () => {
    expect(dragAxisLock(flat, 0, 0, 0).delta).toEqual({ x: 0, y: 0, z: 0 });
  });

  /**
   * Keine Null mit Vorzeichen: Die Verschiebung wandert in die
   * Koerperkoordinaten, und -0 in einem Vergleich ueberrascht spaeter
   * irgendwen. Dasselbe tun das Flachlegen und die Arbeitsebene schon.
   */
  it("gibt keine Null mit Vorzeichen heraus", () => {
    const delta = dragAxisLock(flat, 3, 0, -12).delta;
    expect(Object.is(delta.x, -0)).toBe(false);
    expect(Object.is(delta.y, -0)).toBe(false);
    expect(Object.is(dragAxisLock(flat, -12, 0, 3).delta.z, -0)).toBe(false);
  });

  it("ruehrt die Hochachse nicht an", () => {
    // Ein Zug nach oben gehoert keiner der beiden Ebenenachsen.
    expect(dragAxisLock(flat, 0, 9, 0).delta).toEqual({ x: 0, y: 0, z: 0 });
  });
});

describe("Auf einer gekippten Flaeche", () => {
  /**
   * Der Fall, der mit den Weltachsen schiefgehen wuerde: Eine um 45 Grad um
   * X gekippte Flaeche hat eine Richtung, die zugleich nach hinten und nach
   * oben zeigt. Der Koerper muss in der Flaeche bleiben.
   */
  const tilted: AxisLockPlane = {
    xAxis: { x: 1, y: 0, z: 0 },
    zAxis: { x: 0, y: Math.SQRT1_2, z: Math.SQRT1_2 },
  };

  it("laeuft in der Flaeche und nicht aus ihr heraus", () => {
    const lock = dragAxisLock(tilted, 0, 5, 5);
    expect(lock.along).toBe("z");
    // Der ganze Weg liegt auf der gekippten Achse: 5*sqrt(1/2)*2 = 7,071.
    expect(lock.delta.x).toBeCloseTo(0, 12);
    expect(lock.delta.y).toBeCloseTo(5, 12);
    expect(lock.delta.z).toBeCloseTo(5, 12);
  });

  it("legt einen schraegen Zug auf die naechste Ebenenachse", () => {
    const lock = dragAxisLock(tilted, 1, 4, 4);
    expect(lock.along).toBe("z");
    // Senkrecht zur Achse bleibt nichts uebrig.
    const axis = new THREE.Vector3(0, Math.SQRT1_2, Math.SQRT1_2);
    const delta = new THREE.Vector3(lock.delta.x, lock.delta.y, lock.delta.z);
    expect(delta.clone().cross(axis).length()).toBeCloseTo(0, 12);
  });

  it("nimmt die Ebenenachse und nicht die Weltachse", () => {
    // Ein Zug gerade nach hinten geht zur Haelfte auf die gekippte Achse -
    // und hebt den Koerper dabei an, weil die Flaeche das so vorgibt.
    const lock = dragAxisLock(tilted, 0, 0, 10);
    expect(lock.along).toBe("z");
    expect(lock.delta.y).toBeCloseTo(5, 12);
    expect(lock.delta.z).toBeCloseTo(5, 12);
  });
});
