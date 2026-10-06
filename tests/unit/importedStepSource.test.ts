import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { cadTransformToMatrix, importedStepSourceForShape } from "@/lib/cadBakeMetadata";
import { cadTransformRequiresGeneralTransform } from "@/lib/cadModifierRuntime";
import type { WorkplaneShape } from "@/types/sketchforge";

const STEP_TEXT = "ISO-10303-21;\nHEADER;\nENDSEC;\nDATA;\nENDSEC;\nEND-ISO-10303-21;\n";

/**
 * Ein importierter Koerper mit Grundmassen 2 x 2 x 2, wie er aus
 * `stepImport` kommt: Netz und genaue Beschreibung in einem Rahmen - mittig
 * auf x und z, Unterseite auf null.
 */
function importedShape(overrides: Partial<WorkplaneShape> = {}): WorkplaneShape {
  return {
    id: "imported",
    name: "Imported",
    kind: "mesh",
    color: "#d41721",
    x: 10,
    z: -4,
    elevation: 5,
    size: 2,
    width: 2,
    depth: 2,
    height: 2,
    rotation: 0,
    rotationX: 0,
    rotationZ: 0,
    importedMesh: {
      positions: [-1, 0, -1, 1, 0, -1, 0, 2, 1],
      baseWidth: 2,
      baseDepth: 2,
      baseHeight: 2,
      triangleCount: 1,
      sourceFormat: "step",
      brepStep: STEP_TEXT,
    },
    locked: false,
    hidden: false,
    ...overrides,
  };
}

/** Wohin die Lage einen Punkt der Datei bringt. */
function placed(shape: WorkplaneShape, point: [number, number, number]) {
  const source = importedStepSourceForShape(shape);
  expect(source).not.toBeNull();
  const vector = new THREE.Vector3(...point).applyMatrix4(cadTransformToMatrix(source?.transform));
  return [vector.x, vector.y, vector.z].map((value) => Number(value.toFixed(6)));
}

describe("Der genaue Koerper eines Imports", () => {
  it("reicht die Beschreibung aus der Datei weiter", () => {
    expect(importedStepSourceForShape(importedShape())?.stepText).toBe(STEP_TEXT);
  });

  it("nimmt nichts, wo keine Datei mitkam", () => {
    const shape = importedShape();
    expect(importedStepSourceForShape({
      ...shape,
      importedMesh: { ...shape.importedMesh!, brepStep: undefined },
    })).toBeNull();
  });

  /**
   * Die Lage: Die Datei liegt im Rahmen des Netzes, der Koerper steht
   * irgendwo in der Zeichnung. Unten mittig gehoert auf seine Hoehe, oben
   * mittig um die Hoehe darueber.
   */
  it("legt die Datei dorthin, wo der Koerper steht", () => {
    const shape = importedShape();
    expect(placed(shape, [0, 0, 0])).toEqual([10, 5, -4]);
    expect(placed(shape, [0, 2, 0])).toEqual([10, 7, -4]);
    expect(placed(shape, [1, 0, 0])).toEqual([11, 5, -4]);
  });

  it("zieht sie gleichmaessig mit dem Koerper auf", () => {
    const shape = importedShape({ width: 4, depth: 4, height: 4, size: 4 });
    expect(placed(shape, [0, 0, 0])).toEqual([10, 5, -4]);
    // Doppelt so hoch: der Deckel sitzt 4 ueber der Unterseite.
    expect(placed(shape, [0, 2, 0])).toEqual([10, 9, -4]);
    expect(placed(shape, [1, 0, 0])).toEqual([12, 5, -4]);
  });

  it("dreht sie mit", () => {
    // Um 90 Grad um die Hochachse gedreht zeigt die alte x-Richtung nach -z.
    expect(placed(importedShape({ rotation: 90 }), [1, 0, 0])).toEqual([10, 5, -5]);
  });

  it("spiegelt sie mit", () => {
    expect(placed(importedShape({ mirrorX: true }), [1, 0, 0])).toEqual([9, 5, -4]);
  });

  /**
   * Eine fruehere Kantenbearbeitung hat ihr Ergebnis abgelegt; die Datei
   * kennt die Verrundung nicht, die schon am Koerper sitzt.
   */
  it("tritt zurueck, wenn schon ein bearbeiteter Koerper daneben liegt", () => {
    const shape = importedShape({
      cadBrep: "brep-after-fillet",
      cadBrepFrame: { x: 10, z: -4, elevation: 5, width: 2, depth: 2, height: 2 },
    });
    expect(importedStepSourceForShape(shape)).toBeNull();
  });

  it("tritt zurueck, wenn der Koerper verjuengt ist", () => {
    expect(importedStepSourceForShape(importedShape({ taperTopScale: 0.5 }))).toBeNull();
  });

  /**
   * Ungleichmaessig gezogen muesste der Kern den Koerper mit
   * `generalTransform` umbauen - jede Flaeche wird dabei ein B-Spline, und bei
   * einem auf das Doppelte gezogenen Zylinder lag das Volumen gemessen 0,9
   * Prozent daneben. Dann ist das Netz die ehrlichere Quelle: Es hat die
   * richtige Groesse.
   */
  it("tritt zurueck, wenn der Koerper ungleichmaessig gezogen ist", () => {
    expect(importedStepSourceForShape(importedShape({ width: 4, size: 4 }))).toBeNull();
    expect(importedStepSourceForShape(importedShape({ height: 6 }))).toBeNull();
  });

  /**
   * Mit starren Raendern gezogen ist das Netz in der Mitte gestreckt und an
   * den Enden stehengelassen - keine Lage kann das nachmachen.
   */
  it("tritt zurueck, wenn mit starren Raendern gezogen wurde", () => {
    const shape = importedShape({
      width: 4,
      depth: 4,
      height: 4,
      size: 4,
      edgeResizeMode: "preserve",
      hollowWall: 1,
    });
    expect(importedStepSourceForShape(shape)).toBeNull();
    // Ohne Ziehen bleibt die Datei auch bei starren Raendern die Quelle.
    expect(importedStepSourceForShape({ ...shape, width: 2, depth: 2, height: 2, size: 2 })).not.toBeNull();
  });

  /**
   * Die tragende Eigenschaft: Was zurueckkommt, muss der Kern mit einer
   * gewoehnlichen Verschiebung setzen koennen. Braeuchte er
   * `generalTransform`, waere der genaue Koerper beim Ankommen schon keiner
   * mehr - und der ganze Weg umsonst.
   */
  it("gibt nur Lagen zurueck, die der Kern ohne Umbau setzen kann", () => {
    const cases: Array<Partial<WorkplaneShape>> = [
      {},
      { rotation: 37 },
      { rotationX: 12, rotationZ: -40 },
      { mirrorX: true },
      { mirrorY: true, rotation: 90 },
      { width: 5, depth: 5, height: 5, size: 5 },
      { width: 0.5, depth: 0.5, height: 0.5, size: 0.5, rotation: 15, mirrorZ: true },
    ];
    cases.forEach((overrides) => {
      const source = importedStepSourceForShape(importedShape(overrides));
      expect(source, JSON.stringify(overrides)).not.toBeNull();
      if (source?.transform) {
        expect(cadTransformRequiresGeneralTransform(source.transform), JSON.stringify(overrides)).toBe(false);
      }
    });
  });
});
