import { describe, expect, it } from "vitest";
import { createReferencePoint, ensureReferencePoint, hasReferencePoint, isReferencePoint, withoutReferencePoints } from "@/lib/referencePoint";
import type { WorkplaneShape } from "@/types/sketchforge";

function body(id: string, children?: WorkplaneShape[]): WorkplaneShape {
  return {
    id, name: id, kind: "box", color: "#fff",
    x: 0, z: 0, elevation: 0, size: 20, width: 20, depth: 20, height: 20,
    rotation: 0, rotationX: 0, rotationZ: 0,
    ...(children ? { groupedShapes: children } : {}),
  } as WorkplaneShape;
}

/** Ein Bezugspunkt mit eigener Kennung - so kommt er aus einer Gruppe zurueck. */
function point(id: string): WorkplaneShape {
  return { ...createReferencePoint(), id } as WorkplaneShape;
}

describe("Genau ein Bezugspunkt", () => {
  it("legt einen an, wo keiner ist", () => {
    const shapes = ensureReferencePoint([body("a")]);
    expect(shapes.filter(isReferencePoint)).toHaveLength(1);
    expect(shapes).toHaveLength(2);
  });

  it("laesst den einen stehen, den es gibt", () => {
    const only = point("eins");
    expect(ensureReferencePoint([body("a"), only])).toEqual([body("a"), only]);
  });

  /**
   * Gemeldet: Der Bezugspunkt wurde doppelt angezeigt, und die Datei liess
   * sich nicht mehr auf dem Server ablegen. In der Datei standen zwei, und
   * ihre Kennungen erzaehlten den Weg: "...-group-child-..." und noch einmal
   * "...-ungroup-...-group-child-...". Er war in eine Gruppe geraten und kam
   * beim Aufloesen mit neuer Kennung zurueck.
   */
  it("behaelt von mehreren den ersten", () => {
    const first = point("zuerst");
    const second = point("reference-point-group-child-48f0");
    const shapes = ensureReferencePoint([first, body("a"), second]);
    expect(shapes.filter(isReferencePoint)).toHaveLength(1);
    expect(shapes.find(isReferencePoint)).toBe(first);
    // Die Koerper bleiben unangetastet und in ihrer Reihenfolge.
    expect(shapes.map((shape) => shape.id)).toEqual(["zuerst", "a"]);
  });

  it("erkennt, ob ueberhaupt einer da ist", () => {
    expect(hasReferencePoint([body("a")])).toBe(false);
    expect(hasReferencePoint([body("a"), point("p")])).toBe(true);
  });
});

describe("Den Bezugspunkt heraushalten", () => {
  it("nimmt ihn von der obersten Ebene", () => {
    expect(withoutReferencePoints([body("a"), point("p"), body("b")]).map((s) => s.id)).toEqual(["a", "b"]);
  });

  /**
   * Der Fall, an dem das Ablegen scheiterte: Er steckte **in** einer Gruppe.
   * Die oberste Ebene sah sauber aus, und trotzdem ging die Datei nicht durch.
   */
  it("nimmt ihn auch aus einer Gruppe heraus", () => {
    const grouped = body("gruppe", [body("kind"), point("reference-point-group-child-48f0")]);
    const cleaned = withoutReferencePoints([grouped]);
    expect(cleaned).toHaveLength(1);
    expect(cleaned[0].groupedShapes?.map((child) => child.id)).toEqual(["kind"]);
  });

  it("geht dabei bis in die tiefste Gruppe", () => {
    const deep = body("aussen", [body("innen", [point("p"), body("kern")])]);
    const cleaned = withoutReferencePoints([deep]);
    expect(cleaned[0].groupedShapes?.[0].groupedShapes?.map((child) => child.id)).toEqual(["kern"]);
  });

  it("laesst eine Gruppe ohne Bezugspunkt unveraendert", () => {
    const grouped = body("gruppe", [body("eins"), body("zwei")]);
    expect(withoutReferencePoints([grouped])[0]).toBe(grouped);
  });
});
