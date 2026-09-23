import { createLocalId } from "@/lib/localIds";
import { createThreadShapeFields } from "@/lib/threadShape";
import { threadFootprintPatch } from "@/lib/threadGeometry";
import type { WorkplaneShape } from "@/types/sketchforge";

export function normalizeDegrees(value: number) {
  return ((value % 360) + 360) % 360;
}

export function cleanRotationDegrees(value: number, precision = 1) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const normalized = normalizeDegrees(value);
  const rounded = Number(normalized.toFixed(precision));
  const zeroThreshold = precision <= 1 ? 0.5 : 0.05;
  if (rounded < zeroThreshold || rounded >= 360 - zeroThreshold || Object.is(rounded, -0)) {
    return 0;
  }
  return rounded;
}

export function cleanNearZero(value: number, epsilon = 0.005) {
  return Math.abs(value) < epsilon ? 0 : value;
}

export function shapeTransformShouldRemainEditable(shape: WorkplaneShape) {
  return shape.kind === "text" || Boolean(shape.groupedShapes?.length);
}

/**
 * Der Koerper, wie er vor dem Drehen war - fuer die Eigenschaften.
 *
 * Eine Drehung backt ihn in ein Netz, damit sein Rahmen ehrlich neu aufgesetzt
 * werden kann; seine Bauwerte bleiben dabei stehen, nur Art und Masse werden
 * ueberschrieben. Beides setzt `parametricSource` wieder zusammen, sodass der
 * Inspektor weiter Durchmesser und Steigung zeigt statt Breite und Tiefe eines
 * Netzes. Geaendert wird ueber denselben Weg: der Editor baut den Koerper neu
 * und dreht ihn wieder.
 */
export function shapeWithParametricSource(shape: WorkplaneShape): WorkplaneShape {
  const source = shape.parametricSource;
  if (!source) return shape;
  return {
    ...shape,
    kind: source.kind,
    width: source.width,
    depth: source.depth,
    height: source.height,
    size: source.size,
    taperTopWidth: source.taperTopWidth,
    taperTopDepth: source.taperTopDepth,
    taperBottomWidth: source.taperBottomWidth,
    taperBottomDepth: source.taperBottomDepth,
    extrudeTwist: source.extrudeTwist,
    extrudeTopOffsetX: source.extrudeTopOffsetX,
    extrudeTopOffsetZ: source.extrudeTopOffsetZ,
    cornerFillet: source.cornerFillet,
    topBottomFillet: source.topBottomFillet,
    roundedBoxQuality: source.roundedBoxQuality,
    taperHeightLeft: source.taperHeightLeft,
    taperHeightRight: source.taperHeightRight,
    taperHeightFront: source.taperHeightFront,
    taperHeightBack: source.taperHeightBack,
  };
}

/**
 * Unter welchem Winkel der Koerper wirklich steht. Nach dem Backen steht in
 * `rotation` eine Null - die Drehung sitzt ja in den Punkten des Netzes. Der
 * aufgelaufene Winkel steht in der Urform, und genau den zeigt das Drehfeld,
 * damit man ein Objekt auch wieder gerade stellen kann.
 */
export function shapeAccumulatedRotation(shape: WorkplaneShape) {
  const source = shape.parametricSource;
  return {
    rotation: source ? source.rotation : shape.rotation,
    rotationX: source ? source.rotationX : (shape.rotationX ?? 0),
    rotationZ: source ? source.rotationZ : (shape.rotationZ ?? 0),
  };
}

export function cloneWorkplaneShapeTreeWithFreshIds(shape: WorkplaneShape, suffix: string): WorkplaneShape {
  return {
    ...shape,
    id: createLocalId(`${shape.id}-${suffix}`),
    groupedShapes: shape.groupedShapes?.map((child) => cloneWorkplaneShapeTreeWithFreshIds(child, suffix)),
  };
}

export function shapeWidth(shape: WorkplaneShape) {
  return shape.width ?? shape.size;
}

export function shapeDepth(shape: WorkplaneShape) {
  return shape.depth ?? shape.size;
}

export function normalizeTaperScale(value?: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(3, Math.max(0.05, value as number));
}

function positiveTaperDimension(value: number | undefined, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0.01, value as number);
}

export function shapeTaperDimensions(shape: WorkplaneShape) {
  const width = shapeWidth(shape);
  const depth = shapeDepth(shape);
  return {
    topWidth: positiveTaperDimension(shape.taperTopWidth, width * normalizeTaperScale(shape.taperTopScale)),
    topDepth: positiveTaperDimension(shape.taperTopDepth, depth * normalizeTaperScale(shape.taperTopScale)),
    bottomWidth: positiveTaperDimension(shape.taperBottomWidth, width * normalizeTaperScale(shape.taperBottomScale)),
    bottomDepth: positiveTaperDimension(shape.taperBottomDepth, depth * normalizeTaperScale(shape.taperBottomScale)),
  };
}

/**
 * Arten, die eine Verjuengung ueberhaupt annehmen. Zahnrad, Gewinde und Feder
 * kennen sie nicht: ihre Form kommt aus ihren eigenen Werten, nicht aus Breite
 * und Tiefe der Grundflaeche.
 */
export function shapeSupportsTaper(kind: WorkplaneShape["kind"]) {
  return kind !== "gear" && kind !== "thread" && kind !== "spring" && kind !== "ruler" && kind !== "roundedBox";
}

/**
 * Reine Messwerkzeuge ohne druckbares Volumen - technisch eine `WorkplaneShape`,
 * aber ueberall dort ausgeschlossen, wo ein echter Koerper vorausgesetzt wird
 * (Gruppieren, Verschneiden, Kantenwerkzeug, Ausfuhr).
 */
export function isNonSolidShapeKind(kind: WorkplaneShape["kind"]) {
  return kind === "ruler";
}

/**
 * Bodies that a boolean, a group or an export may take. The reference point
 * marks a place, the ruler measures one - neither is material.
 */
export function isSolidShape(shape: Pick<WorkplaneShape, "kind">) {
  return shape.kind !== "reference" && !isNonSolidShapeKind(shape.kind);
}

export function solidShapesOnly<T extends Pick<WorkplaneShape, "kind">>(shapes: ReadonlyArray<T>): T[] {
  return shapes.filter(isSolidShape);
}

export function shapeHasTaper(shape: WorkplaneShape) {
  if (!shapeSupportsTaper(shape.kind)) return false;
  const width = shapeWidth(shape);
  const depth = shapeDepth(shape);
  const taper = shapeTaperDimensions(shape);
  return Math.abs(taper.topWidth - width) > 1e-6 || Math.abs(taper.topDepth - depth) > 1e-6 || Math.abs(taper.bottomWidth - width) > 1e-6 || Math.abs(taper.bottomDepth - depth) > 1e-6;
}

export function shapeOverallFootprintDimensions(shape: WorkplaneShape) {
  if (!shapeHasTaper(shape)) {
    return { width: shapeWidth(shape), depth: shapeDepth(shape) };
  }
  const taper = shapeTaperDimensions(shape);
  return {
    width: Math.max(taper.topWidth, taper.bottomWidth),
    depth: Math.max(taper.topDepth, taper.bottomDepth),
  };
}

export function shapeTaperScaleAt(shape: WorkplaneShape, normalizedHeight: number, axis: "width" | "depth" = "width") {
  if (!shapeSupportsTaper(shape.kind)) return 1;
  const taper = shapeTaperDimensions(shape);
  const base = axis === "width" ? shapeWidth(shape) : shapeDepth(shape);
  const bottom = axis === "width" ? taper.bottomWidth : taper.bottomDepth;
  const top = axis === "width" ? taper.topWidth : taper.topDepth;
  const t = Math.min(1, Math.max(0, Number.isFinite(normalizedHeight) ? normalizedHeight : 0));
  return (bottom + (top - bottom) * t) / Math.max(0.01, base);
}

export type ShapeSides<T = number> = { left: T; right: T; front: T; back: T };

/**
 * Die vier Kanten der Deckflaeche, in mm von der Mitte des Koerpers aus.
 *
 * Das ist dieselbe Verjuengung wie oben, nur anders angesehen. Breite und
 * Tiefe der Deckflaeche sagen, wie gross sie ist, und der Versatz, wo sie
 * sitzt; zusammen sagen sie, wo ihre vier Kanten liegen - und genau danach
 * fragt, wer eine einzelne Seite schraeg stellen will. Links ist die kleinere
 * Breite, vorn die kleinere Tiefe, wie ueberall sonst beim Ausrichten.
 *
 * Es kommt kein neues Feld dazu: Beide Ansichten beschreiben dieselbe Form,
 * und zwei Felder fuer dieselbe Sache wuerden frueher oder spaeter
 * auseinanderlaufen.
 */
export function shapeTopFaceEdges(shape: WorkplaneShape): ShapeSides {
  const taper = shapeTaperDimensions(shape);
  const offsetX = shape.extrudeTopOffsetX ?? 0;
  const offsetZ = shape.extrudeTopOffsetZ ?? 0;
  return {
    left: offsetX - taper.topWidth / 2,
    right: offsetX + taper.topWidth / 2,
    front: offsetZ - taper.topDepth / 2,
    back: offsetZ + taper.topDepth / 2,
  };
}

/**
 * Eine einzelne Kante der Deckflaeche verschieben. Die Gegenkante bleibt
 * stehen - das ist der Sinn der Sache: eine Seite schraeg stellen, ohne die
 * andere anzufassen.
 */
export function shapeTopFaceEdgePatch(shape: WorkplaneShape, requested: Partial<ShapeSides>): Partial<WorkplaneShape> {
  if (!shapeSupportsTaper(shape.kind)) return {};
  const edges = { ...shapeTopFaceEdges(shape), ...requested };
  // Die Kanten duerfen sich nicht ueberholen, und der Versatz hat seine
  // eigene Grenze - die Deckflaeche bleibt in ihr.
  const span = (low: number, high: number, offsetLimit: number) => {
    const size = Math.max(0.01, high - low);
    const centre = Math.min(offsetLimit, Math.max(-offsetLimit, (low + high) / 2));
    return { size, centre };
  };
  const horizontal = span(Math.min(edges.left, edges.right), Math.max(edges.left, edges.right), EXTRUDE_OFFSET_MAX);
  const vertical = span(Math.min(edges.front, edges.back), Math.max(edges.front, edges.back), EXTRUDE_OFFSET_MAX);
  const taper = shapeTaperDimensions(shape);
  return {
    taperTopWidth: horizontal.size,
    taperTopDepth: vertical.size,
    taperBottomWidth: taper.bottomWidth,
    taperBottomDepth: taper.bottomDepth,
    taperTopScale: undefined,
    extrudeTopOffsetX: horizontal.centre,
    extrudeTopOffsetZ: vertical.centre,
  };
}

/**
 * Der Anteil der Hoehe, den der Koerper an jeder seiner vier Seiten noch
 * stehen laesst. Abgesenkt wird nur - die Hoehe des Koerpers bleibt seine
 * Hoehe, und die Seiten liegen darunter.
 */
export function shapeSideHeightFactors(shape: WorkplaneShape): ShapeSides {
  const side = (value: number | undefined) => Number.isFinite(value)
    ? Math.min(1, Math.max(0, value as number))
    : 1;
  return {
    left: side(shape.taperHeightLeft),
    right: side(shape.taperHeightRight),
    front: side(shape.taperHeightFront),
    back: side(shape.taperHeightBack),
  };
}

/** Dieselben vier Werte in Millimetern - so stehen sie im Merkmalsfeld. */
export function shapeSideHeights(shape: WorkplaneShape): ShapeSides {
  const height = Math.max(0.01, shape.height);
  const factors = shapeSideHeightFactors(shape);
  return {
    left: factors.left * height,
    right: factors.right * height,
    front: factors.front * height,
    back: factors.back * height,
  };
}

export function shapeHasSideHeights(shape: WorkplaneShape) {
  if (!shapeSupportsTaper(shape.kind)) return false;
  const factors = shapeSideHeightFactors(shape);
  return Math.abs(factors.left - 1) > 1e-9
    || Math.abs(factors.right - 1) > 1e-9
    || Math.abs(factors.front - 1) > 1e-9
    || Math.abs(factors.back - 1) > 1e-9;
}

/**
 * Wie hoch der Koerper ueber der Stelle (x, z) seiner Grundflaeche steht, als
 * Anteil seiner vollen Hoehe.
 *
 * Quer und laengs wird jeweils zwischen den beiden Seiten geradlinig
 * ueberblendet, und beide Neigungen werden zusammengezaehlt: Steht nur eine
 * Seite tiefer, entsteht eine schiefe Ebene; stehen zwei gegenueberliegende
 * tiefer, ein Dach. Die volle Hoehe kommt einmal heraus, wenn alle vier
 * Seiten sie haben.
 */
export function shapeSideHeightScaleAtShare(shape: WorkplaneShape, acrossWidth: number, acrossDepth: number) {
  if (!shapeHasSideHeights(shape)) return 1;
  const factors = shapeSideHeightFactors(shape);
  const clamp01 = (value: number) => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
  const u = clamp01(acrossWidth);
  const v = clamp01(acrossDepth);
  const alongWidth = factors.left + (factors.right - factors.left) * u;
  const alongDepth = factors.front + (factors.back - factors.front) * v;
  return Math.max(0, alongWidth + alongDepth - 1);
}

/**
 * Dasselbe, aber nach Millimetern gefragt - x und z zaehlen von der Mitte der
 * Grundflaeche aus. Nur dort brauchbar, wo die Punkte wirklich in
 * Millimetern stehen; ein Netz, das erst am Objekt auf seine Groesse gezogen
 * wird, fragt ueber den Anteil.
 */
export function shapeSideHeightScaleAt(shape: WorkplaneShape, x: number, z: number) {
  return shapeSideHeightScaleAtShare(
    shape,
    x / Math.max(1e-6, shapeWidth(shape)) + 0.5,
    z / Math.max(1e-6, shapeDepth(shape)) + 0.5,
  );
}

/** Setzen - in Millimetern, wie im Merkmalsfeld, abgelegt als Anteil. */
export function shapeSideHeightPatch(shape: WorkplaneShape, requested: Partial<ShapeSides>): Partial<WorkplaneShape> {
  if (!shapeSupportsTaper(shape.kind)) return {};
  const height = Math.max(0.01, shape.height);
  const share = (value: number) => Math.min(1, Math.max(0, value / height));
  const patch: Partial<WorkplaneShape> = {};
  if (requested.left !== undefined) patch.taperHeightLeft = share(requested.left);
  if (requested.right !== undefined) patch.taperHeightRight = share(requested.right);
  if (requested.front !== undefined) patch.taperHeightFront = share(requested.front);
  if (requested.back !== undefined) patch.taperHeightBack = share(requested.back);
  return patch;
}

const DEGREES_TO_RADIANS = Math.PI / 180;
const EXTRUDE_TWIST_MAX = 720;
const EXTRUDE_OFFSET_MAX = 80;

/**
 * Drall und Versatz gelten an denselben Koerpern wie die Verjuengung: Das
 * Zahnprofil eines Rades, die Wendel eines Gewindes, die Windung einer Feder,
 * die eigene Deckflaeche der Pyramide und die aufgedruckte Teilung des Lineals
 * haben alle ihr eigenes "oben", mit dem sich das hier schlagen wuerde.
 */
export function shapeSupportsExtrudeDeform(kind: WorkplaneShape["kind"]) {
  return shapeSupportsTaper(kind);
}

export function shapeHasExtrudeDeform(shape: WorkplaneShape) {
  if (!shapeSupportsExtrudeDeform(shape.kind)) return false;
  return Math.abs(shape.extrudeTwist ?? 0) > 1e-6
    || Math.abs(shape.extrudeTopOffsetX ?? 0) > 1e-6
    || Math.abs(shape.extrudeTopOffsetZ ?? 0) > 1e-6;
}

/**
 * Beide Verformungen brauchen denselben Umbau Punkt fuer Punkt - wer nur
 * wissen will, ob er sich die Muehe machen muss, fragt einmal hier.
 */
export function shapeHasShapeDeform(shape: WorkplaneShape) {
  return shapeHasTaper(shape) || shapeHasExtrudeDeform(shape) || shapeHasSideHeights(shape);
}

/**
 * Drall und Versatz wachsen von null an der Grundflaeche bis zum vollen Mass
 * an der Deckflaeche, genau wie Breite und Tiefe der Verjuengung - ein Punkt
 * auf halber Hoehe dreht und schiebt sich also um die Haelfte.
 */
export function shapeExtrudeDeformAt(shape: WorkplaneShape, normalizedHeight: number) {
  const t = Math.min(1, Math.max(0, Number.isFinite(normalizedHeight) ? normalizedHeight : 0));
  return {
    twistRadians: DEGREES_TO_RADIANS * (shape.extrudeTwist ?? 0) * t,
    offsetX: (shape.extrudeTopOffsetX ?? 0) * t,
    offsetZ: (shape.extrudeTopOffsetZ ?? 0) * t,
  };
}

/**
 * Setzen, wie es das Merkmalsfeld tut - dieselben Grenzen wie dessen drei
 * Schieberegler. Nach dem Vorbild von `shapeTaperPatch`: Drall und Versatz
 * gehoeren dem einzelnen Koerper und stehen in keiner Formvorgabe.
 */
export function shapeExtrudeDeformPatch(
  shape: WorkplaneShape,
  requested: { twist?: number; offsetX?: number; offsetZ?: number },
): Partial<WorkplaneShape> {
  if (!shapeSupportsExtrudeDeform(shape.kind)) return {};
  const patch: Partial<WorkplaneShape> = {};
  const limit = (value: number, bound: number) => Math.min(bound, Math.max(-bound, value));
  if (requested.twist !== undefined) patch.extrudeTwist = limit(requested.twist, EXTRUDE_TWIST_MAX);
  if (requested.offsetX !== undefined) patch.extrudeTopOffsetX = limit(requested.offsetX, EXTRUDE_OFFSET_MAX);
  if (requested.offsetZ !== undefined) patch.extrudeTopOffsetZ = limit(requested.offsetZ, EXTRUDE_OFFSET_MAX);
  return patch;
}

export function meshYawDegrees(shape: WorkplaneShape) {
  const isRoundPrimitive = !shape.importedMesh && (shape.kind === "cylinder" || shape.kind === "ellipse" || shape.kind === "cone");
  const isCircular = Math.abs(shapeWidth(shape) - shapeDepth(shape)) < 0.0005;
  if (!isRoundPrimitive || !isCircular) {
    return shape.rotation;
  }

  // A tessellated circular primitive is only invariant by one whole side step.
  // Preserve the remaining yaw so low-sided cylinders (for example a triangular
  // prism) are baked and used in booleans at the same angle shown in the viewport.
  const sides = Math.max(3, Math.round(shape.sides ?? 96));
  const sideStep = 360 / sides;
  const normalized = normalizeDegrees(shape.rotation);
  const equivalentYaw = normalized - Math.round(normalized / sideStep) * sideStep;
  return Math.abs(equivalentYaw) < 1e-9 ? 0 : equivalentYaw;
}

function edgeTreatmentPreserveZone(shape: WorkplaneShape): number {
  const own = Math.max(...(shape.edgeTreatments ?? []).map((feature) => feature.amount), 0);
  const child = Math.max(...(shape.groupedShapes ?? []).map(edgeTreatmentPreserveZone), 0);
  return Math.max(own, child);
}

export function preservesEdgeTreatmentSize(shape: WorkplaneShape) {
  return shape.edgeResizeMode === "preserve" && Boolean(shape.importedMesh && edgeTreatmentPreserveZone(shape) > 0);
}

function edgePreservedCoordinate(value: number, baseSize: number, targetSize: number, centered: boolean, requestedZone: number) {
  const oldMin = centered ? -baseSize / 2 : 0;
  const oldMax = oldMin + baseSize;
  const newMin = centered ? -targetSize / 2 : 0;
  const zone = Math.max(0, Math.min(requestedZone, baseSize / 2, targetSize / 2));
  if (zone <= 1e-6 || Math.abs(baseSize - targetSize) <= 1e-9) {
    return newMin + (value - oldMin) * targetSize / Math.max(0.001, baseSize);
  }
  const distanceFromMin = value - oldMin;
  const distanceFromMax = oldMax - value;
  if (distanceFromMin <= zone) return newMin + distanceFromMin;
  if (distanceFromMax <= zone) return newMin + targetSize - distanceFromMax;
  const oldInterior = Math.max(1e-6, baseSize - zone * 2);
  const newInterior = Math.max(0, targetSize - zone * 2);
  return newMin + zone + (distanceFromMin - zone) * newInterior / oldInterior;
}

export function resizedImportedCoordinates(shape: WorkplaneShape, sourcePositions: number[]) {
  const mesh = shape.importedMesh;
  if (!mesh) return [];
  const width = shapeWidth(shape);
  const depth = shapeDepth(shape);
  const height = shape.height;
  const preserve = preservesEdgeTreatmentSize(shape);
  const zone = preserve ? edgeTreatmentPreserveZone(shape) : 0;
  const positions = new Array<number>(sourcePositions.length);
  for (let index = 0; index + 2 < sourcePositions.length; index += 3) {
    if (preserve) {
      positions[index] = edgePreservedCoordinate(sourcePositions[index], mesh.baseWidth, width, true, zone);
      positions[index + 1] = edgePreservedCoordinate(sourcePositions[index + 1], mesh.baseHeight, height, false, zone);
      positions[index + 2] = edgePreservedCoordinate(sourcePositions[index + 2], mesh.baseDepth, depth, true, zone);
    } else {
      positions[index] = sourcePositions[index] * width / Math.max(0.001, mesh.baseWidth);
      positions[index + 1] = sourcePositions[index + 1] * height / Math.max(0.001, mesh.baseHeight);
      positions[index + 2] = sourcePositions[index + 2] * depth / Math.max(0.001, mesh.baseDepth);
    }
  }
  return positions;
}

export function resizedImportedMeshPositions(shape: WorkplaneShape) {
  return shape.importedMesh ? resizedImportedCoordinates(shape, shape.importedMesh.positions) : [];
}

/**
 * True when the shape's width/depth describe a *diameter* rather than an edge
 * length. An edge treatment on such a shape is bounded by the radius: a
 * chamfer wider than that would have to cut past the axis, which OCCT still
 * reports as a valid solid while quietly producing nonsense.
 */
export function shapeFootprintIsRadial(shape: Pick<WorkplaneShape, "kind">) {
  return shape.kind === "cylinder"
    || shape.kind === "ellipse"
    || shape.kind === "cone"
    || shape.kind === "thread"
    || shape.kind === "spring"
    || shape.kind === "sphere"
    || shape.kind === "halfSphere"
    || shape.kind === "polygon";
}

/** Largest edge-treatment size the shape's own geometry can absorb. */
export function shapeEdgeTreatmentLimit(shape: Pick<WorkplaneShape, "kind" | "width" | "depth" | "size" | "height">) {
  const footprint = Math.min(shapeWidth(shape as WorkplaneShape), shapeDepth(shape as WorkplaneShape));
  const horizontal = shapeFootprintIsRadial(shape) ? footprint / 2 : footprint;
  return Math.min(horizontal, shape.height);
}

export function resizedShapeSize(width: number, depth: number) {
  return Math.max(width, depth);
}

export function proportionalResizeScale(startWidth: number, startDepth: number, nextWidth: number, nextDepth: number) {
  const widthScale = nextWidth / Math.max(0.001, startWidth);
  const depthScale = nextDepth / Math.max(0.001, startDepth);
  if (!Number.isFinite(widthScale) || !Number.isFinite(depthScale)) {
    return 1;
  }
  return Math.abs(widthScale - 1) >= Math.abs(depthScale - 1) ? widthScale : depthScale;
}

export type ResizeAxis = "width" | "depth" | "height";
export type LinkedResizeAxes = Record<ResizeAxis, boolean>;
export const RESIZE_AXES: readonly ResizeAxis[] = ["width", "depth", "height"];
export const NO_LINKED_RESIZE_AXES: LinkedResizeAxes = { width: false, depth: false, height: false };

export function linkedResizeAxisCount(linked: LinkedResizeAxes) {
  return RESIZE_AXES.reduce((total, axis) => total + (linked[axis] ? 1 : 0), 0);
}

/**
 * True when editing `axis` should carry the other linked axes along - i.e. it
 * is itself linked and has at least one partner. A single checked axis is a
 * group of one and behaves exactly like no link at all.
 */
export function resizeAxisIsLinked(axis: ResizeAxis, linked: LinkedResizeAxes) {
  return linked[axis] && linkedResizeAxisCount(linked) >= 2;
}

/**
 * The dimensions after setting `axis` to `value` with every linked axis held
 * in proportion. Unlinked axes are left out of the result untouched.
 *
 * The shared scale factor is clamped once against *every* linked axis rather
 * than clamping each axis afterwards: capping them individually would let one
 * axis stop at its bound while the others keep going, which silently destroys
 * the very ratio the link exists to preserve. Since each current value already
 * sits inside the bounds, the allowed factor range always contains 1, so the
 * clamp can never invert the drag.
 */
export function linkedResizeValues(
  current: Record<ResizeAxis, number>,
  axis: ResizeAxis,
  value: number,
  linked: LinkedResizeAxes,
  bounds: { min: number; max: number },
): Partial<Record<ResizeAxis, number>> {
  const clamp = (input: number) => Math.min(bounds.max, Math.max(bounds.min, input));
  const round = (input: number) => Math.round(input * 10000) / 10000;
  if (!Number.isFinite(value)) return {};
  if (!resizeAxisIsLinked(axis, linked)) {
    return { [axis]: round(clamp(value)) };
  }

  const from = current[axis];
  if (!(from > 0)) return { [axis]: round(clamp(value)) };

  const partners = RESIZE_AXES.filter((candidate) => linked[candidate] && current[candidate] > 0);
  let scale = value / from;
  if (!Number.isFinite(scale) || scale <= 0) return { [axis]: round(clamp(value)) };
  for (const partner of partners) {
    scale = Math.min(scale, bounds.max / current[partner]);
    scale = Math.max(scale, bounds.min / current[partner]);
  }

  const next: Partial<Record<ResizeAxis, number>> = {};
  for (const partner of partners) {
    next[partner] = round(clamp(current[partner] * scale));
  }
  return next;
}

export function fallbackSolidColor(shape: WorkplaneShape) {
  if (shape.sketchOperation === "revolve") return "#78b96b";
  if (shape.kind === "cylinder") return "#d97813";
  if (shape.kind === "sphere") return "#0098c7";
  if (shape.kind === "cone") return "#6e2786";
  if (shape.kind === "pyramid") return "#f2cf10";
  if (shape.kind === "gear") return "#6f7f8d";
  if (shape.kind === "loft") return "#5b5ce2";
  return "#d41721";
}

export function withHoleMode(shape: WorkplaneShape, hole: boolean, parentColor?: string): WorkplaneShape {
  const color = parentColor ?? shape.color;
  return {
    ...shape,
    hole,
    color,
    groupedShapes: shape.groupedShapes?.map((child) => withHoleMode(child, hole, parentColor)),
  };
}

export function mirrorSign(value?: boolean) {
  return value ? -1 : 1;
}

export function mirroredAxisCount(shape: WorkplaneShape) {
  return [shape.mirrorX, shape.mirrorY, shape.mirrorZ].filter(Boolean).length;
}

/** Clamped to 0.05..1; 1 (fully opaque) is stored as absent. */
export function normalizeShapeOpacity(value: number | undefined) {
  if (!Number.isFinite(value)) return undefined;
  const clamped = Math.min(1, Math.max(0.05, value as number));
  return clamped >= 0.999 ? undefined : Number(clamped.toFixed(3));
}

export function canonicalizeShape(shape: WorkplaneShape): WorkplaneShape {
  const next: WorkplaneShape = {
    ...shape,
    opacity: normalizeShapeOpacity(shape.opacity),
    rotation: cleanRotationDegrees(shape.rotation ?? 0),
    rotationX: cleanRotationDegrees(shape.rotationX ?? 0),
    rotationZ: cleanRotationDegrees(shape.rotationZ ?? 0),
    loftBottomRotation: shape.loftBottomRotation !== undefined ? cleanRotationDegrees(shape.loftBottomRotation) : undefined,
    loftTopRotation: shape.loftTopRotation !== undefined ? cleanRotationDegrees(shape.loftTopRotation) : undefined,
    mirrorX: shape.mirrorX || undefined,
    mirrorY: shape.mirrorY || undefined,
    mirrorZ: shape.mirrorZ || undefined,
  };
  // Threads must not be stretched like an arbitrary mesh: scaling would grow
  // the pitch along with them and the thread would no longer match the
  // standard. When the height changes (transform handle, scaling), the geometry
  // is rebuilt with the new length instead.
  if (next.threadParams && Math.abs(next.threadParams.length - next.height) > 1e-6) {
    try {
      Object.assign(next, createThreadShapeFields({ ...next.threadParams, length: next.height }));
    } catch {
      // Invalid combination: keep the previous state rather than producing
      // broken geometry.
    }
  }
  // Ein parametrisches Gewinde bekommt Breite und Tiefe aus seinem
  // Durchmesser. Zieht jemand am Anfasser, wird daraus wieder ein gleichmaessiger
  // Massstab - ein ovales Gewinde kann so gar nicht erst entstehen.
  if (next.kind === "thread") {
    Object.assign(next, threadFootprintPatch(next));
    next.size = resizedShapeSize(next.width, next.depth);
  }
  if (shape.groupedShapes) {
    next.groupedShapes = shape.groupedShapes.map(canonicalizeShape);
  }
  if (shape.sketchRevolve) {
    next.sketchRevolve = {
      startAngle: shape.sketchRevolve.startAngle,
      sweepAngle: shape.sketchRevolve.sweepAngle,
      sides: shape.sketchRevolve.sides,
      quality: shape.sketchRevolve.quality,
    };
  }
  if (shape.edgeTreatmentHistory) {
    next.edgeTreatmentHistory = shape.edgeTreatmentHistory.map((entry) => ({
      ...entry,
      before: canonicalizeShape(entry.before),
    }));
  }
  return next;
}

export function workplaneShapesEqual(a: WorkplaneShape, b: WorkplaneShape) {
  return (
    a.id === b.id &&
    a.name === b.name &&
    a.kind === b.kind &&
    a.color === b.color &&
    a.opacity === b.opacity &&
    a.hole === b.hole &&
    a.x === b.x &&
    a.z === b.z &&
    a.elevation === b.elevation &&
    a.size === b.size &&
    a.width === b.width &&
    a.depth === b.depth &&
    a.height === b.height &&
    a.rotation === b.rotation &&
    a.rotationX === b.rotationX &&
    a.rotationZ === b.rotationZ &&
    a.mirrorX === b.mirrorX &&
    a.mirrorY === b.mirrorY &&
    a.mirrorZ === b.mirrorZ &&
    a.radius === b.radius &&
    a.steps === b.steps &&
    a.sides === b.sides &&
    a.bevel === b.bevel &&
    a.segments === b.segments &&
    a.topRadius === b.topRadius &&
    a.baseRadius === b.baseRadius &&
    a.cornerFillet === b.cornerFillet &&
    a.topBottomFillet === b.topBottomFillet &&
    a.roundedBoxQuality === b.roundedBoxQuality &&
    a.taperHeightLeft === b.taperHeightLeft &&
    a.taperHeightRight === b.taperHeightRight &&
    a.taperHeightFront === b.taperHeightFront &&
    a.taperHeightBack === b.taperHeightBack &&
    a.taperTopWidth === b.taperTopWidth &&
    a.taperTopDepth === b.taperTopDepth &&
    a.taperBottomWidth === b.taperBottomWidth &&
    a.taperBottomDepth === b.taperBottomDepth &&
    a.taperTopScale === b.taperTopScale &&
    a.taperBottomScale === b.taperBottomScale &&
    a.extrudeTwist === b.extrudeTwist &&
    a.extrudeTopOffsetX === b.extrudeTopOffsetX &&
    a.extrudeTopOffsetZ === b.extrudeTopOffsetZ &&
    a.teeth === b.teeth &&
    a.toothSize === b.toothSize &&
    a.toothWidth === b.toothWidth &&
    a.centerHoleSize === b.centerHoleSize &&
    a.gearType === b.gearType &&
    a.helixAngle === b.helixAngle &&
    a.helixQuality === b.helixQuality &&
    a.threadRole === b.threadRole &&
    a.threadHead === b.threadHead &&
    a.threadDrive === b.threadDrive &&
    a.threadHand === b.threadHand &&
    a.threadProfile === b.threadProfile &&
    a.threadDiameter === b.threadDiameter &&
    a.threadPitch === b.threadPitch &&
    a.threadClearance === b.threadClearance &&
    a.threadQuality === b.threadQuality &&
    a.threadHeadHeight === b.threadHeadHeight &&
    a.threadChamfer === b.threadChamfer &&
    a.threadHeadChamfer === b.threadHeadChamfer &&
    a.parametricSource?.kind === b.parametricSource?.kind &&
    a.parametricSource?.rotation === b.parametricSource?.rotation &&
    a.parametricSource?.rotationX === b.parametricSource?.rotationX &&
    a.parametricSource?.rotationZ === b.parametricSource?.rotationZ &&
    a.parametricSource?.width === b.parametricSource?.width &&
    a.parametricSource?.depth === b.parametricSource?.depth &&
    a.parametricSource?.height === b.parametricSource?.height &&
    a.springTurns === b.springTurns &&
    a.springWire === b.springWire &&
    a.springQuality === b.springQuality &&
    a.loftBottomShape === b.loftBottomShape &&
    a.loftTopShape === b.loftTopShape &&
    a.loftTopWidth === b.loftTopWidth &&
    a.loftTopDepth === b.loftTopDepth &&
    a.loftBottomRotation === b.loftBottomRotation &&
    a.loftTopRotation === b.loftTopRotation &&
    a.loftSegments === b.loftSegments &&
    a.loftLayers === b.loftLayers &&
    a.text === b.text &&
    a.font === b.font &&
    a.importedMesh === b.importedMesh &&
    a.imagePlate === b.imagePlate &&
    a.sketchProfile === b.sketchProfile &&
    a.sketchOperation === b.sketchOperation &&
    a.sketchRevolve === b.sketchRevolve &&
    a.edgeTreatments === b.edgeTreatments &&
    a.edgeTreatmentHistory === b.edgeTreatmentHistory &&
    a.cadDisplayEdges === b.cadDisplayEdges &&
    a.cadDisplayEdgesVersion === b.cadDisplayEdgesVersion &&
    a.edgeResizeMode === b.edgeResizeMode &&
    a.cadBrep === b.cadBrep &&
    a.cadBrepFrame === b.cadBrepFrame &&
    a.cadMeshDeflection === b.cadMeshDeflection &&
    a.cadPrimitiveFrame === b.cadPrimitiveFrame &&
    a.groupedShapes === b.groupedShapes &&
    a.groupedBaseWidth === b.groupedBaseWidth &&
    a.groupedBaseDepth === b.groupedBaseDepth &&
    a.groupedBaseHeight === b.groupedBaseHeight &&
    a.groupOperation === b.groupOperation &&
    a.crossArm === b.crossArm &&
    a.markerRadius === b.markerRadius &&
    a.threadParams === b.threadParams &&
    a.locked === b.locked &&
    a.hidden === b.hidden
  );
}

export function serializeShapesForSync(shapes: WorkplaneShape[]) {
  return JSON.stringify(shapes.map(canonicalizeShape));
}
