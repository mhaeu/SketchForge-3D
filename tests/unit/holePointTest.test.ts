import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { createHoleTester, HOLE_RESIDUAL_INSET, pointInsideCuboid, type HoleCuboid } from "@/lib/holePointTest";
import type { WorkplaneShape } from "@/types/sketchforge";

/**
 * Liegt dieser Punkt in dieser Aussparung?
 *
 * Zwei Dinge werden hier gemessen: dass die Antwort stimmt - auch fuer eine
 * gedrehte und eine runde Form -, und dass der teure Teil der Frage, der
 * Rahmen einer Gruppe, **einmal je Form** geholt wird und nicht einmal je
 * Punkt. Das Zweite war der Fehler, der das Gruppieren einfrieren liess.
 */

const shape = (overrides: Partial<WorkplaneShape> = {}): WorkplaneShape => ({
  id: "h",
  name: "Aussparung",
  kind: "box",
  color: "#6f7f8d",
  x: 0,
  z: 0,
  elevation: 0,
  size: 10,
  width: 10,
  depth: 10,
  height: 10,
  rotation: 0,
  hole: true,
  ...overrides,
} as WorkplaneShape);

const never: () => HoleCuboid = () => {
  throw new Error("Der Rahmen darf fuer einen Grundkoerper nicht geholt werden");
};

describe("Der Punkt in der Aussparung", () => {
  it("findet den Mittelpunkt eines Kastens drin und einen Punkt daneben draussen", () => {
    const tester = createHoleTester(never);
    const box = shape();
    expect(tester.inside([0, 5, 0], box)).toBe(true);
    expect(tester.inside([6, 5, 0], box)).toBe(false);
    expect(tester.inside([0, 11, 0], box)).toBe(false);
    // Genau auf der Wand gilt als drin - ein Fraeser, der die Wand beruehrt,
    // schneidet sie.
    expect(tester.inside([5, 5, 0], box)).toBe(true);
    // Streng gefragt nicht mehr.
    expect(tester.inside([5, 5, 0], box, true)).toBe(false);
    expect(tester.inside([4.9, 5, 0], box, true)).toBe(true);
  });

  /**
   * Eine runde Grundflaeche wird als Ellipse geprueft und nicht als ihr
   * Rahmen: Die Ecke des Rahmens liegt ausserhalb des Zylinders.
   */
  it("prueft einen Zylinder rund und nicht als Kasten", () => {
    const tester = createHoleTester(never);
    const cylinder = shape({ kind: "cylinder" });
    expect(tester.inside([0, 5, 0], cylinder)).toBe(true);
    expect(tester.inside([4.9, 5, 0], cylinder)).toBe(true);
    // Die Ecke des Rahmens - im Kasten drin, im Zylinder draussen.
    expect(tester.inside([4.9, 5, 4.9], shape())).toBe(true);
    expect(tester.inside([4.9, 5, 4.9], cylinder)).toBe(false);
  });

  /**
   * Gedreht wird nicht die Form, sondern der Punkt: Er kommt in das
   * Koordinatensystem der Form, dann genuegt der einfache Vergleich. Geprueft
   * an einem um 45 Grad gedrehten Kasten - seine Ecke zeigt dann dorthin, wo
   * ungedreht die Mitte einer Kante war.
   */
  it("dreht den Punkt in das System einer gedrehten Form", () => {
    const tester = createHoleTester(never);
    const turned = shape({ rotation: 45 });
    // Auf der Diagonale, 6 mm weit: ungedreht draussen, gedreht drinnen.
    const diagonal = 6 / Math.SQRT2;
    expect(tester.inside([6, 5, 0], shape())).toBe(false);
    expect(tester.inside([diagonal, 5, diagonal], turned)).toBe(false);
    expect(tester.inside([6, 5, 0], turned)).toBe(true);
  });

  /**
   * Eine liegende Bohrung: ihre Hoehe laeuft dann waagerecht. Gedreht wird um
   * die Mitte der Form - `elevation + height / 2`, hier also y = 25 -, darum
   * liegt die Achse der gekippten Bohrung dort und nicht auf ihrer
   * Standhoehe.
   */
  it("nimmt eine gekippte Form entlang ihrer eigenen Achse", () => {
    const tester = createHoleTester(never);
    const lying = shape({ kind: "cylinder", rotationX: 90, height: 30, width: 6, depth: 6, elevation: 10 });
    // Entlang der eigenen Achse, die nach dem Kippen in z laeuft.
    expect(tester.inside([0, 25, 0], lying)).toBe(true);
    expect(tester.inside([0, 25, 14], lying)).toBe(true);
    expect(tester.inside([0, 25, 16], lying)).toBe(false);
    // Quer dazu endet sie beim Halbmesser von 3 mm.
    expect(tester.inside([2.9, 25, 0], lying)).toBe(true);
    expect(tester.inside([4, 25, 0], lying)).toBe(false);
  });

  /**
   * Und der Fehler, um den es geht. Eine Gruppe oder ein eingelesenes Netz
   * hat keine Formel, also entscheidet ihr Rahmen - und den zu holen heisst,
   * das ganze Netz der Gruppe aus ihren Kindern neu zu bauen. Gefragt wird
   * einmal je Dreiecksschwerpunkt: Bei 30.000 Dreiecken und drei
   * Aussparungen sind das 90.000 Fragen und waren 90.000 Netze.
   *
   * Jetzt sind es drei - einer je Form, und zwar an der Form selbst gemerkt,
   * nicht an ihrer Kennung.
   */
  it("holt den Rahmen einer Gruppe einmal je Form, nicht einmal je Punkt", () => {
    const first = shape({ groupedShapes: [shape(), shape()] } as Partial<WorkplaneShape>);
    const second = shape({ x: 30, groupedShapes: [shape(), shape()] } as Partial<WorkplaneShape>);
    const third = shape({ importedMesh: { positions: [], baseWidth: 1, baseDepth: 1, baseHeight: 1, triangleCount: 0, sourceFormat: "json" } } as Partial<WorkplaneShape>);
    let calls = 0;
    const tester = createHoleTester((asked) => {
      calls += 1;
      return { minX: asked.x - 5, maxX: asked.x + 5, minY: 0, maxY: 10, minZ: -5, maxZ: 5 };
    });

    let inside = 0;
    for (let step = 0; step < 30000; step += 1) {
      const point: [number, number, number] = [(step % 60) - 10, 5, 0];
      [first, second, third].forEach((hole) => {
        if (tester.inside(point, hole)) inside += 1;
      });
    }
    expect(inside).toBeGreaterThan(0);
    expect(calls).toBe(3);
    expect(tester.boundsLookups()).toBe(3);
  });

  /**
   * Zwei Formen mit derselben Kennung, aber verschiedenen Objekten - ein
   * Fraeser mit Zugabe ist genau das - duerfen sich keinen Rahmen teilen.
   * Darum merkt der Pruefer an der Form und nicht an ihrer Kennung.
   */
  it("teilt den Rahmen nicht zwischen zwei Formen derselben Kennung", () => {
    const grouped = { groupedShapes: [shape(), shape()] } as Partial<WorkplaneShape>;
    const low = shape({ ...grouped, height: 10 });
    const tall = shape({ ...grouped, height: 40 });
    const tester = createHoleTester((asked) => ({ minX: -5, maxX: 5, minY: 0, maxY: asked.height, minZ: -5, maxZ: 5 }));
    expect(tester.inside([0, 30, 0], low)).toBe(false);
    expect(tester.inside([0, 30, 0], tall)).toBe(true);
    expect(tester.boundsLookups()).toBe(2);
  });

  /**
   * Was die Ersparnis wirklich wert ist, haengt daran, wie teuer der Rahmen
   * ist. Hier kostet er so viel wie ein neu gebautes Netz mittlerer Groesse
   * (ein Zylinder mit 96 Seiten und 64 Ringen, 12.288 Dreiecke), und es wird
   * 400 mal gefragt - so oft, wie ein kleines Netz Dreiecke hat.
   *
   * Gemessen: mit dem Pruefer 15 ms, ohne ihn 852 ms, also das
   * Siebenundfuenfzigfache. Und die 15 ms sind fast vollstaendig der **eine**
   * Bau; die 400 Fragen selbst kosten nichts. In der echten Anwendung stehen
   * dort 30.000 Dreiecke und drei Aussparungen mit Gewinden - dieselbe
   * Rechnung, nur mit 90.000 statt 400.
   */
  it("spart die Zeit, die das Netz der Gruppe kostet", () => {
    const grouped = shape({ groupedShapes: [shape(), shape()] } as Partial<WorkplaneShape>);
    const buildBounds = () => {
      const geometry = new THREE.CylinderGeometry(5, 5, 10, 96, 64);
      geometry.computeBoundingBox();
      const box = geometry.boundingBox!;
      return { minX: box.min.x, maxX: box.max.x, minY: box.min.y, maxY: box.max.y, minZ: box.min.z, maxZ: box.max.z };
    };

    const cached = createHoleTester(buildBounds);
    const withCache = Date.now();
    for (let step = 0; step < 400; step += 1) cached.inside([0, 0, 0], grouped);
    const cachedMs = Date.now() - withCache;

    const uncached = Date.now();
    for (let step = 0; step < 400; step += 1) createHoleTester(buildBounds).inside([0, 0, 0], grouped);
    const uncachedMs = Date.now() - uncached;

    // Die eigentliche Zusage ist die Zahl der Aufrufe; die Zeit ist ihre Folge.
    expect(cached.boundsLookups()).toBe(1);
    /*
     * Darum hier nur das Fuenffache als Grenze, obwohl gemessen das
     * Siebenundfuenfzigfache herauskam: Unter mehreren gleichzeitig laufenden
     * Pruefdateien schwankt eine Wanduhrmessung stark, und eine knappe Grenze
     * waere eine Pruefung, die manchmal ohne Grund rot wird. Ohne den Pruefer
     * waere das Verhaeltnis eins.
     */
    expect(cachedMs * 5).toBeLessThan(uncachedMs);
  }, 60000);
});

describe("Der Punkt im Rahmen", () => {
  it("nimmt den Rand mit und, streng gefragt, nicht", () => {
    const cuboid: HoleCuboid = { minX: -5, maxX: 5, minY: 0, maxY: 10, minZ: -5, maxZ: 5 };
    expect(pointInsideCuboid([5, 10, 5], cuboid)).toBe(true);
    expect(pointInsideCuboid([5.001, 10, 5], cuboid)).toBe(false);
    expect(pointInsideCuboid([5, 10, 5], cuboid, HOLE_RESIDUAL_INSET)).toBe(false);
    expect(pointInsideCuboid([4.9, 9.9, 4.9], cuboid, HOLE_RESIDUAL_INSET)).toBe(true);
  });

  /** Ein Rahmen, der duenner ist als der Abstand, hat kein Inneres. */
  it("hat kein Inneres, wenn der Rahmen duenner als der Abstand ist", () => {
    const thin: HoleCuboid = { minX: -5, maxX: 5, minY: 0, maxY: 0.01, minZ: -5, maxZ: 5 };
    expect(pointInsideCuboid([0, 0.005, 0], thin, HOLE_RESIDUAL_INSET)).toBe(false);
  });
});
