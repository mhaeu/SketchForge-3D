import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  NO_SPLIT_ROTATION,
  SPLIT_AXIS_DISPLAY_ORDER,
  modelSplitPlane,
  snapSplitPositionToVertices,
  splitAxisFromLabel,
  splitAxisLabel,
  splitAxisNormal,
  splitOrientationForNormal,
  splitPlaneIntersectsPoints,
  splitRotationAxes,
  splitShapeFromWorldPositions,
} from "@/lib/modelSplit";
import type { AlignAxis, WorkplaneShape } from "@/types/sketchforge";

type Point3 = readonly [number, number, number];

/** Die acht Ecken eines Kastens um den Ursprung. */
function boxCorners(width: number, height: number, depth: number, centre: Point3 = [0, 0, 0]): Point3[] {
  const corners: Point3[] = [];
  [-1, 1].forEach((sx) => [-1, 1].forEach((sy) => [-1, 1].forEach((sz) => {
    corners.push([centre[0] + (sx * width) / 2, centre[1] + (sy * height) / 2, centre[2] + (sz * depth) / 2]);
  })));
  return corners;
}

function shape(overrides: Partial<WorkplaneShape> = {}): WorkplaneShape {
  return {
    id: "source",
    name: "Kasten",
    kind: "box",
    color: "#0098c7",
    x: 0,
    z: 0,
    size: 20,
    width: 20,
    depth: 20,
    height: 20,
    rotation: 0,
    ...overrides,
  };
}

describe("Wie die Achsen heissen", () => {
  /**
   * Die Szene hat Y oben, die Lagekarte nennt die Achsen anders. Wer im
   * Fenster "Z" waehlt, meint die Hochachse - in der Szene ist das y.
   */
  it("nennt die Hochachse der Szene Z", () => {
    expect(splitAxisLabel("y")).toBe("Z");
    expect(splitAxisLabel("z")).toBe("Y");
    expect(splitAxisLabel("x")).toBe("X");
  });

  it("liest dieselbe Benennung wieder zurueck", () => {
    (["x", "y", "z"] as AlignAxis[]).forEach((axis) => {
      expect(splitAxisFromLabel(splitAxisLabel(axis))).toBe(axis);
    });
    expect(splitAxisFromLabel(" z ")).toBe("y");
    expect(splitAxisFromLabel("Q")).toBeNull();
  });

  it("bietet die Achsen in der Reihenfolge der Lagekarte an", () => {
    expect(SPLIT_AXIS_DISPLAY_ORDER.map(splitAxisLabel)).toEqual(["X", "Y", "Z"]);
  });

  /** Gekippt wird um die beiden Achsen, die die Ebene nicht durchschneidet. */
  it("kippt um die beiden anderen Achsen", () => {
    (["x", "y", "z"] as AlignAxis[]).forEach((axis) => {
      const axes = splitRotationAxes(axis);
      expect(axes).not.toContain(axis);
      expect(new Set(axes).size).toBe(2);
    });
  });
});

describe("Die Schnittebene zu einer Auswahl", () => {
  const corners = boxCorners(20, 10, 6);

  it("steht ohne Wunsch in der Mitte", () => {
    const plane = modelSplitPlane(corners, "y");
    expect(plane?.normal).toEqual([0, 1, 0]);
    expect(plane?.position).toBeCloseTo(0, 9);
    expect(plane?.min).toBeCloseTo(-5, 9);
    expect(plane?.max).toBeCloseTo(5, 9);
  });

  it("haelt eine gewuenschte Lage in den Grenzen der Auswahl", () => {
    expect(modelSplitPlane(corners, "y", 3)?.position).toBeCloseTo(3, 9);
    expect(modelSplitPlane(corners, "y", 999)?.position).toBeCloseTo(5, 9);
    expect(modelSplitPlane(corners, "y", -999)?.position).toBeCloseTo(-5, 9);
  });

  it("misst die Grenzen laengs der Normale, nicht laengs der Achse", () => {
    // Um 45 Grad gekippt reicht der Kasten weiter: die halbe Diagonale.
    const plane = modelSplitPlane(corners, "y", undefined, [45, 0]);
    expect(plane?.max).toBeCloseTo(Math.SQRT1_2 * (10 / 2 + 6 / 2), 6);
  });

  it("legt den Ursprung auf die Ebene", () => {
    const plane = modelSplitPlane(corners, "y", 3);
    expect(plane).not.toBeNull();
    const origin = new THREE.Vector3(...plane!.origin);
    const normal = new THREE.Vector3(...plane!.normal);
    // Der Ursprung muss genau in der Ebene liegen: normale * ursprung = lage.
    expect(origin.dot(normal)).toBeCloseTo(plane!.position, 9);
  });

  it("macht die Ebene gross genug fuer die Auswahl", () => {
    const plane = modelSplitPlane(corners, "y");
    expect(plane!.size).toBeGreaterThan(Math.hypot(20, 10, 6));
  });

  it("gibt nichts her, wo keine Punkte sind", () => {
    expect(modelSplitPlane([], "y")).toBeNull();
    expect(modelSplitPlane([[Number.NaN, 0, 0]], "y")).toBeNull();
  });

  it("bleibt bei ungekippt genau auf der Achse", () => {
    (["x", "y", "z"] as AlignAxis[]).forEach((axis) => {
      expect(modelSplitPlane(corners, axis, undefined, NO_SPLIT_ROTATION)?.normal).toEqual(splitAxisNormal(axis));
    });
  });
});

describe("Die Ebene auf eine Flaeche legen", () => {
  /**
   * Eine Flaeche, die gerade zu den Achsen steht, darf gar keine Drehung
   * bekommen - sonst stuende die Ebene minimal schief auf ihr und schnitte
   * eine keilduenne Haut ab.
   */
  it("gibt einer geraden Flaeche keine Drehung", () => {
    expect(splitOrientationForNormal([0, 1, 0])).toEqual({ axis: "y", rotation: [0, 0] });
    expect(splitOrientationForNormal([0, -1, 0])).toEqual({ axis: "y", rotation: [0, 0] });
    expect(splitOrientationForNormal([1, 0, 0])).toEqual({ axis: "x", rotation: [0, 0] });
    expect(splitOrientationForNormal([0, 0, -1])).toEqual({ axis: "z", rotation: [0, 0] });
  });

  /**
   * Die tragende Eigenschaft: Was herauskommt, muss die Ebene wirklich
   * parallel zu dieser Flaeche stellen. Geprueft wird darum durch
   * `modelSplitPlane` hindurch - die Normale der fertigen Ebene gegen die
   * gewuenschte.
   */
  it("stellt die Ebene parallel zu jeder Flaeche", () => {
    const corners = boxCorners(20, 10, 6);
    const normals: Point3[] = [
      [0, 1, 0], [1, 0, 0], [0, 0, 1],
      [1, 1, 0], [0, 1, 1], [1, 0, 1], [1, 1, 1],
      [2, -5, 1], [-3, 1, -7], [0.3, 0.9, -0.2],
    ];
    normals.forEach((wanted) => {
      const laid = splitOrientationForNormal(wanted);
      expect(laid, JSON.stringify(wanted)).not.toBeNull();
      const plane = modelSplitPlane(corners, laid!.axis, undefined, laid!.rotation);
      const got = new THREE.Vector3(...plane!.normal).normalize();
      const expected = new THREE.Vector3(...wanted).normalize();
      // Gleich oder genau entgegengesetzt - fuer einen Schnitt dasselbe.
      expect(Math.abs(got.dot(expected)), JSON.stringify(wanted)).toBeCloseTo(1, 9);
    });
  });

  it("gibt nichts her fuer eine Normale ohne Richtung", () => {
    expect(splitOrientationForNormal([0, 0, 0])).toBeNull();
    expect(splitOrientationForNormal([Number.NaN, 1, 0])).toBeNull();
  });
});

describe("Ob die Ebene etwas zu schneiden hat", () => {
  const corners = boxCorners(20, 10, 6);

  it("kreuzt mitten durch", () => {
    expect(splitPlaneIntersectsPoints(corners, [0, 1, 0], 0)).toBe(true);
  });

  it("kreuzt nicht neben dem Koerper", () => {
    expect(splitPlaneIntersectsPoints(corners, [0, 1, 0], 50)).toBe(false);
  });

  /** Genau auf der Aussenflaeche gibt es nichts zu teilen. */
  it("kreuzt nicht genau auf einer Aussenflaeche", () => {
    expect(splitPlaneIntersectsPoints(corners, [0, 1, 0], 5)).toBe(false);
    expect(splitPlaneIntersectsPoints(corners, [0, 1, 0], -5)).toBe(false);
  });

  it("kreuzt knapp innerhalb", () => {
    expect(splitPlaneIntersectsPoints(corners, [0, 1, 0], 4.999)).toBe(true);
  });
});

describe("Die Ebene auf eine Ecke ziehen", () => {
  const corners = boxCorners(20, 10, 6);

  it("rastet auf eine Ecke, die nah genug liegt", () => {
    expect(snapSplitPositionToVertices(corners, [0, 1, 0], 4.9995)).toBeCloseTo(5, 9);
  });

  it("laesst eine Lage mitten im Koerper stehen", () => {
    expect(snapSplitPositionToVertices(corners, [0, 1, 0], 1.5)).toBeCloseTo(1.5, 9);
  });

  it("nimmt die naechste Ecke, wenn mehrere in Reichweite sind", () => {
    expect(snapSplitPositionToVertices([[0, 0, 0], [0, 1, 0]], [0, 1, 0], 0.9996, 0.01)).toBeCloseTo(1, 9);
  });
});

describe("Aus einer Haelfte wieder ein Koerper", () => {
  /** Ein Dreieck reicht nicht fuer einen Koerper, aber fuer die Rechnung. */
  const half = [
    0, 0, 0, 10, 0, 0, 10, 0, 4,
    0, 0, 0, 10, 0, 4, 0, 6, 4,
  ];

  it("nimmt Masse und Lage aus den Dreiecken", () => {
    const built = splitShapeFromWorldPositions(shape(), half, "half", "Kasten (Z+)");
    expect(built).toMatchObject({ id: "half", name: "Kasten (Z+)", kind: "mesh", width: 10, height: 6, depth: 4 });
    expect(built?.x).toBeCloseTo(5, 9);
    expect(built?.z).toBeCloseTo(2, 9);
    expect(built?.elevation).toBeCloseTo(0, 9);
  });

  it("legt die Dreiecke in den Rahmen der Form", () => {
    const built = splitShapeFromWorldPositions(shape(), half, "half", "Haelfte");
    const positions = built!.importedMesh!.positions;
    const xs = positions.filter((_unused, index) => index % 3 === 0);
    const ys = positions.filter((_unused, index) => index % 3 === 1);
    // Auf x mittig, Unterseite auf null.
    expect(Math.min(...xs)).toBeCloseTo(-5, 9);
    expect(Math.max(...xs)).toBeCloseTo(5, 9);
    expect(Math.min(...ys)).toBeCloseTo(0, 9);
  });

  it("behaelt Farbe und Sichtbarkeit der Vorlage", () => {
    const built = splitShapeFromWorldPositions(shape({ color: "#ff0000", hidden: true }), half, "half", "Haelfte");
    expect(built?.color).toBe("#ff0000");
    expect(built?.hidden).toBe(true);
  });

  /** Ein geteiltes Loch gibt zwei Loecher - sonst schneidet keine Haelfte mehr. */
  it("macht aus einem Loch wieder ein Loch", () => {
    expect(splitShapeFromWorldPositions(shape({ hole: true }), half, "half", "Haelfte")?.hole).toBe(true);
    expect(splitShapeFromWorldPositions(shape(), half, "half", "Haelfte")?.hole).toBeUndefined();
  });

  it("nimmt keine unbrauchbaren Dreiecke", () => {
    expect(splitShapeFromWorldPositions(shape(), [], "half", "Haelfte")).toBeNull();
    expect(splitShapeFromWorldPositions(shape(), [0, 0, 0, 1, 0, 0], "half", "Haelfte")).toBeNull();
    expect(splitShapeFromWorldPositions(shape(), [...half.slice(0, 8), Number.NaN], "half", "Haelfte")).toBeNull();
  });

  it("gibt die Dreieckszahl weiter", () => {
    expect(splitShapeFromWorldPositions(shape(), half, "half", "Haelfte")?.importedMesh?.triangleCount).toBe(2);
  });
});
