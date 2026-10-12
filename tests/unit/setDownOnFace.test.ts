import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { mateTurnDegrees } from "@/lib/mateFaces";
import { rotatedGeometryShapePatch, shapeRotationQuaternion } from "@/lib/geometryRotation";
import { horizontalPlacementWorkplane, placementWorkplaneFromSurface, type PlacementPoint } from "@/lib/placementWorkplane";
import { selectionCentre, setDownRotation, setDownTranslation, type SetDownTarget } from "@/lib/setDownOnFace";
import type { WorkplaneShape } from "@/types/sketchforge";

/**
 * Aufnehmen und absetzen, von der Zahl bis zum echten Netz.
 *
 * Die Rechnung steht hier fuer sich, und darunter geht dieselbe Kette durch,
 * die der Editor nach dem Klick geht: drehen um die Mitte der Auswahl, am
 * gedrehten Netz neu messen, verschieben. Gemessen wird am Ende an echten
 * three.js-Kaesten - zwischen Drehung und Verschiebung ist bei uns schon
 * mehrfach ein Vorzeichen verrutscht.
 */

const point = (x: number, y: number, z: number): PlacementPoint => ({ x, y, z });

const FLAT = horizontalPlacementWorkplane();

function box(overrides: Partial<WorkplaneShape> = {}): WorkplaneShape {
  return {
    id: overrides.id ?? "a",
    name: "Kasten",
    kind: "box",
    color: "#d41721",
    x: 0,
    z: 0,
    elevation: 0,
    size: 20,
    width: 20,
    depth: 20,
    height: 20,
    rotation: 0,
    ...overrides,
  } as WorkplaneShape;
}

/** Die Matrix, mit der das Ansichtsfenster diesen Koerper hinstellt. */
function matrixOf(shape: WorkplaneShape) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(shape.x, (shape.elevation ?? 0) + shape.height / 2, shape.z),
    shapeRotationQuaternion(shape),
    new THREE.Vector3(1, 1, 1),
  );
}

/** Die Eckpunkte des Koerpers in Weltmassen, ueber eine echte three.js-Geometrie. */
function worldCorners(shape: WorkplaneShape) {
  const geometry = new THREE.BoxGeometry(shape.width, shape.height, shape.depth);
  const position = geometry.getAttribute("position");
  const matrix = matrixOf(shape);
  const cursor = new THREE.Vector3();
  const corners: THREE.Vector3[] = [];
  for (let index = 0; index < position.count; index += 1) {
    corners.push(cursor.fromBufferAttribute(position, index).applyMatrix4(matrix).clone());
  }
  geometry.dispose();
  return corners;
}

function worldVertices(shapes: ReadonlyArray<WorkplaneShape>): PlacementPoint[] {
  return shapes.flatMap((shape) => worldCorners(shape).map((corner) => ({ x: corner.x, y: corner.y, z: corner.z })));
}

/** Wie weit die Auswahl laengs `direction` reicht. */
function reach(shapes: ReadonlyArray<WorkplaneShape>, direction: THREE.Vector3) {
  const values = worldVertices(shapes).map((vertex) => new THREE.Vector3(vertex.x, vertex.y, vertex.z).dot(direction));
  return { min: Math.min(...values), max: Math.max(...values) };
}

/** Genau die Schritte, die der Editor nach dem Klick tut. */
function setDown(shapes: ReadonlyArray<WorkplaneShape>, target: SetDownTarget, workplane = FLAT) {
  const rotation = setDownRotation(workplane, target.normal);
  expect(rotation).not.toBeNull();
  const pivot = selectionCentre(worldVertices(shapes));
  expect(pivot).not.toBeNull();
  const turn = mateTurnDegrees(rotation!);
  const turned = turn < 1e-6
    ? [...shapes]
    : shapes.map((shape) => ({
        ...shape,
        ...rotatedGeometryShapePatch(shape, rotation!, new THREE.Vector3(pivot!.x, pivot!.y, pivot!.z)),
      } as WorkplaneShape));
  // Erst drehen, dann messen: Wie tief die Auswahl danach liegt, steht nicht
  // in den Winkeln, sondern in ihrem gedrehten Netz.
  const translation = setDownTranslation(target, worldVertices(turned));
  expect(translation).not.toBeNull();
  const moved = turned.map((shape) => ({
    ...shape,
    x: shape.x + translation!.x,
    z: shape.z + translation!.z,
    elevation: (shape.elevation ?? 0) + translation!.y,
  } as WorkplaneShape));
  return { shapes: moved, turn };
}

describe("Die Drehung beim Absetzen", () => {
  it("dreht gar nicht auf einer Flaeche parallel zur Arbeitsebene", () => {
    expect(mateTurnDegrees(setDownRotation(FLAT, point(0, 1, 0))!)).toBeCloseTo(0, 9);
  });

  /**
   * Auf einer senkrechten Wand kippt die Auswahl um einen Viertelkreis: Was
   * unten war, zeigt danach in die Wand.
   */
  it("kippt auf einer senkrechten Wand um 90 Grad", () => {
    const rotation = setDownRotation(FLAT, point(1, 0, 0));
    expect(mateTurnDegrees(rotation!)).toBeCloseTo(90, 9);
    const down = new THREE.Vector3(0, -1, 0).applyQuaternion(rotation!);
    // Die Unterseite zeigt danach in die Flaeche hinein, also gegen ihre Normale.
    expect([down.x, down.y, down.z].map((value) => Number(value.toFixed(9)) + 0)).toEqual([-1, 0, 0]);
  });

  it("stellt die Auswahl unter eine nach unten schauende Flaeche", () => {
    const rotation = setDownRotation(FLAT, point(0, -1, 0));
    expect(mateTurnDegrees(rotation!)).toBeCloseTo(180, 6);
    const down = new THREE.Vector3(0, -1, 0).applyQuaternion(rotation!);
    expect(Number(down.y.toFixed(9))).toBe(1);
  });

  it("gibt null, wenn die Flaeche keine Normale hat", () => {
    expect(setDownRotation(FLAT, point(0, 0, 0))).toBeNull();
  });

  /**
   * Auf einer gedrehten Arbeitsebene ist "unten" nicht die Weltrichtung,
   * sondern die der Ebene - sonst kippte eine Auswahl, die schon richtig
   * liegt.
   */
  it("rechnet mit dem Unten der Arbeitsebene, nicht dem der Welt", () => {
    const tilted = placementWorkplaneFromSurface(point(0, 0, 0), point(1, 0, 0), point(0, 1, 0));
    expect(mateTurnDegrees(setDownRotation(tilted, point(1, 0, 0))!)).toBeCloseTo(0, 9);
    expect(mateTurnDegrees(setDownRotation(tilted, point(0, 1, 0))!)).toBeCloseTo(90, 9);
  });
});

describe("Die Mitte der Auswahl", () => {
  /**
   * Die Mitte des Kastens, nicht der Schwerpunkt der Punkte: Hier haengen
   * neun Punkte links und einer rechts, die Mitte liegt trotzdem in der
   * Mitte.
   */
  it("nimmt die Mitte des Kastens und nicht den Schwerpunkt", () => {
    const crowded = [...Array(9).keys()].map(() => point(0, 0, 0));
    expect(selectionCentre([...crowded, point(10, 20, 30)])).toEqual({ x: 5, y: 10, z: 15 });
  });

  it("gibt null, wenn nichts ausgewaehlt ist", () => {
    expect(selectionCentre([])).toBeNull();
  });
});

describe("Die Verschiebung beim Absetzen", () => {
  /**
   * Der Grundfall in Zahlen: ein Wuerfel von 20 um den Ursprung, abgesetzt
   * auf eine waagerechte Flaeche bei y = 30. Quer wandert seine Mitte auf den
   * angeklickten Punkt, laengs der Normale sinkt seine Unterseite auf die
   * Flaeche.
   */
  it("setzt die Mitte auf den Klick und die Unterseite auf die Flaeche", () => {
    const corners: PlacementPoint[] = [point(-10, -10, -10), point(10, 10, 10)];
    const translation = setDownTranslation({ point: point(40, 30, -15), normal: point(0, 1, 0) }, corners);
    expect(translation).toEqual({ x: 40, y: 40, z: -15 });
  });

  /**
   * Der tiefste Punkt von **allen** zaehlt, nicht der jedes Koerpers: Sonst
   * setzte jedes Stueck einer Baugruppe fuer sich ab und sie fiele
   * auseinander. Hier liegt ein zweiter Punkt 5 mm tiefer - er landet auf der
   * Flaeche, der erste bleibt 5 mm darueber.
   */
  it("laesst den tiefsten Punkt von allen aufsetzen", () => {
    const corners: PlacementPoint[] = [point(-10, 0, -10), point(10, 20, 10), point(0, -5, 0)];
    const translation = setDownTranslation({ point: point(0, 0, 0), normal: point(0, 1, 0) }, corners);
    expect(translation!.y).toBeCloseTo(5, 9);
  });

  it("gibt null ohne Normale und null ohne Punkte", () => {
    expect(setDownTranslation({ point: point(0, 0, 0), normal: point(0, 0, 0) }, [point(0, 0, 0)])).toBeNull();
    expect(setDownTranslation({ point: point(0, 0, 0), normal: point(0, 1, 0) }, [])).toBeNull();
  });
});

describe("Eine Auswahl auf eine Flaeche absetzen", () => {
  /**
   * Der haeufige Fall: ein Kasten auf die Oberseite eines anderen. Er dreht
   * sich nicht, steht mit seiner Mitte ueber dem Klick und mit seiner
   * Unterseite auf der Flaeche.
   */
  it("stellt einen Kasten auf eine waagerechte Flaeche, wo der Zeiger steht", () => {
    const moving = box({ id: "moving", x: -80, z: 40, elevation: 0 });
    const target: SetDownTarget = { point: point(12, 20, -7), normal: point(0, 1, 0) };
    const { shapes, turn } = setDown([moving], target);
    expect(turn).toBeCloseTo(0, 9);
    expect(shapes[0].x).toBeCloseTo(12, 9);
    expect(shapes[0].z).toBeCloseTo(-7, 9);
    expect(shapes[0].elevation).toBeCloseTo(20, 9);
    expect(reach(shapes, new THREE.Vector3(0, -1, 0)).max).toBeCloseTo(-20, 6);
  });

  /**
   * Und der Fall, um den es geht: eine um 30 Grad geneigte Flaeche. Danach
   * liegt die Unterseite flaechig darauf - vier Ecken genau auf der Ebene,
   * keine dahinter - und die Mitte steht ueber dem angeklickten Punkt.
   */
  it("legt die Unterseite flaechig auf eine schraege Flaeche", () => {
    const moving = box({ id: "moving", x: -40, elevation: 5, rotation: 25 });
    const radians = (30 * Math.PI) / 180;
    const normal = point(Math.sin(radians), Math.cos(radians), 0);
    const target: SetDownTarget = { point: point(10, 30, 15), normal };
    const { shapes, turn } = setDown([moving], target);
    expect(turn).toBeCloseTo(30, 6);

    const outward = new THREE.Vector3(normal.x, normal.y, normal.z);
    const plane = new THREE.Vector3(target.point.x, target.point.y, target.point.z).dot(outward);
    // Kein Punkt liegt hinter der Ebene, und der tiefste liegt genau darauf.
    expect(reach(shapes, outward.clone().negate()).max).toBeCloseTo(-plane, 6);
    /*
     * Flaechig heisst: Die vier Ecken der Unterseite liegen auf der Ebene -
     * zwoelf Eintraege, weil jede Ecke in drei Flaechen des Netzes steht.
     *
     * Bis auf 0,02 mm, und das ist keine Nachlaessigkeit, sondern die
     * gespeicherte Genauigkeit: Ein Koerper fuehrt seine drei Winkel auf ein
     * Zehntelgrad (`cleanRotationDegrees`), und auf der Diagonale dieses
     * Kastens von 28 mm sind drei so gerundete Winkel genau diese 0,016 mm.
     * Dasselbe gilt fuers Flachlegen und fuers Aneinanderlegen; unter einer
     * Schichthoehe liegt es weit.
     */
    const heights = worldVertices(shapes)
      .map((vertex) => new THREE.Vector3(vertex.x, vertex.y, vertex.z).dot(outward) - plane)
      .sort((one, other) => one - other);
    expect(heights[11]).toBeLessThan(0.02);
    // Und der dreizehnte Punkt ist schon die Oberseite: Es liegt die Unterseite auf.
    expect(heights[12]).toBeGreaterThan(19);

    // Und quer zur Flaeche steht die Mitte ueber dem Klick.
    const centre = selectionCentre(worldVertices(shapes))!;
    const offset = new THREE.Vector3(centre.x, centre.y, centre.z).sub(
      new THREE.Vector3(target.point.x, target.point.y, target.point.z),
    );
    expect(offset.clone().addScaledVector(outward, -offset.dot(outward)).length()).toBeCloseTo(0, 6);
  });

  /**
   * Mehrere Koerper wandern als Ganzes: Eine Drehung und eine Verschiebung
   * gelten fuer alle, also behalten sie ihre Lage zueinander - und der tiefere
   * der beiden ist der, der aufsetzt.
   */
  it("setzt eine Baugruppe als Ganzes ab", () => {
    const low = box({ id: "low", x: 0, z: 0, elevation: 0 });
    const high = box({ id: "high", x: 30, z: 0, elevation: 10, height: 10 });
    const before = new THREE.Vector3(high.x - low.x, (high.elevation ?? 0) - (low.elevation ?? 0), high.z - low.z);
    const { shapes } = setDown([low, high], { point: point(-25, 50, 60), normal: point(0, 1, 0) });
    const after = new THREE.Vector3(
      shapes[1].x - shapes[0].x,
      (shapes[1].elevation ?? 0) - (shapes[0].elevation ?? 0),
      shapes[1].z - shapes[0].z,
    );
    expect(after.distanceTo(before)).toBeCloseTo(0, 9);
    // Der tiefere setzt auf, der hoehere bleibt darueber.
    expect(shapes[0].elevation).toBeCloseTo(50, 9);
    expect(shapes[1].elevation).toBeCloseTo(60, 9);
    // Und die Mitte der beiden steht ueber dem Klick: x = -25 bei 30 mm Abstand.
    expect(shapes[0].x).toBeCloseTo(-40, 9);
    expect(shapes[1].x).toBeCloseTo(-10, 9);
  });

  /**
   * An die Unterseite eines Koerpers gehoert die Auswahl kopfueber: Die
   * Normale dort schaut nach unten, also schaut die Unterseite der Auswahl
   * nach oben und ihre Oberseite liegt an der Flaeche.
   */
  it("haengt die Auswahl unter eine nach unten schauende Flaeche", () => {
    const moving = box({ id: "moving" });
    const { shapes, turn } = setDown([moving], { point: point(0, 40, 0), normal: point(0, -1, 0) });
    expect(turn).toBeCloseTo(180, 6);
    expect(reach(shapes, new THREE.Vector3(0, 1, 0)).max).toBeCloseTo(40, 6);
    expect(reach(shapes, new THREE.Vector3(0, -1, 0)).max).toBeCloseTo(-20, 6);
  });
});
