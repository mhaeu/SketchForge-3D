import * as THREE from "three";
import { placementWorkplaneQuaternion, type PlacementWorkplane } from "@/lib/placementWorkplane";
import { rotationPatchFromQuaternion } from "@/lib/geometryRotation";
import { shapeDepth, shapeWidth } from "@/lib/workplaneShapes";
import type { WorkplaneShape } from "@/types/sketchforge";

/**
 * Werkzeugkoerper zum Schneiden.
 *
 * Beide hier gebauten Koerper sind Aussparungen - sie werden nicht selbst
 * Teil des Ergebnisses, sondern nehmen Material weg. Damit laeuft das
 * Schneiden ueber denselben Weg wie das Gruppieren mit einer Aussparung, und
 * es gibt kein zweites Verfahren, das getrennt gepflegt werden muesste.
 */

/** Welche Seite der Arbeitsebene weggenommen wird. */
export type CutSide = "above" | "below";

function vector(point: { x: number; y: number; z: number }) {
  return new THREE.Vector3(point.x, point.y, point.z);
}

/** Die Arbeitsebene umgedreht - dieselbe Ebene, die andere Seite oben. */
export function flippedWorkplane(workplane: PlacementWorkplane): PlacementWorkplane {
  return {
    origin: workplane.origin,
    normal: { x: -workplane.normal.x, y: -workplane.normal.y, z: -workplane.normal.z },
    xAxis: workplane.xAxis,
    zAxis: { x: -workplane.zAxis.x, y: -workplane.zAxis.y, z: -workplane.zAxis.z },
  };
}

/**
 * Ein Quader, der alles auf einer Seite der Arbeitsebene abdeckt.
 *
 * Seine Grundflaeche liegt genau in der Ebene, und er steht auf der Seite,
 * die weg soll. Wie weit er reicht, sagt der Aufrufer - er muss ueber alles
 * hinausragen, was geschnitten werden soll, sonst bliebe ein Rest stehen.
 *
 * Ein Koerper sitzt mit seiner Mitte bei (x, Aufstellhoehe + halbe Hoehe, z)
 * und dreht sich um diese Mitte. Damit die Grundflaeche des Quaders in der
 * Ebene liegt, muss seine Mitte also um die halbe Hoehe laengs der Normalen
 * vor dem Nullpunkt der Ebene liegen.
 */
export function workplaneCutBox(
  workplane: PlacementWorkplane,
  side: CutSide,
  reach: number,
  createId: (prefix: string) => string,
): WorkplaneShape {
  const plane = side === "above" ? workplane : flippedWorkplane(workplane);
  const rotation = rotationPatchFromQuaternion(placementWorkplaneQuaternion(plane));
  const size = Math.max(1, reach);
  const centre = vector(plane.origin).addScaledVector(vector(plane.normal), size / 2);
  return {
    id: createId("cut-tool"),
    name: "cut",
    kind: "box",
    color: "#7d93a4",
    hole: true,
    x: centre.x,
    z: centre.z,
    elevation: centre.y - size / 2,
    size: size * 2,
    width: size * 2,
    depth: size * 2,
    height: size,
    radius: 0,
    ...rotation,
  } as WorkplaneShape;
}

/**
 * Wie weit ein Schnittwerkzeug reichen muss, um an allem vorbeizukommen.
 *
 * Die Diagonale des Kastens um alles Beteiligte, mit Zuschlag - lieber zu
 * gross, denn ein zu kurzes Werkzeug laesst einen Rest stehen, und ein zu
 * grosses kostet nur ein paar Dreiecke.
 */
export function cutReachForShapes(shapes: readonly WorkplaneShape[]): number {
  let reach = 0;
  for (const shape of shapes) {
    const extent = Math.hypot(shapeWidth(shape), shape.height, shapeDepth(shape));
    const distance = Math.hypot(shape.x, (shape.elevation ?? 0) + shape.height / 2, shape.z);
    reach = Math.max(reach, distance + extent);
  }
  return Math.max(50, reach * 3);
}

/** Die Masse und die Drehung des Rohrs, das hinter diesem Koerper steckt. */
type BoreSource = {
  width: number;
  depth: number;
  height: number;
  rotation: number;
  rotationX: number;
  rotationZ: number;
};

/**
 * Wo der Innenraum herkommt.
 *
 * Ein Rohr, das gedreht wurde - und gedreht wird es fast immer, sonst
 * steckte es nirgends durch -, ist danach ein Netz: Beim Drehen wird es
 * gebacken, seine Art heisst dann "mesh" und seine Masse sind die des
 * Kastens um die gedrehte Form. Was es vorher war, steht in seinem
 * parametrischen Ursprung, und von dort kommen Masse und Drehung. Die
 * Wandstaerke bleibt am Koerper selbst stehen, die ueberlebt das Backen.
 */
function boreSourceFor(shape: WorkplaneShape): BoreSource | null {
  if (shape.groupedShapes?.length) return null;
  if ((shape.kind === "tube" || shape.kind === "ring") && !shape.importedMesh) {
    return {
      width: shapeWidth(shape),
      depth: shapeDepth(shape),
      height: shape.height,
      rotation: shape.rotation ?? 0,
      rotationX: shape.rotationX ?? 0,
      rotationZ: shape.rotationZ ?? 0,
    };
  }
  const source = shape.parametricSource;
  if (!source || (source.kind !== "tube" && source.kind !== "ring")) return null;
  return {
    width: source.width,
    depth: source.depth,
    height: source.height,
    rotation: source.rotation,
    rotationX: source.rotationX,
    rotationZ: source.rotationZ,
  };
}

/** Arten, die einen Innenraum haben, den man ausrechnen kann. */
export function shapeHasBore(shape: WorkplaneShape) {
  return boreSourceFor(shape) !== null;
}

/**
 * Der Innenraum eines Rohrs oder Rings, als Aussparung.
 *
 * Die Wandstaerke steht am Koerper, und das Netz zieht davon nach innen ab -
 * der Innenraum ist also derselbe Koerper, nur um zweimal die Wandstaerke
 * schmaler. Er sitzt an derselben Stelle und ist genauso gedreht, damit er
 * auch in einem schraeg steckenden Rohr passt.
 */
export function boreCutShape(shape: WorkplaneShape, createId: (prefix: string) => string): WorkplaneShape | null {
  const source = boreSourceFor(shape);
  if (!source) return null;
  const thickness = shape.bevel ?? 4;
  // Dieselbe Begrenzung, die auch das Netz des Rohrs zieht.
  const safeThickness = Math.min(
    Math.max(0.1, thickness),
    Math.max(0.1, Math.min(source.width, source.depth) / 2 - 0.1),
  );
  const boreWidth = Math.max(0.2, source.width - safeThickness * 2);
  const boreDepth = Math.max(0.2, source.depth - safeThickness * 2);
  // Ein Koerper sitzt mit seiner Mitte bei (x, Aufstellhoehe + halbe Hoehe,
  // z) - beim gebackenen Rohr ist das die Mitte des Kastens um die gedrehte
  // Form, und die faellt beim Rohr mit seiner eigenen Mitte zusammen.
  const centreY = (shape.elevation ?? 0) + shape.height / 2;
  return {
    id: createId("bore-tool"),
    name: "bore",
    kind: "ellipse",
    color: "#7d93a4",
    hole: true,
    x: shape.x,
    z: shape.z,
    elevation: centreY - source.height / 2,
    size: Math.max(boreWidth, boreDepth),
    width: boreWidth,
    depth: boreDepth,
    height: source.height,
    rotation: source.rotation,
    rotationX: source.rotationX,
    rotationZ: source.rotationZ,
    sides: 96,
    bevel: 0,
    segments: 1,
  } as WorkplaneShape;
}
