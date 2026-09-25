import * as THREE from "three";
import { placementWorkplaneQuaternion, type PlacementWorkplane } from "@/lib/placementWorkplane";
import { rotationPatchFromQuaternion, shapeRotationQuaternion } from "@/lib/geometryRotation";
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
 * Wie stark das gebackene Netz angezeigt wird.
 *
 * Ein gebackener Koerper behaelt sein Netz, wie es beim Backen entstand; wer
 * ihn danach an den Griffen zieht, aendert nur die Masse am Koerper, und das
 * Netz wird beim Zeichnen entsprechend gestreckt. Die Urform in
 * `parametricSource` weiss davon nichts - sie haelt fest, wie gross der
 * Koerper **vor** dem Backen war.
 */
export function bakedMeshScale(shape: WorkplaneShape) {
  const mesh = shape.importedMesh;
  if (!mesh) return { x: 1, y: 1, z: 1 };
  // Ohne ein bekanntes Ausgangsmass laesst sich keine Streckung ausrechnen -
  // dann bleibt es beim unveraenderten Mass, statt eine Null oder ein NaN
  // durch die ganze Rechnung zu tragen.
  const factor = (now: number, base: number | undefined) => (
    Number.isFinite(base) && (base as number) > 0.001 && Number.isFinite(now) ? now / (base as number) : 1
  );
  return {
    x: factor(shapeWidth(shape), mesh.baseWidth),
    y: factor(shape.height, mesh.baseHeight),
    z: factor(shapeDepth(shape), mesh.baseDepth),
  };
}

/**
 * Dieselbe Streckung, aber gemessen entlang der eigenen Achsen des Rohrs.
 *
 * Die Streckung wirkt auf die Achsen der Welt, die Masse des Rohrs stehen in
 * seinem eigenen, gedrehten Rahmen. Gesucht ist also, wie lang ein Schritt
 * entlang einer Rohrachse nach dem Strecken ist - das ist die Laenge der
 * gestreckten Achse.
 *
 * Steht das Rohr auf den Achsen der Welt - der uebliche Fall, ein Rohr liegt
 * oder steht -, ist das genau der Faktor der jeweiligen Weltachse. Bei einer
 * schraegen Drehung mit ungleicher Streckung ist der Innenraum in Wahrheit
 * kein rundes Rohr mehr; dann ist dies die beste runde Naeherung, und
 * `boreScaleIsExact` sagt, dass es eine ist.
 */
export function boreAxisScale(source: BoreSource, scale: { x: number; y: number; z: number }) {
  const quaternion = shapeRotationQuaternion(source);
  const along = (x: number, y: number, z: number) => {
    const axis = new THREE.Vector3(x, y, z).applyQuaternion(quaternion);
    return Math.hypot(axis.x * scale.x, axis.y * scale.y, axis.z * scale.z);
  };
  return { width: along(1, 0, 0), height: along(0, 1, 0), depth: along(0, 0, 1) };
}

/**
 * Ob die Streckung sich ehrlich auf die Rohrachsen umrechnen laesst: entweder
 * ist sie in alle Richtungen gleich, oder das Rohr steht auf den Achsen der
 * Welt.
 */
export function boreScaleIsExact(source: BoreSource, scale: { x: number; y: number; z: number }) {
  const uniform = Math.abs(scale.x - scale.y) < 1e-6 && Math.abs(scale.y - scale.z) < 1e-6;
  if (uniform) return true;
  const quaternion = shapeRotationQuaternion(source);
  return [
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, 0, 1),
  ].every((axis) => {
    const turned = axis.applyQuaternion(quaternion);
    // Auf einer Weltachse stehen heisst: eine Zahl ist +-1, die anderen null.
    return [turned.x, turned.y, turned.z].filter((value) => Math.abs(value) > 1e-6).length === 1;
  });
}

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
  /*
   * Die Urform haelt fest, wie gross das Rohr vor dem Backen war. Wer es
   * danach an den Griffen laenger zieht, aendert nur die Masse am Koerper -
   * das Netz wird beim Zeichnen gestreckt, die Urform bleibt stehen. Ohne
   * diese Streckung waere der Innenraum so gross wie das *urspruengliche*
   * Rohr: Aus einem auf 120 mm gezogenen Rohr kaeme ein 40 mm langes
   * Bohrwerkzeug, und der Hohlraum waere nur im mittleren Drittel
   * ausgeschnitten.
   */
  const stretch = boreAxisScale(source, bakedMeshScale(shape));
  const boreWidth = Math.max(0.2, (source.width - safeThickness * 2) * stretch.width);
  const boreDepth = Math.max(0.2, (source.depth - safeThickness * 2) * stretch.depth);
  const boreHeight = Math.max(0.2, source.height * stretch.height);
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
    elevation: centreY - boreHeight / 2,
    size: Math.max(boreWidth, boreDepth),
    width: boreWidth,
    depth: boreDepth,
    height: boreHeight,
    rotation: source.rotation,
    rotationX: source.rotationX,
    rotationZ: source.rotationZ,
    sides: 96,
    bevel: 0,
    segments: 1,
  } as WorkplaneShape;
}

/**
 * Ob der Innenraum dieses Koerpers sich genau ausrechnen laesst - oder ob er
 * eine Naeherung waere, weil das Rohr schraeg steht und ungleich gestreckt
 * wurde. Dann ist der Innenraum in Wahrheit kein rundes Rohr mehr.
 */
export function boreIsExact(shape: WorkplaneShape) {
  const source = boreSourceFor(shape);
  return source ? boreScaleIsExact(source, bakedMeshScale(shape)) : true;
}

/**
 * Die Auswahl in der Reihenfolge, in der angeklickt wurde.
 *
 * Die Liste der Koerper steht in der Reihenfolge, in der sie entstanden
 * sind - "der zuletzt Ausgewaehlte" waere daraus gelesen der zuletzt
 * gebaute. Wo es darauf ankommt, welchen der Benutzer zuletzt gemeint hat,
 * muss die Reihenfolge aus den Kennungen der Auswahl kommen; nur die werden
 * beim Anklicken hinten angehaengt.
 */
export function shapesInClickOrder<T extends { id: string }>(shapes: readonly T[], selectedIds: readonly string[]): T[] {
  const clicked = new Map(selectedIds.map((id, index) => [id, index]));
  return [...shapes].sort((a, b) => (clicked.get(a.id) ?? -1) - (clicked.get(b.id) ?? -1));
}
