import * as THREE from "three";
import { shapeDepth, shapeWidth } from "@/lib/workplaneShapes";
import { CUTTER_END_PADDING } from "@/lib/cutterPadding";
import type { WorkplaneShape } from "@/types/sketchforge";

/**
 * holePointTest.ts
 *
 * Liegt dieser Punkt in dieser Aussparung?
 *
 * Danach wird beim Gruppieren und Verschneiden gefragt, und zwar oft: einmal
 * je Dreiecksschwerpunkt und je Randkante des Netzes, gegen jeden Fraeser.
 * Ein Koerper mit 30.000 Dreiecken und drei Aussparungen sind 90.000 Fragen.
 *
 * Fuer einen Grundkoerper ist die Antwort billig - hinein- statt
 * herausgerechnet: Der Punkt wird in das Koordinatensystem der Form gedreht,
 * dann genuegt ein Vergleich gegen Kasten oder Ellipse.
 *
 * Fuer eine **Gruppe** oder ein **eingelesenes Netz** gibt es keine Formel,
 * also entscheidet der Rahmen - und den zu holen heisst, das ganze Netz der
 * Gruppe aus ihren Kindern neu zu bauen, Gewinde eingeschlossen. Genau hier lag
 * der Fehler: Der Rahmen wurde je Punkt geholt, also das Netz je Punkt neu
 * gebaut. Drei Senkschrauben in einer Gruppe, mit einem eingelesenen Netz
 * gruppiert - und der Browser stand minutenlang.
 *
 * Darum fragt man hier nicht nach einer Funktion, sondern laesst sich einen
 * Pruefer geben: Er merkt sich den Rahmen je Form und holt ihn einmal, so oft
 * man auch fragt. Die Pruefung dazu zaehlt die Aufrufe.
 *
 * Nach Layerling 1.59.0 (#214, dort von @MiniCoop8 gemeldet).
 */

export type HoleCuboid = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
};

export type HolePoint = readonly [number, number, number];

/** Der Rahmen einer Form, aus ihrem Netz - teuer, darum gemerkt. */
export type HoleBoundsProvider = (shape: WorkplaneShape) => HoleCuboid;

export const HOLE_POINT_TOLERANCE = 0.0001;

/**
 * Wie weit ein Punkt im Inneren liegen muss, wenn streng gefragt wird. Es ist
 * dasselbe Mass wie die Zugabe des Fraesers, nur kleiner genommen: Was so
 * knapp an der Wand liegt, ist nicht "innen".
 */
export const HOLE_RESIDUAL_INSET = CUTTER_END_PADDING * 0.4;

const ROUND_FOOTPRINT_KINDS = new Set(["cylinder", "sphere", "halfSphere", "cone", "torus", "tube", "ring"]);

export function pointInsideCuboid(point: HolePoint, cuboid: HoleCuboid, inset = -HOLE_POINT_TOLERANCE) {
  const minX = cuboid.minX + inset;
  const maxX = cuboid.maxX - inset;
  const minY = cuboid.minY + inset;
  const maxY = cuboid.maxY - inset;
  const minZ = cuboid.minZ + inset;
  const maxZ = cuboid.maxZ - inset;
  return (
    minX <= maxX &&
    minY <= maxY &&
    minZ <= maxZ &&
    point[0] >= minX &&
    point[0] <= maxX &&
    point[1] >= minY &&
    point[1] <= maxY &&
    point[2] >= minZ &&
    point[2] <= maxZ
  );
}

export type HoleTester = {
  /**
   * `strictInterior` fragt nach dem Inneren mit Abstand zur Wand - fuer die
   * Frage, ob ein Dreieck wirklich weggeschnitten gehoert, und nicht nur die
   * Wand beruehrt.
   */
  inside: (point: HolePoint, shape: WorkplaneShape, strictInterior?: boolean) => boolean;
  /** Wie oft der Rahmen wirklich geholt wurde - fuer die Messung. */
  boundsLookups: () => number;
};

/**
 * Ein Pruefer fuer eine Reihe von Fragen: Er merkt sich den Rahmen je Form.
 *
 * Gemerkt wird an der Form selbst (`Map` auf das Objekt), nicht an ihrer
 * Kennung: Ein Fraeser mit Zugabe ist ein neues Objekt mit derselben Kennung,
 * und zwei verschiedene Objekte duerfen sich keinen Rahmen teilen. Darum lebt
 * ein Pruefer nur so lange wie die Schleife, die ihn gebraucht hat - ein
 * Zwischenspeicher ueber den ganzen Lauf wuerde veralten, sobald eine Form
 * gezogen wird.
 */
export function createHoleTester(boundsOf: HoleBoundsProvider): HoleTester {
  const bounds = new Map<WorkplaneShape, HoleCuboid>();
  let lookups = 0;

  const boundsFor = (shape: WorkplaneShape) => {
    const known = bounds.get(shape);
    if (known) return known;
    lookups += 1;
    const measured = boundsOf(shape);
    bounds.set(shape, measured);
    return measured;
  };

  const inside = (point: HolePoint, shape: WorkplaneShape, strictInterior = false) => {
    if (shape.importedMesh || shape.groupedShapes?.length) {
      return pointInsideCuboid(point, boundsFor(shape), strictInterior ? HOLE_RESIDUAL_INSET : -HOLE_POINT_TOLERANCE);
    }

    const centerY = shape.height / 2;
    const inverse = new THREE.Matrix4()
      .makeRotationFromEuler(
        new THREE.Euler(
          THREE.MathUtils.degToRad(shape.rotationX ?? 0),
          THREE.MathUtils.degToRad(shape.rotation),
          THREE.MathUtils.degToRad(shape.rotationZ ?? 0),
          "XYZ",
        ),
      )
      .invert();
    const local = new THREE.Vector3(point[0] - shape.x, point[1] - (shape.elevation ?? 0) - centerY, point[2] - shape.z).applyMatrix4(inverse);
    const localY = local.y + centerY;
    const halfWidth = shapeWidth(shape) / 2;
    const halfDepth = shapeDepth(shape) / 2;
    const round = ROUND_FOOTPRINT_KINDS.has(shape.kind);

    if (strictInterior) {
      const yInset = Math.min(HOLE_RESIDUAL_INSET, shape.height * 0.25);
      const xInset = Math.min(HOLE_RESIDUAL_INSET, halfWidth * 0.25);
      const zInset = Math.min(HOLE_RESIDUAL_INSET, halfDepth * 0.25);
      const innerHalfWidth = halfWidth - xInset;
      const innerHalfDepth = halfDepth - zInset;
      if (innerHalfWidth <= 0 || innerHalfDepth <= 0 || localY <= yInset || localY >= shape.height - yInset) {
        return false;
      }
      if (round) {
        const nx = local.x / Math.max(HOLE_POINT_TOLERANCE, innerHalfWidth);
        const nz = local.z / Math.max(HOLE_POINT_TOLERANCE, innerHalfDepth);
        return nx * nx + nz * nz < 1;
      }
      return Math.abs(local.x) < innerHalfWidth && Math.abs(local.z) < innerHalfDepth;
    }

    if (localY < -HOLE_POINT_TOLERANCE || localY > shape.height + HOLE_POINT_TOLERANCE) {
      return false;
    }
    if (round) {
      const nx = local.x / Math.max(HOLE_POINT_TOLERANCE, halfWidth);
      const nz = local.z / Math.max(HOLE_POINT_TOLERANCE, halfDepth);
      return nx * nx + nz * nz <= 1.0001;
    }
    return Math.abs(local.x) <= halfWidth + HOLE_POINT_TOLERANCE && Math.abs(local.z) <= halfDepth + HOLE_POINT_TOLERANCE;
  };

  return { inside, boundsLookups: () => lookups };
}
