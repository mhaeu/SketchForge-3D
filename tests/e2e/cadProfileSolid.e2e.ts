import { beforeAll, describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { OcctKernel } from "occt-wasm";
import { buildProfileExtrusionSolid } from "@/lib/cadProfileSolid";
import { cadModifierPrimitiveForProfileShape } from "@/lib/cadBakeMetadata";
import { createKnurlGeometry } from "@/lib/knurlGeometry";
import { createGearGeometry } from "@/lib/gearGeometry";
import type { WorkplaneShape } from "@/types/sketchforge";

/**
 * Ist der genaue Koerper derselbe Koerper, der im Bild steht?
 *
 * Darum geht es bei dieser Datei. Ein hochgezogener Umriss ist schnell gebaut;
 * die Frage ist, ob er auf denselben Ecken sitzt wie das Netz - sonst sieht
 * man nach einer Verrundung einen anderen Koerper als vorher. Gemessen wird
 * deshalb der Rauminhalt beider gegeneinander, am echten Kern.
 */

let cad: OcctKernel;

beforeAll(async () => {
  const wasm = join(dirname(fileURLToPath(import.meta.resolve("occt-wasm"))), "occt-wasm.wasm");
  cad = await OcctKernel.init({ wasm });
}, 180000);

function knurl(overrides: Partial<WorkplaneShape> = {}): WorkplaneShape {
  return {
    id: "k",
    name: "Raendelung",
    kind: "knurl",
    color: "#7a8a99",
    x: 0,
    z: 0,
    elevation: 0,
    size: 20,
    width: 20,
    depth: 20,
    height: 15,
    rotation: 0,
    knurlPattern: "straight",
    knurlCount: 30,
    knurlDepth: 0.6,
    knurlChamfer: 0,
    ...overrides,
  } as WorkplaneShape;
}

/** Der Rauminhalt des gezeichneten Netzes, aus dem Dreieckshaufen selbst. */
function meshVolume(shape: WorkplaneShape) {
  const geometry = createKnurlGeometry({
    width: shape.width,
    height: shape.height,
    knurlPattern: shape.knurlPattern,
    knurlCount: shape.knurlCount,
    knurlDepth: shape.knurlDepth,
    knurlChamfer: shape.knurlChamfer,
  });
  const positions = geometry.getAttribute("position").array as Float32Array;
  let volume = 0;
  for (let index = 0; index < positions.length; index += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = Array.from(positions.slice(index, index + 9));
    volume += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  }
  geometry.dispose();
  return volume;
}

/** Der Rauminhalt einer three.js-Geometrie, aus ihrem Dreieckshaufen. */
function closedMeshVolume(geometry: { getAttribute: (name: string) => { array: ArrayLike<number> }; index: unknown; toNonIndexed: () => typeof geometry; dispose: () => void }) {
  const plain = geometry.index ? geometry.toNonIndexed() : geometry;
  const positions = plain.getAttribute("position").array;
  let volume = 0;
  for (let index = 0; index + 8 < positions.length; index += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = Array.from(positions).slice(index, index + 9) as number[];
    volume += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  }
  return volume;
}

function solidFor(shape: WorkplaneShape) {
  const part = cadModifierPrimitiveForProfileShape(shape);
  expect(part?.kind).toBe("profileExtrusion");
  if (part?.kind !== "profileExtrusion") throw new Error("kein Umriss");
  return buildProfileExtrusionSolid(cad, part);
}

describe("Die Raendelung als genauer Koerper", () => {
  /**
   * Der Kern baut aus 60 Ecken einen Koerper mit 62 Flaechen - 60 Flanken und
   * zwei Deckel - und 236 Dreiecken. Das Netz derselben Form hat 192. Der
   * genaue Koerper ist also nicht teurer, sondern bearbeitbar.
   */
  it("ist ein gueltiger Koerper aus wenigen Flaechen", () => {
    const solid = solidFor(knurl());
    expect(cad.isSolid(solid)).toBe(true);
    expect(cad.isValid(solid)).toBe(true);
    expect(cad.getSubShapes(solid, "face")).toHaveLength(62);
    expect(cad.tessellate(solid, { linearDeflection: 0.05, angularDeflection: 0.16 }).triangleCount).toBe(236);
  }, 300000);

  /**
   * Und er ist derselbe Koerper wie der gezeichnete: Beide sitzen auf den
   * Ecken aus `knurlCorners`, also muss ihr Rauminhalt bis auf Rundung
   * uebereinstimmen. Weicht das ab, ist der exakte Koerper eine andere Form
   * als die im Bild - und nach einer Verrundung springt die Ansicht.
   */
  it("hat denselben Rauminhalt wie das gezeichnete Netz", () => {
    const shape = knurl();
    const exact = cad.getVolume(solidFor(shape));
    expect(exact).toBeCloseTo(4421.55, 2);
    expect(exact).toBeCloseTo(meshVolume(shape), 3);
  }, 300000);

  it("und bei vielen Rillen auch", () => {
    const shape = knurl({ knurlCount: 78 });
    expect(cad.getVolume(solidFor(shape))).toBeCloseTo(meshVolume(shape), 3);
  }, 300000);

  /**
   * Der Grund fuer die ganze Sache: Eine Rillenkante laesst sich verrunden.
   * Auf einem Netz waere das gescheitert oder haette Unsinn gegeben.
   */
  it("laesst eine Rillenkante verrunden", () => {
    const solid = solidFor(knurl());
    const edges = cad.getSubShapes(solid, "edge");
    expect(edges.length).toBeGreaterThan(100);
    const filleted = cad.fillet(solid, [edges[0]], 0.15);
    expect(cad.isSolid(filleted)).toBe(true);
    expect(cad.getVolume(filleted)).toBeLessThan(cad.getVolume(solid));
  }, 300000);
});

describe("Die Fase an den Enden", () => {
  /**
   * Die Fase kommt als Verschnitt mit einem Fass, nicht als Fase auf den
   * Randkanten - genau so rechnet auch das Netz (`min(Umriss, Kegel)`). Der
   * Rauminhalt beider stimmt darum ueberein, bis auf die acht Stufen, mit
   * denen das Netz den Kegel annaehert.
   */
  it("schneidet beide Enden ab, wie das Netz es zeichnet", () => {
    const shape = knurl({ knurlChamfer: 0.5 });
    const solid = solidFor(shape);
    expect(cad.isValid(solid)).toBe(true);
    expect(cad.getSubShapes(solid, "solid")).toHaveLength(1);
    const exact = cad.getVolume(solid);
    expect(exact).toBeLessThan(cad.getVolume(solidFor(knurl())));
    expect(exact).toBeCloseTo(meshVolume(shape), 0);
  }, 300000);

  it("laesst die Enden ohne Fase scharf", () => {
    const part = cadModifierPrimitiveForProfileShape(knurl({ knurlChamfer: 0 }));
    expect(part?.kind === "profileExtrusion" && part.capChamfer).toBeUndefined();
  }, 300000);
});

describe("Wo es keinen genauen Koerper gibt", () => {
  /**
   * Die gekreuzte Raendelung bleibt ein Netz: Ihre Rillen laufen auf
   * Schraubenlinien, und was zwei gegeneinander verdrehte Scharen gemeinsam
   * haben, ist kein hochgezogener Umriss.
   */
  it("gibt null fuer die gekreuzte Raendelung", () => {
    expect(cadModifierPrimitiveForProfileShape(knurl({ knurlPattern: "diamond" }))).toBeNull();
  }, 300000);

  it("und null fuer eine andere Form", () => {
    expect(cadModifierPrimitiveForProfileShape(knurl({ kind: "cylinder" }))).toBeNull();
  }, 300000);

  it("lehnt einen Umriss mit zu wenigen Punkten ab", () => {
    expect(() => buildProfileExtrusionSolid(cad, { loop: [0, 0, 1, 0], height: 10 })).toThrow();
    expect(() => buildProfileExtrusionSolid(cad, { loop: [0, 0, 1, 0, 1, 1], height: 0 })).toThrow();
  }, 300000);
});

describe("Das Zahnrad als genauer Koerper", () => {
  const gear = (overrides: Partial<WorkplaneShape> = {}): WorkplaneShape => ({
    id: "g",
    name: "Zahnrad",
    kind: "gear",
    color: "#6f7f8d",
    x: 0,
    z: 0,
    elevation: 0,
    size: 28,
    width: 28,
    depth: 28,
    height: 6,
    rotation: 0,
    teeth: 12,
    gearType: "spur",
    gearProfile: "involute",
    gearPressureAngle: 20,
    gearBacklash: 0.2,
    centerHoleSize: 6,
    ...overrides,
  } as WorkplaneShape);

  /**
   * Der Grund fuer die ganze Sache: Auf einem Netz scheitert eine Verrundung.
   * Hier steht ein Koerper mit einer Flaeche je Flankenstueck - und einer
   * echten Bohrung, keinem Vieleck.
   */
  it("ist ein gueltiger Koerper mit runder Bohrung", () => {
    const solid = solidFor(gear());
    expect(cad.isSolid(solid)).toBe(true);
    expect(cad.isValid(solid)).toBe(true);
    // Die Bohrung ist ein Zylinder, nicht ein Kranz von Ebenen.
    const kinds = cad.getSubShapes(solid, "face").map((face) => cad.surfaceType(face));
    expect(kinds.filter((kind) => kind === "cylinder")).toHaveLength(1);
  }, 300000);

  /**
   * Und er hat den Rauminhalt, den das Netz zeichnet: Beide sitzen auf
   * demselben Umriss. Die Bohrung weicht ab, weil der Koerper sie rund
   * macht und das Netz als Vieleck - das sind Hundertstel eines Prozents.
   */
  it("trifft den Rauminhalt des gezeichneten Netzes", () => {
    const shape = gear();
    const exact = cad.getVolume(solidFor(shape));
    const mesh = closedMeshVolume(createGearGeometry({
      width: shape.width,
      depth: shape.depth,
      height: shape.height,
      teeth: shape.teeth,
      centerHoleSize: shape.centerHoleSize,
      gearType: shape.gearType,
      gearProfile: shape.gearProfile,
      gearPressureAngle: shape.gearPressureAngle,
      gearBacklash: shape.gearBacklash,
    }));
    expect(exact / mesh).toBeCloseTo(1, 3);
  }, 300000);

  /**
   * Eine Zahnkante verrunden - und zwar eine im Zahnfuss, die Material
   * **dazugibt**: Genau diese Rundung will man an einem gedruckten Zahnrad,
   * weil der Zahn dort bricht. Geprueft wird darum, dass sich der Rauminhalt
   * ueberhaupt aendert und der Koerper gueltig bleibt - nicht, dass er
   * kleiner wird.
   */
  it("laesst eine Zahnkante verrunden", () => {
    const solid = solidFor(gear());
    const before = cad.getVolume(solid);
    const edges = cad.getSubShapes(solid, "edge");
    const filleted = cad.fillet(solid, [edges[0]], 0.2);
    expect(cad.isSolid(filleted)).toBe(true);
    expect(Math.abs(cad.getVolume(filleted) - before)).toBeGreaterThan(1e-6);
  }, 300000);

  /**
   * Was nicht hochgezogen werden kann, bleibt ein Netz: ein Schraegrad
   * verdreht sich ueber die Hoehe, ein Kegelrad verjuengt sich, und gerade
   * Zaehne sind nicht nach Modul gebaut.
   */
  it("gibt null fuer Schraegrad, Kegelrad und gerade Zaehne", () => {
    expect(cadModifierPrimitiveForProfileShape(gear({ gearType: "helical" }))).toBeNull();
    expect(cadModifierPrimitiveForProfileShape(gear({ gearType: "bevel" }))).toBeNull();
    expect(cadModifierPrimitiveForProfileShape(gear({ gearProfile: "simple" }))).toBeNull();
    // Und fuer ein ungleich gezogenes Rad: das waere eine Ellipse mit Zaehnen.
    expect(cadModifierPrimitiveForProfileShape(gear({ depth: 34 }))).toBeNull();
  }, 300000);
});
