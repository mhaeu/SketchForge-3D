import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { shapeRotationQuaternion } from "@/lib/geometryRotation";
import {
  boreCutShape,
  boreIsExact,
  cavityPlanForSelection,
  cutReachForShapes,
  flippedWorkplane,
  shapeHasBore,
  shapeWorldBounds,
  shapesCouldMeet,
  shapesInClickOrder,
  workplaneCutBox,
} from "@/lib/cutTools";
import type { PlacementWorkplane } from "@/lib/placementWorkplane";
import type { WorkplaneShape } from "@/types/sketchforge";

let counter = 0;
const createId = (prefix: string) => `${prefix}-${counter++}`;

/** Die Hauptarbeitsebene: waagerecht, Nullpunkt im Ursprung. */
const base: PlacementWorkplane = {
  origin: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 1, z: 0 },
  xAxis: { x: 1, y: 0, z: 0 },
  zAxis: { x: 0, y: 0, z: 1 },
};

/** Eine senkrechte Ebene, die auf zehn in der Breite steht. */
const upright: PlacementWorkplane = {
  origin: { x: 10, y: 0, z: 0 },
  normal: { x: 1, y: 0, z: 0 },
  xAxis: { x: 0, y: 0, z: 1 },
  zAxis: { x: 0, y: 1, z: 0 },
};

/** Die acht Ecken eines Koerpers, so wie ihn die Ansicht hinstellt. */
function corners(shape: WorkplaneShape) {
  const width = shape.width ?? shape.size;
  const depth = shape.depth ?? shape.size;
  const height = shape.height;
  const matrix = new THREE.Matrix4()
    .makeTranslation(shape.x, (shape.elevation ?? 0) + height / 2, shape.z)
    .multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(
      THREE.MathUtils.degToRad(shape.rotationX ?? 0),
      THREE.MathUtils.degToRad(shape.rotation ?? 0),
      THREE.MathUtils.degToRad(shape.rotationZ ?? 0),
      "XYZ",
    )))
    .multiply(new THREE.Matrix4().makeTranslation(0, -height / 2, 0));
  const points: THREE.Vector3[] = [];
  [-1, 1].forEach((sx) => [0, 1].forEach((sy) => [-1, 1].forEach((sz) => {
    points.push(new THREE.Vector3(sx * width / 2, sy * height, sz * depth / 2).applyMatrix4(matrix));
  })));
  return points;
}

/** Wie weit ein Punkt vor der Ebene liegt, laengs ihrer Normalen. */
function beyond(plane: PlacementWorkplane, point: THREE.Vector3) {
  return point.clone().sub(new THREE.Vector3(plane.origin.x, plane.origin.y, plane.origin.z))
    .dot(new THREE.Vector3(plane.normal.x, plane.normal.y, plane.normal.z));
}

describe("Der Schnittquader an der Arbeitsebene", () => {
  it("steht mit seiner Grundflaeche genau in der Ebene", () => {
    // Sonst bliebe entweder ein Span stehen oder es wuerde ueber die Ebene
    // hinaus geschnitten - beides sieht man erst am fertigen Teil.
    const box = workplaneCutBox(base, "above", 100, createId);
    const distances = corners(box).map((point) => beyond(base, point));
    expect(Math.min(...distances)).toBeCloseTo(0, 6);
    expect(Math.max(...distances)).toBeGreaterThan(50);
  });

  it("nimmt auf Wunsch die andere Seite", () => {
    const box = workplaneCutBox(base, "below", 100, createId);
    const distances = corners(box).map((point) => beyond(base, point));
    expect(Math.max(...distances)).toBeCloseTo(0, 6);
    expect(Math.min(...distances)).toBeLessThan(-50);
  });

  it("steht auch auf einer senkrechten Ebene richtig", () => {
    // Die Arbeitsebene kann auf jeder Flaeche liegen; der Schnitt muss ihr
    // folgen und nicht der Hauptebene.
    for (const side of ["above", "below"] as const) {
      const box = workplaneCutBox(upright, side, 80, createId);
      const plane = side === "above" ? upright : flippedWorkplane(upright);
      const distances = corners(box).map((point) => beyond(plane, point));
      expect(Math.min(...distances)).toBeCloseTo(0, 6);
      expect(Math.max(...distances)).toBeGreaterThan(40);
    }
  });

  it("deckt quer zur Ebene mehr ab als er tief ist", () => {
    // Quer muss er ueber alles hinausragen, was geschnitten wird - sonst
    // bleibt neben dem Schnitt ein Rest stehen.
    const box = workplaneCutBox(base, "above", 100, createId);
    expect(box.width).toBeGreaterThan(box.height);
    expect(box.depth).toBeGreaterThan(box.height);
  });

  it("ist eine Aussparung und kein Koerper", () => {
    expect(workplaneCutBox(base, "above", 100, createId).hole).toBe(true);
  });

  it("reicht ueber alles hinaus, was mitgeschnitten wird", () => {
    const far = { id: "a", kind: "box", x: 120, z: -40, elevation: 30, width: 20, depth: 20, height: 20, size: 20 } as WorkplaneShape;
    const reach = cutReachForShapes([far]);
    expect(reach).toBeGreaterThan(Math.hypot(120, 40, 40) + 20);
    // Und auch bei einem winzigen Koerper bleibt er brauchbar gross.
    expect(cutReachForShapes([{ ...far, x: 0, z: 0, elevation: 0, width: 1, depth: 1, height: 1, size: 1 } as WorkplaneShape])).toBeGreaterThanOrEqual(50);
  });
});

describe("Der Innenraum eines Rohrs", () => {
  const tube = {
    id: "t", name: "Rohr", kind: "tube", color: "#fff", x: 4, z: -3, elevation: 2,
    width: 20, depth: 20, height: 40, size: 20, rotation: 30, bevel: 3,
  } as WorkplaneShape;

  it("ist der Koerper, um zweimal die Wandstaerke schmaler", () => {
    const bore = boreCutShape(tube, createId)!;
    expect(bore.width).toBeCloseTo(14, 9);
    expect(bore.depth).toBeCloseTo(14, 9);
    expect(bore.height).toBeCloseTo(40, 9);
  });

  it("sitzt an derselben Stelle und ist genauso gedreht", () => {
    // Damit er auch in einem schraeg steckenden Rohr passt.
    const bore = boreCutShape(tube, createId)!;
    expect([bore.x, bore.z, bore.elevation]).toEqual([4, -3, 2]);
    expect(bore.rotation).toBe(30);
  });

  it("ist eine Aussparung und rund", () => {
    const bore = boreCutShape(tube, createId)!;
    expect(bore.hole).toBe(true);
    expect(bore.kind).toBe("ellipse");
  });

  it("nimmt dieselbe Begrenzung der Wandstaerke wie das Netz des Rohrs", () => {
    // Eine Wandstaerke dicker als der halbe Durchmesser gaebe sonst einen
    // Innenraum mit negativer Breite.
    const bore = boreCutShape({ ...tube, bevel: 40 } as WorkplaneShape, createId)!;
    expect(bore.width).toBeCloseTo(0.2, 9);
  });

  it("erkennt ein gedrehtes Rohr an seinem parametrischen Ursprung", () => {
    /*
     * Ein Rohr, das durch etwas hindurchgesteckt wird, ist fast immer
     * gedreht - und beim Drehen wird es in ein Netz gebacken: Seine Art
     * heisst danach "mesh", seine Masse sind die des Kastens um die gedrehte
     * Form, und seine Drehung steht auf null. Ohne den Ursprung blieb der
     * Knopf dann grau, obwohl beide Koerper markiert waren.
     */
    const baked = {
      ...tube,
      kind: "mesh",
      rotation: 0,
      rotationX: 0,
      rotationZ: 0,
      // Um neunzig Grad gekippt liegt das Rohr flach: vierzig breit, zwanzig hoch.
      width: 20,
      depth: 40,
      height: 20,
      elevation: 5,
      importedMesh: { positions: [], triangleCount: 0 },
      parametricSource: { kind: "tube", width: 20, depth: 20, height: 40, size: 20, rotation: 0, rotationX: 90, rotationZ: 0 },
    } as unknown as WorkplaneShape;
    expect(shapeHasBore(baked)).toBe(true);
    const bore = boreCutShape(baked, createId)!;
    // Masse und Drehung kommen aus dem Ursprung, nicht aus dem Kasten.
    expect(bore.width).toBeCloseTo(14, 9);
    expect(bore.depth).toBeCloseTo(14, 9);
    expect(bore.height).toBeCloseTo(40, 9);
    expect(bore.rotationX).toBe(90);
    // Und er sitzt mit seiner Mitte genau dort, wo das Rohr seine hat.
    expect(bore.x).toBe(baked.x);
    expect(bore.z).toBe(baked.z);
    expect((bore.elevation ?? 0) + bore.height / 2).toBeCloseTo((baked.elevation ?? 0) + baked.height / 2, 9);
  });

  /*
   * Ein gebackenes Rohr behaelt sein Netz, wie es beim Backen entstand. Wer es
   * danach an den Griffen laenger zieht, aendert nur die Masse am Koerper -
   * das Netz wird beim Zeichnen gestreckt, die Urform bleibt stehen. Der
   * Innenraum wurde bis hierher aus der Urform gebaut und war damit so gross
   * wie das Rohr *vor* dem Ziehen: Aus einem auf 120 mm gezogenen Rohr kam ein
   * 40 mm langes Werkzeug, und der Hohlraum war nur im mittleren Drittel
   * ausgeschnitten.
   */
  describe("an einem Rohr, das nach dem Backen gezogen wurde", () => {
    /** Genau das Rohr aus der gemeldeten Datei. */
    const stretched = {
      id: "t", name: "Rohr", kind: "mesh", color: "#fff",
      x: 22, z: -27, elevation: 15,
      size: 120, width: 120, depth: 18, height: 10,
      rotation: 0, rotationX: 0, rotationZ: 0, bevel: 4,
      parametricSource: { kind: "tube", width: 10, depth: 11, height: 40, size: 11, rotation: 0, rotationX: 0, rotationZ: 90 },
      importedMesh: { positions: [], triangleCount: 1152, baseWidth: 40, baseDepth: 11, baseHeight: 10 },
    } as unknown as WorkplaneShape;

    it("reicht ueber die ganze gezogene Laenge", () => {
      const bore = boreCutShape(stretched, createId)!;
      // Das Rohr liegt (rotationZ 90), seine Hoehe zeigt also entlang X - und
      // die Streckung dort ist 120/40, also dreifach.
      expect(bore.height).toBeCloseTo(120, 9);
      // Es steht von x = -38 bis x = 82; genauso weit muss das Werkzeug reichen.
      expect(bore.x - bore.height / 2).toBeCloseTo(-38, 9);
      expect(bore.x + bore.height / 2).toBeCloseTo(82, 9);
    });

    it("waechst auch quer mit, jede Richtung um ihren eigenen Faktor", () => {
      const bore = boreCutShape(stretched, createId)!;
      // Die Breite des Rohrs liegt nach der Drehung auf der Y-Achse der Welt,
      // und dort wurde nicht gezogen: 10 - 2*4 = 2 bleibt 2.
      expect(bore.width).toBeCloseTo(2, 9);
      // Seine Tiefe liegt auf der Z-Achse, dort ging es von 11 auf 18:
      // (11 - 2*4) * 18/11.
      expect(bore.depth).toBeCloseTo(3 * (18 / 11), 9);
    });

    it("bleibt mit seiner Mitte auf der Mitte des Rohrs", () => {
      const bore = boreCutShape(stretched, createId)!;
      expect(bore.x).toBe(22);
      expect(bore.z).toBe(-27);
      expect((bore.elevation ?? 0) + bore.height / 2).toBeCloseTo(15 + 10 / 2, 9);
    });

    it("nennt den Schnitt genau, solange das Rohr auf den Achsen steht", () => {
      expect(boreIsExact(stretched)).toBe(true);
      // Gleichmaessig gestreckt bleibt es ebenfalls genau, auch schraeg.
      const evenly = {
        ...stretched,
        width: 80, depth: 22, height: 20,
        parametricSource: { ...(stretched.parametricSource as object), rotationZ: 37 },
      } as unknown as WorkplaneShape;
      expect(boreIsExact(evenly)).toBe(true);
    });

    it("sagt es, wenn der Schnitt nur eine Naeherung sein kann", () => {
      // Schraeg gedreht und ungleich gezogen: Der Innenraum ist dann kein
      // rundes Rohr mehr, und das laesst sich mit unseren Feldern nicht
      // ausdruecken.
      const oblique = {
        ...stretched,
        parametricSource: { ...(stretched.parametricSource as object), rotationZ: 37 },
      } as unknown as WorkplaneShape;
      expect(boreIsExact(oblique)).toBe(false);
    });

    it("laesst ein ungezogenes Rohr unveraendert", () => {
      const untouched = { ...stretched, width: 40, depth: 11, height: 10 } as WorkplaneShape;
      const bore = boreCutShape(untouched, createId)!;
      expect(bore.height).toBeCloseTo(40, 9);
      expect(bore.width).toBeCloseTo(2, 9);
      expect(bore.depth).toBeCloseTo(3, 9);
    });
  });

  it("nimmt kein Ergebnis einer Verschneidung fuer ein Rohr", () => {
    // Was schon verrechnet wurde, traegt zwar noch seinen Ursprung, ist aber
    // nicht mehr das Rohr, das er beschreibt.
    const combined = {
      ...tube,
      kind: "mesh",
      groupedShapes: [{ id: "x" }],
      parametricSource: { kind: "tube", width: 20, depth: 20, height: 40, size: 20, rotation: 0, rotationX: 0, rotationZ: 0 },
    } as unknown as WorkplaneShape;
    expect(shapeHasBore(combined)).toBe(false);
  });

  it("gilt nur fuer Arten, deren Innenraum sich ausrechnen laesst", () => {
    expect(shapeHasBore(tube)).toBe(true);
    expect(shapeHasBore({ ...tube, kind: "ring" } as WorkplaneShape)).toBe(true);
    expect(shapeHasBore({ ...tube, kind: "cylinder" } as WorkplaneShape)).toBe(false);
    // Ein eingelesenes Netz hat keine Wandstaerke, die man lesen koennte.
    expect(shapeHasBore({ ...tube, kind: "mesh", importedMesh: { positions: [], triangleCount: 0 } } as unknown as WorkplaneShape)).toBe(false);
    expect(boreCutShape({ ...tube, kind: "cylinder" } as WorkplaneShape, createId)).toBeNull();
  });
});

describe("Die Reihenfolge der Auswahl", () => {
  const shapes = [{ id: "alt" }, { id: "neu" }, { id: "neuer" }];

  it("folgt dem Anklicken und nicht der Reihenfolge der Koerper", () => {
    /*
     * Die Liste der Koerper steht in der Reihenfolge, in der sie entstanden
     * sind. "Der zuletzt Ausgewaehlte" waere daraus gelesen der zuletzt
     * gebaute - und dann schnitt beim buendigen Abschneiden oft der falsche.
     */
    const chosen = shapes.filter((shape) => shape.id !== "neu");
    expect(shapesInClickOrder(chosen, ["neuer", "alt"]).map((shape) => shape.id)).toEqual(["neuer", "alt"]);
    expect(shapesInClickOrder(chosen, ["alt", "neuer"]).map((shape) => shape.id)).toEqual(["alt", "neuer"]);
  });

  it("laesst die Reihenfolge, wo das Anklicken nichts sagt", () => {
    // Ein aufgezogener Rahmen nennt keine Reihenfolge; dann bleibt es bei der
    // vorhandenen, statt zu wuerfeln.
    expect(shapesInClickOrder(shapes, []).map((shape) => shape.id)).toEqual(["alt", "neu", "neuer"]);
  });
});

/**
 * Gemeldet an einer Datei mit zwei sich kreuzenden Rohren: Sie liessen sich
 * nicht ineinander aushoehlen. Sortiert wurde nach "hohl" und "nicht hohl" -
 * sobald beide hohl waren, waren es zwei Werkzeuge und kein Ziel, und der
 * Knopf meldete nur, man solle einen hohlen Koerper und einen Koerper
 * waehlen.
 */
describe("Wer beim Aushoehlen was ist", () => {
  const body = (id: string, over: Partial<WorkplaneShape> = {}) => ({
    id, name: id, kind: "box", color: "#fff",
    x: 0, z: 0, elevation: 0, size: 20, width: 20, depth: 20, height: 20,
    rotation: 0, rotationX: 0, rotationZ: 0,
    ...over,
  } as WorkplaneShape);

  const hollowIds = new Set(["rohr", "rohr2"]);
  const isHollow = (shape: WorkplaneShape) => hollowIds.has(shape.id);
  const cuttable = () => true;
  const plan = (selection: WorkplaneShape[], scene: WorkplaneShape[] = selection) =>
    cavityPlanForSelection(selection, scene, isHollow, cuttable);

  it("nimmt den zuerst angeklickten hohlen Koerper als Werkzeug", () => {
    const first = plan([body("rohr"), body("rohr2")])!;
    expect(first.tool.id).toBe("rohr");
    expect(first.targets.map((shape) => shape.id)).toEqual(["rohr2"]);

    // Andersherum angeklickt kehrt sich auch die Rolle um.
    const other = plan([body("rohr2"), body("rohr")])!;
    expect(other.tool.id).toBe("rohr2");
    expect(other.targets.map((shape) => shape.id)).toEqual(["rohr"]);
  });

  it("uebergeht volle Koerper, die vorne stehen", () => {
    // Gesucht ist der zuerst angeklickte *hohle* Koerper - ein voller kann
    // den Hohlraum ohnehin nicht geben.
    const found = plan([body("quader"), body("rohr")])!;
    expect(found.tool.id).toBe("rohr");
    expect(found.targets.map((shape) => shape.id)).toEqual(["quader"]);
  });

  it("nimmt auch bei zwei hohlen den zuerst angeklickten von ihnen", () => {
    const found = plan([body("quader"), body("rohr"), body("rohr2")])!;
    expect(found.tool.id).toBe("rohr");
    // Und der zweite hohle ist Ziel wie jeder andere auch.
    expect(found.targets.map((shape) => shape.id)).toEqual(["quader", "rohr2"]);
  });

  it("gibt auf, wenn gar kein hohler Koerper dabei ist", () => {
    expect(plan([body("quader"), body("quader2")])).toBeNull();
  });

  it("nimmt alle uebrigen Ausgewaehlten als Ziel", () => {
    const found = plan([body("rohr"), body("a"), body("b")])!;
    expect(found.targets.map((shape) => shape.id)).toEqual(["a", "b"]);
  });

  describe("ein hohler Koerper allein", () => {
    // Ein Rohr, das flach durch die Szene laeuft.
    const tube = body("rohr", { x: 0, z: 0, elevation: 20, width: 100, depth: 16, height: 16 });

    it("raeumt seinen Hohlraum aus allem, was ihm im Weg steht", () => {
      const across = body("quer", { x: 30, z: 0, elevation: 0, width: 20, depth: 20, height: 40 });
      const found = plan([tube], [tube, across])!;
      expect(found.tool.id).toBe("rohr");
      expect(found.targets.map((shape) => shape.id)).toEqual(["quer"]);
    });

    it("laesst weit entfernte Koerper in Ruhe", () => {
      // Sie wuerden nichts verlieren, aber ihre Bauwerte gegen ein Netz
      // eintauschen - und das waere ein stiller Schaden.
      const far = body("fern", { x: 400, z: 400, elevation: 0 });
      const found = plan([tube], [tube, far])!;
      expect(found.targets).toEqual([]);
    });

    it("fragt nicht danach, ob das Ziel selbst hohl ist", () => {
      const other = body("rohr2", { x: 20, z: 0, elevation: 0, width: 16, depth: 16, height: 60 });
      const found = plan([tube], [tube, other])!;
      expect(found.targets.map((shape) => shape.id)).toEqual(["rohr2"]);
    });

    it("laesst aus, was gar nicht geschnitten werden darf", () => {
      const locked = body("fest", { x: 0, z: 0, elevation: 20 });
      const found = cavityPlanForSelection([tube], [tube, locked], isHollow, (shape) => shape.id !== "fest")!;
      expect(found.targets).toEqual([]);
    });
  });
});

describe("Der Kasten, in dem ein Koerper steht", () => {
  const upright = {
    id: "a", name: "a", kind: "box", color: "#fff",
    x: 10, z: -4, elevation: 2, size: 20, width: 20, depth: 6, height: 40,
    rotation: 0, rotationX: 0, rotationZ: 0,
  } as WorkplaneShape;

  it("steht an der Stelle des Koerpers und hat seine Masse", () => {
    const box = shapeWorldBounds(upright);
    expect([box.min.x, box.max.x]).toEqual([0, 20]);
    expect([box.min.y, box.max.y]).toEqual([2, 42]);
    expect([box.min.z, box.max.z]).toEqual([-7, -1]);
  });

  it("waechst mit, wenn der Koerper gedreht dasteht", () => {
    // Um neunzig Grad um X gekippt tauschen Hoehe und Tiefe die Rolle.
    const tipped = shapeWorldBounds({ ...upright, rotationX: 90 } as WorkplaneShape);
    expect(tipped.max.y - tipped.min.y).toBeCloseTo(6, 6);
    expect(tipped.max.z - tipped.min.z).toBeCloseTo(40, 6);
    // Und die Mitte bleibt, wo sie war - gedreht wird um sie herum.
    expect((tipped.max.y + tipped.min.y) / 2).toBeCloseTo(22, 6);
  });

  it("erkennt, ob zwei Koerper einander erreichen koennen", () => {
    // Der Koerper steht von x = 0 bis 20.
    const touching = { ...upright, x: 25 } as WorkplaneShape;
    const apart = { ...upright, x: 35 } as WorkplaneShape;
    expect(shapesCouldMeet(upright, touching)).toBe(true);
    expect(shapesCouldMeet(upright, apart)).toBe(false);
    // Nur die Kaesten zaehlen: Ein gedrehter Koerper reicht weiter.
    expect(shapesCouldMeet(upright, { ...apart, rotationZ: 90 } as WorkplaneShape)).toBe(true);
  });
});

/**
 * Gemeldet: Das ausgehoehlte Loch lag nicht im Rohr, sondern ein Stueck
 * daneben.
 *
 * Ueber einem gebackenen Rohr liegen zwei Drehungen: die, die beim Backen ins
 * Netz gewandert ist, und eine lebende am Koerper. Die zweite gab es frueher
 * kaum - Drehen backt ja -, seit der Teilbereich den Rahmen in die
 * Arbeitsebene dreht, aber schon. Das Werkzeug bekam nur die erste und lag
 * damit schief im Rohr.
 */
describe("Ein Rohr mit zwei Drehungen uebereinander", () => {
  /** Die Achse, unter der dieser Koerper in der Szene steht. */
  const axisOf = (turn: { rotation?: number; rotationX?: number; rotationZ?: number }) =>
    new THREE.Vector3(0, 1, 0).applyQuaternion(shapeRotationQuaternion({
      rotation: turn.rotation ?? 0, rotationX: turn.rotationX ?? 0, rotationZ: turn.rotationZ ?? 0,
    } as WorkplaneShape));

  const source = { kind: "tube", width: 20, depth: 20, height: 70, size: 20, rotation: 0, rotationX: 0, rotationZ: 73 };
  const baked = {
    id: "rohr", name: "Rohr", kind: "mesh", color: "#fff",
    x: 5, z: -3, elevation: 2, bevel: 4,
    size: 70, width: 70, depth: 20, height: 25,
    // Die lebende Drehung obendrauf.
    rotation: 0, rotationX: 0, rotationZ: 17,
    parametricSource: source,
    importedMesh: { positions: [], triangleCount: 0, baseWidth: 70, baseDepth: 20, baseHeight: 25 },
  } as unknown as WorkplaneShape;

  it("stellt das Werkzeug unter die Drehung, unter der das Rohr wirklich steht", () => {
    const bore = boreCutShape(baked, createId)!;
    // 73 Grad im Netz und 17 Grad am Koerper ergeben zusammen 90.
    const wanted = axisOf({ rotationZ: 73 + 17 });
    expect(axisOf(bore).angleTo(wanted)).toBeLessThan(1e-6);
  });

  it("nimmt nicht nur die Drehung aus dem Netz", () => {
    // Genau der gemeldete Fehler: Das Werkzeug lag um die lebende Drehung
    // verdreht im Rohr, und das Loch damit ein Stueck daneben.
    const bore = boreCutShape(baked, createId)!;
    const onlyBaked = axisOf({ rotationZ: 73 });
    expect(THREE.MathUtils.radToDeg(axisOf(bore).angleTo(onlyBaked))).toBeCloseTo(17, 4);
  });

  it("dreht ein ungebackenes Rohr nicht doppelt", () => {
    // Es traegt seine Drehung selbst; es gibt kein Netz, in dem noch eine
    // zweite steckte.
    const live = {
      id: "r", name: "Rohr", kind: "tube", color: "#fff",
      x: 0, z: 0, elevation: 0, size: 20, width: 20, depth: 20, height: 70, bevel: 4,
      rotation: 0, rotationX: 0, rotationZ: 40,
    } as unknown as WorkplaneShape;
    const bore = boreCutShape(live, createId)!;
    expect(axisOf(bore).angleTo(axisOf({ rotationZ: 40 }))).toBeLessThan(1e-6);
  });
});
