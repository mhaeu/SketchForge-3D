import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { Brush, Evaluator, SUBTRACTION } from "three-bvh-csg";

/**
 * Das buendige Abschneiden in Verschneidungen.
 *
 * Eine Ebene schneidet flach; eine gewoelbte Flaeche trifft sie nur in einer
 * Linie. Der schneidende Koerper muss deshalb selbst die Schneide sein:
 *
 *   weg = (alles auf der gewaehlten Seite der Ebene) ohne (den Koerper)
 *   Ergebnis = Werkstueck ohne weg
 *
 * Stehen bleibt damit der Teil im Koerper - an dessen Oberflaeche buendig
 * abgeschnitten - und der ganze Ueberstand auf der anderen Seite. Diese
 * Rechnung steht im Editor; hier wird nachgewiesen, dass sie stimmt.
 */
function evaluate(a: THREE.BufferGeometry, b: THREE.BufferGeometry) {
  const evaluator = new Evaluator();
  evaluator.useGroups = false;
  evaluator.attributes = ["position", "normal"];
  return evaluator.evaluate(new Brush(a), new Brush(b), SUBTRACTION);
}

function bounds(brush: { geometry: THREE.BufferGeometry }) {
  const box = new THREE.Box3().setFromBufferAttribute(brush.geometry.getAttribute("position") as THREE.BufferAttribute);
  return box;
}

/** Ein grosser Quader, der alles oberhalb beziehungsweise unterhalb abdeckt. */
function halfSpace(side: "above" | "below") {
  const size = 400;
  const geometry = new THREE.BoxGeometry(size, size, size);
  geometry.translate(0, side === "above" ? size / 2 : -size / 2, 0);
  return geometry;
}

describe("Buendig an einem Koerper abschneiden", () => {
  /** Eine Kugel vom Halbmesser zehn im Ursprung. */
  const sphere = () => new THREE.SphereGeometry(10, 64, 48);
  /** Ein Stab von vier mal vier, der von minus zwanzig bis zwanzig reicht. */
  const rod = () => new THREE.BoxGeometry(4, 40, 4);

  it("laesst den Stab oben an der Woelbung enden und unten stehen", () => {
    const cutter = evaluate(halfSpace("above"), sphere());
    const result = evaluate(rod(), cutter.geometry);
    const box = bounds(result);
    // Oben endet er an der Kugel - und zwar nicht an ihrem Scheitel, sondern
    // dort, wo die Woelbung ueber dem Stabquerschnitt steht.
    const expected = Math.sqrt(100 - 2 * 2 - 2 * 2);
    expect(box.max.y).toBeGreaterThan(expected - 0.2);
    expect(box.max.y).toBeLessThan(10.001);
    // Unten bleibt der ganze Ueberstand.
    expect(box.min.y).toBeCloseTo(-20, 3);
  });

  it("nimmt auf Wunsch die andere Seite", () => {
    const cutter = evaluate(halfSpace("below"), sphere());
    const result = evaluate(rod(), cutter.geometry);
    const box = bounds(result);
    expect(box.min.y).toBeLessThan(-9);
    expect(box.min.y).toBeGreaterThan(-10.001);
    expect(box.max.y).toBeCloseTo(20, 3);
  });

  it("laesst den Teil im Koerper stehen und nicht nur den Ueberstand", () => {
    // Das ist der Unterschied zur Schnittmenge: Die wuerde beide Enden
    // abschneiden, hier bleibt eines ganz.
    const cutter = evaluate(halfSpace("above"), sphere());
    const result = evaluate(rod(), cutter.geometry);
    const box = bounds(result);
    expect(box.max.y - box.min.y).toBeGreaterThan(28);
  });

  it("schneidet an einer flachen Flaeche genauso buendig", () => {
    // Derselbe Weg muss auch dort taugen, wo eine Ebene gereicht haette.
    const plate = new THREE.BoxGeometry(30, 6, 30);
    const cutter = evaluate(halfSpace("above"), plate);
    const result = evaluate(rod(), cutter.geometry);
    const box = bounds(result);
    expect(box.max.y).toBeCloseTo(3, 3);
    expect(box.min.y).toBeCloseTo(-20, 3);
  });

  it("laesst den Stab ganz stehen, wenn er die Ebene gar nicht ueberschreitet", () => {
    const low = new THREE.BoxGeometry(4, 10, 4);
    low.translate(0, -25, 0);
    const cutter = evaluate(halfSpace("above"), sphere());
    const result = evaluate(low, cutter.geometry);
    const box = bounds(result);
    expect(box.min.y).toBeCloseTo(-30, 3);
    expect(box.max.y).toBeCloseTo(-20, 3);
  });
});
