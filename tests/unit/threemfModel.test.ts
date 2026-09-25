import { describe, expect, it } from "vitest";
import { threemfModelEntry } from "@/lib/threemfImport";
import {
  THREEMF_IDENTITY,
  THREEMF_MAX_COMPONENT_DEPTH,
  applyThreemfTransform,
  combineThreemfTransforms,
  parseThreemfTransform,
  threemfTrianglePositions,
  type ThreemfModel,
  type ThreemfTransform,
} from "@/lib/threemfModel";

/** Ein Dreieck bei z = 0, in Millimetern und mit Z nach oben - wie in der Datei. */
const TRIANGLE = {
  vertices: [0, 0, 0, 10, 0, 0, 0, 20, 0],
  triangles: [0, 1, 2],
};

/**
 * Die Drehung auf unsere Ausrichtung macht aus einer Null eine negative Null.
 * Rechnerisch ist das dieselbe Zahl, `toEqual` unterscheidet sie aber - also
 * wird das Vorzeichen der Null hier eingeebnet.
 */
function numbers(values: readonly number[]) {
  return values.map((value) => value + 0);
}

/** Verschiebt um dx, dy, dz, ohne zu drehen. */
function shift(dx: number, dy: number, dz: number): ThreemfTransform {
  return [1, 0, 0, 0, 1, 0, 0, 0, 1, dx, dy, dz];
}

/** Dreht um die Z-Achse der Datei (bei uns die Achse nach hinten). */
function turnAroundZ(degrees: number): ThreemfTransform {
  const a = (degrees * Math.PI) / 180;
  return [Math.cos(a), Math.sin(a), 0, -Math.sin(a), Math.cos(a), 0, 0, 0, 1, 0, 0, 0];
}

describe("die Lage eines Bauteils", () => {
  it("liest zwoelf Zahlen und lehnt alles andere ab", () => {
    expect(parseThreemfTransform("1 0 0 0 1 0 0 0 1 5 6 7")).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1, 5, 6, 7]);
    // Fehlt das Feld oder stimmt es nicht, bleibt das Bauteil, wo es steht -
    // ein falsch verstandenes Feld wuerde es an einen zufaelligen Fleck werfen.
    expect(parseThreemfTransform(null)).toBe(THREEMF_IDENTITY);
    expect(parseThreemfTransform("1 0 0")).toBe(THREEMF_IDENTITY);
    expect(parseThreemfTransform("1 0 0 0 1 0 0 0 1 5 6 sieben")).toBe(THREEMF_IDENTITY);
  });

  it("legt einen Punkt in die gelesene Lage", () => {
    expect(applyThreemfTransform(shift(1, 2, 3), 10, 20, 30)).toEqual([11, 22, 33]);
    const [x, y, z] = applyThreemfTransform(turnAroundZ(90), 10, 0, 0);
    expect(x).toBeCloseTo(0, 9);
    expect(y).toBeCloseTo(10, 9);
    expect(z).toBeCloseTo(0, 9);
  });
});

/**
 * Ein Bauteil traegt seine eigene Lage, und der Bauplatz stellt die ganze
 * Baugruppe noch einmal um. Beides muss sich zu einer einzigen Rechnung
 * zusammenlegen lassen; wer hier danebenliegt, bekommt eine Baugruppe, deren
 * Teile einzeln richtig, zusammen aber falsch stehen.
 */
describe("zwei Lagen hintereinander", () => {
  it("gibt dasselbe wie zweimal nacheinander rechnen", () => {
    const outer = combineThreemfTransforms(shift(100, 0, 0), turnAroundZ(90));
    const inner = combineThreemfTransforms(turnAroundZ(90), shift(100, 0, 0));

    // Erst drehen, dann schieben: der Punkt landet bei (100, 10).
    const a = applyThreemfTransform(outer, 10, 0, 0);
    expect(a[0]).toBeCloseTo(100, 9);
    expect(a[1]).toBeCloseTo(10, 9);

    // Erst schieben, dann drehen: dieselbe Drehung greift auch die
    // Verschiebung ab, der Punkt landet bei (0, 110).
    const b = applyThreemfTransform(inner, 10, 0, 0);
    expect(b[0]).toBeCloseTo(0, 9);
    expect(b[1]).toBeCloseTo(110, 9);
  });

  it("stimmt fuer jeden Punkt mit dem Nacheinander ueberein", () => {
    const outer = combineThreemfTransforms(shift(3, -7, 11), turnAroundZ(37));
    const points: [number, number, number][] = [[0, 0, 0], [5, 0, 0], [-2, 9, 4], [1.5, -3.5, 8]];
    points.forEach(([x, y, z]) => {
      const once = applyThreemfTransform(outer, x, y, z);
      const twice = applyThreemfTransform(shift(3, -7, 11), ...applyThreemfTransform(turnAroundZ(37), x, y, z));
      once.forEach((value, i) => expect(value).toBeCloseTo(twice[i], 9));
    });
  });

  it("laesst eine unveraenderte Lage einfach durch", () => {
    expect(combineThreemfTransforms(THREEMF_IDENTITY, shift(1, 2, 3))).toEqual(shift(1, 2, 3));
    expect(combineThreemfTransforms(shift(1, 2, 3), THREEMF_IDENTITY)).toEqual(shift(1, 2, 3));
  });
});

describe("die Dreiecke einer 3MF-Datei", () => {
  it("dreht die Datei auf unsere Ausrichtung", () => {
    // 3MF hat Z nach oben wie jeder Slicer, wir haben Y nach oben. Der Punkt
    // (0, 20, 0) der Datei liegt bei uns also bei (0, 0, -20).
    const model: ThreemfModel = {
      objects: [{ id: "1", mesh: TRIANGLE }],
      build: [{ objectId: "1", transform: THREEMF_IDENTITY }],
    };
    expect(numbers(threemfTrianglePositions(model))).toEqual([0, 0, 0, 10, 0, 0, 0, 0, -20]);
  });

  it("stellt jeden Eintrag des Bauplatzes an seinen Fleck", () => {
    const model: ThreemfModel = {
      objects: [{ id: "1", mesh: TRIANGLE }],
      build: [
        { objectId: "1", transform: THREEMF_IDENTITY },
        { objectId: "1", transform: shift(50, 0, 0) },
      ],
    };
    const positions = threemfTrianglePositions(model);
    expect(positions).toHaveLength(18);
    // Dasselbe Netz zweimal, das zweite um 50 mm versetzt.
    expect(numbers(positions.slice(9))).toEqual([50, 0, 0, 60, 0, 0, 50, 0, -20]);
  });

  it("loest Baugruppen ueber mehrere Ebenen auf", () => {
    // Bauplatz schiebt um 100, die Baugruppe noch einmal um 10 - das Netz muss
    // am Ende bei 110 stehen, nicht bei 100 oder 10.
    const model: ThreemfModel = {
      objects: [
        { id: "netz", mesh: TRIANGLE },
        { id: "innen", components: [{ objectId: "netz", transform: shift(10, 0, 0) }] },
        { id: "aussen", components: [{ objectId: "innen", transform: THREEMF_IDENTITY }] },
      ],
      build: [{ objectId: "aussen", transform: shift(100, 0, 0) }],
    };
    expect(numbers(threemfTrianglePositions(model).slice(0, 3))).toEqual([110, 0, 0]);
  });

  it("laesst Stuetzen und Hilfsflaechen stehen", () => {
    const model: ThreemfModel = {
      objects: [
        { id: "1", type: "model", mesh: TRIANGLE },
        { id: "2", type: "support", mesh: TRIANGLE },
      ],
      build: [{ objectId: "1", transform: THREEMF_IDENTITY }, { objectId: "2", transform: THREEMF_IDENTITY }],
    };
    // Nur das eine Netz - Stuetzmaterial ist kein Bauteil.
    expect(threemfTrianglePositions(model)).toHaveLength(9);
  });

  it("nimmt alle Netze, wenn kein Bauplatz in der Datei steht", () => {
    const model: ThreemfModel = {
      objects: [{ id: "1", mesh: TRIANGLE }, { id: "2", mesh: TRIANGLE }],
      build: [],
    };
    expect(threemfTrianglePositions(model)).toHaveLength(18);
  });

  it("uebergeht einen Eintrag, der ins Leere zeigt", () => {
    const model: ThreemfModel = {
      objects: [{ id: "1", mesh: TRIANGLE }],
      build: [{ objectId: "gibtesnicht", transform: THREEMF_IDENTITY }, { objectId: "1", transform: THREEMF_IDENTITY }],
    };
    expect(threemfTrianglePositions(model)).toHaveLength(9);
  });
});

/**
 * Eine beschaedigte oder boshafte Datei darf nicht in einen unverstaendlichen
 * Absturz laufen. Wichtig ist der Ring: Eine Baugruppe, die sich selbst
 * enthaelt, wuerde sonst ewig laufen und den Browser mitnehmen.
 */
describe("eine Datei, die nicht stimmt", () => {
  it("haelt eine Baugruppe an, die sich selbst enthaelt", () => {
    const model: ThreemfModel = {
      objects: [
        { id: "a", components: [{ objectId: "b", transform: THREEMF_IDENTITY }] },
        { id: "b", components: [{ objectId: "a", transform: THREEMF_IDENTITY }] },
      ],
      build: [{ objectId: "a", transform: THREEMF_IDENTITY }],
    };
    expect(() => threemfTrianglePositions(model)).toThrow(/contains itself/);
  });

  it("haelt eine zu tief geschachtelte Baugruppe an", () => {
    const depth = THREEMF_MAX_COMPONENT_DEPTH + 5;
    const objects = Array.from({ length: depth }, (_, i) => ({
      id: `e${i}`,
      components: [{ objectId: `e${i + 1}`, transform: THREEMF_IDENTITY }],
    }));
    const model: ThreemfModel = {
      objects: [...objects, { id: `e${depth}`, mesh: TRIANGLE }],
      build: [{ objectId: "e0", transform: THREEMF_IDENTITY }],
    };
    expect(() => threemfTrianglePositions(model)).toThrow(/nested too deeply/);
  });

  it("nennt ein Dreieck beim Namen, das auf einen Punkt zeigt, den es nicht gibt", () => {
    const model: ThreemfModel = {
      objects: [{ id: "1", mesh: { vertices: TRIANGLE.vertices, triangles: [0, 1, 9] } }],
      build: [{ objectId: "1", transform: THREEMF_IDENTITY }],
    };
    expect(() => threemfTrianglePositions(model)).toThrow(/does not exist/);
  });

  it("faengt ein fehlendes Feld ab, statt an einem leeren Punkt zu zerbrechen", () => {
    // Ein fehlendes v1 wird beim Auslesen zu NaN. Eine reine Bereichspruefung
    // laesst NaN durch - dahinter stuende dann ein Punkt, den es nicht gibt.
    const model: ThreemfModel = {
      objects: [{ id: "1", mesh: { vertices: TRIANGLE.vertices, triangles: [Number.NaN, 1, 2] } }],
      build: [{ objectId: "1", transform: THREEMF_IDENTITY }],
    };
    expect(() => threemfTrianglePositions(model)).toThrow(/does not exist/);
  });

  it("faengt einen Eckpunkt ab, der keine Zahl ist", () => {
    const model: ThreemfModel = {
      objects: [{ id: "1", mesh: { vertices: [0, 0, 0, 10, 0, 0, 0, Number.NaN, 0], triangles: [0, 1, 2] } }],
      build: [{ objectId: "1", transform: THREEMF_IDENTITY }],
    };
    expect(() => threemfTrianglePositions(model)).toThrow(/not a number/);
  });
});

/**
 * Die Norm schreibt "3D/3dmodel.model" vor, aber nicht jedes Werkzeug haelt
 * sich daran - manche legen die Datei in einen Unterordner oder schreiben sie
 * anders gross. Der Weg darueber steckt in `threemfImport.ts` und braucht den
 * Browser; diese Suche nicht.
 */
describe("die Modelldatei im Archiv", () => {
  it("findet den vorgeschriebenen Pfad, egal wie er geschrieben steht", () => {
    expect(threemfModelEntry(["_rels/.rels", "3D/3dmodel.model"])).toBe("3D/3dmodel.model");
    expect(threemfModelEntry(["3d/3dmodel.model"])).toBe("3d/3dmodel.model");
  });

  it("nimmt sonst irgendeine Modelldatei, statt aufzugeben", () => {
    expect(threemfModelEntry(["_rels/.rels", "3D/andere.model"])).toBe("3D/andere.model");
  });

  it("zieht den vorgeschriebenen Pfad vor, wenn beides dasteht", () => {
    expect(threemfModelEntry(["3D/zusatz.model", "3D/3dmodel.model"])).toBe("3D/3dmodel.model");
  });

  it("meldet nichts, wo nichts ist", () => {
    expect(threemfModelEntry(["_rels/.rels", "[Content_Types].xml"])).toBeNull();
  });
});
