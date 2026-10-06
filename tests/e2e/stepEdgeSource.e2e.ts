import { beforeAll, describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { OcctKernel } from "occt-wasm";

/**
 * Der Probelauf fuer das Kantenwerkzeug auf STEP-Importen.
 *
 * Ein importierter Koerper bringt seine genaue Geometrie mit: `brepStep` liegt
 * seit dem Einlesen neben dem Netz. Verrundet wurde bisher trotzdem das Netz -
 * und ein Netz erreicht den Kern als Vielflaechner. Beim Zylinder heisst das:
 * statt eines Mantels 96 schmale Rechtecke und 96 fast tangentiale Kanten
 * dazwischen. Was dabei herauskommt, ist keine Verrundung mehr.
 *
 * Hier steht zuerst die Frage, ob der Kern den Weg ueber die Datei ueberhaupt
 * traegt, und was er gegenueber dem Netz einbringt. Gerechnet wird mit dem
 * echten `OcctKernel` - demselben, mit dem auch der Arbeiter rechnet, und
 * nicht ueber die brepjs-Huelle.
 */
let cad: OcctKernel;

beforeAll(async () => {
  const wasm = join(dirname(fileURLToPath(import.meta.resolve("occt-wasm"))), "occt-wasm.wasm");
  cad = await OcctKernel.init({ wasm });
}, 180000);

/** Dieselbe Umschreibung in STEP, die `stepImport` ablegt. */
function cylinderStepText(radius: number, height: number) {
  return cad.exportStep(cad.makeCylinder(radius, height));
}

/**
 * Das Netz desselben Zylinders, als ASCII-STL - so wie der Editor den Koerper
 * bisher an den Arbeiter gab.
 */
function cylinderStlText(radius: number, height: number) {
  const mesh = cad.tessellate(cad.makeCylinder(radius, height), { linearDeflection: 0.1, angularDeflection: 0.3 });
  const lines = ["solid mesh"];
  for (let index = 0; index + 2 < mesh.indices.length; index += 3) {
    lines.push("facet normal 0 0 0", "  outer loop");
    for (let corner = 0; corner < 3; corner += 1) {
      const vertex = mesh.indices[index + corner] * 3;
      lines.push(`    vertex ${mesh.positions[vertex]} ${mesh.positions[vertex + 1]} ${mesh.positions[vertex + 2]}`);
    }
    lines.push("  endloop", "endfacet");
  }
  lines.push("endsolid mesh");
  return lines.join("\n");
}

describe("Der Kern liest den genauen Koerper aus der Datei", () => {
  it("baut aus STEP-Text wieder einen Koerper", () => {
    const solid = cad.importStep(cylinderStepText(10, 30));
    const solids = cad.getSubShapes(solid, "solid");
    const body = solids.length === 1 ? solids[0] : solid;
    expect(cad.isSolid(body)).toBe(true);
    expect(cad.getVolume(body)).toBeCloseTo(Math.PI * 100 * 30, 0);
  }, 120000);

  /**
   * Der Grund fuer das Ganze: Der Mantel bleibt ein Mantel. Drei Flaechen,
   * eine davon zylindrisch - genau das, was die Datei beschreibt.
   */
  it("behaelt die runden Flaechen rund", () => {
    const body = cad.getSubShapes(cad.importStep(cylinderStepText(10, 30)), "solid")[0];
    const faces = cad.getSubShapes(body, "face");
    expect(faces.length).toBe(3);
    expect(faces.map((face) => cad.surfaceType(face)).filter((kind) => kind === "cylinder").length).toBe(1);
  }, 120000);

  /**
   * Und was aus dem Netz wird: lauter Ebenen, keine einzige runde Flaeche -
   * und der Deckelrand ist kein Kreis mehr, sondern ein Vieleck aus Dutzenden
   * Kanten. Genau das lag dem Kantenwerkzeug bisher vor.
   */
  it("zeigt, was der Weg ueber das Netz daraus macht", () => {
    const imported = cad.importStl(cylinderStlText(10, 30));
    const faces = cad.getSubShapes(imported, "face");
    expect(faces.length).toBeGreaterThan(50);
    expect(faces.every((face) => cad.surfaceType(face) === "plane")).toBe(true);

    // Derselbe Koerper, zusammengenaeht wie im Arbeiter.
    let sewn = cad.sewAndSolidify(faces, 1e-5);
    sewn = cad.fixShape(sewn);
    sewn = cad.healSolid(sewn, 1e-5);
    sewn = cad.unifySameDomain(sewn);
    expect(cad.isSolid(sewn)).toBe(true);
    const rim = cad.getSubShapes(sewn, "edge").filter((edge) => cad.getBoundingBox(edge).zmin > 29.9);
    expect(rim.length).toBeGreaterThan(20);
    // Und das Facettieren kostet Volumen, noch vor der ersten Bearbeitung.
    expect(cad.getVolume(sewn)).toBeLessThan(Math.PI * 100 * 30 * 0.999);
  }, 120000);

  /**
   * Und warum das Netz trotzdem mitfaehrt: Eine Datei muss keinen
   * geschlossenen Koerper beschreiben. Kommt nur eine offene Schale herein,
   * hat der genaue Weg nichts zu bieten - dann naeht der Dienst wie bisher die
   * Dreiecke zusammen, statt das Werkzeug zu sperren.
   */
  it("gibt eine offene Schale als Nicht-Koerper zurueck", () => {
    const box = cad.makeBoxFromCorners({ x: 0, y: 0, z: 0 }, { x: 10, y: 10, z: 10 });
    const single = cad.getSubShapes(box, "face")[0];
    const back = cad.importStep(cad.exportStep(single));
    expect(cad.isSolid(back)).toBe(false);
    expect(cad.getSubShapes(back, "solid").length).toBe(0);
  }, 120000);

  /**
   * Womit die Lage gesetzt werden darf. Gleichmaessig aufgezogen bleibt der
   * Mantel ein Mantel - `transform` traegt das. Ungleichmaessig gezogen
   * braucht es `generalTransform`, und danach ist keine Flaeche mehr analytisch
   * und das Volumen stimmt nicht mehr. Darum gibt
   * `importedStepSourceForShape` fuer einen ungleichmaessig gezogenen Koerper
   * nichts zurueck.
   */
  it("bleibt beim gleichmaessigen Aufziehen genau, beim Verzerren nicht", () => {
    const body = cad.getSubShapes(cad.importStep(cylinderStepText(10, 30)), "solid")[0];

    const uniform = cad.transform(body, [2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0]);
    expect(cad.getSubShapes(uniform, "face").map((face) => cad.surfaceType(face)).filter((kind) => kind === "cylinder").length).toBe(1);
    expect(cad.getVolume(uniform)).toBeCloseTo(Math.PI * 100 * 30 * 8, 0);

    const stretched = cad.generalTransform(body, [2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0]);
    expect(cad.getSubShapes(stretched, "face").every((face) => cad.surfaceType(face) === "bspline")).toBe(true);
    // Gewollt waere das Doppelte; es fehlt knapp ein Prozent.
    const wanted = Math.PI * 10 * 20 * 30;
    expect(Math.abs(cad.getVolume(stretched) - wanted) / wanted).toBeGreaterThan(0.005);
  }, 120000);

  /**
   * Die Kante, auf die es ankommt: Der Deckelrand ist beim genauen Koerper
   * ein einziger Kreis. Nur so verrundet er in einem Zug.
   */
  it("verrundet den Deckelrand in einem Zug", () => {
    const body = cad.getSubShapes(cad.importStep(cylinderStepText(10, 30)), "solid")[0];
    const circles = cad.getSubShapes(body, "edge").filter((edge) => {
      const box = cad.getBoundingBox(edge);
      return box.zmin > 29.9;
    });
    expect(circles.length).toBe(1);
    const filleted = cad.fillet(body, circles, 2);
    expect(cad.isSolid(filleted)).toBe(true);
    const full = Math.PI * 100 * 30;
    // Eine Hohlkehle am Deckelrand nimmt ein wenig weg, nicht viel.
    expect(cad.getVolume(filleted)).toBeLessThan(full);
    expect(cad.getVolume(filleted)).toBeGreaterThan(full * 0.98);
  }, 120000);
});
