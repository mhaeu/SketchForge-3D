/**
 * surfaceTextureShape.ts
 *
 * Eine Oberflaechenstruktur an einer Form (siehe surfaceTexture.ts): Das Netz
 * des Koerpers geht hinein, ein Netzkoerper mit dem Relief tritt an seine
 * Stelle und merkt sich die Einstellungen. Der Koerper unter dem Relief kommt
 * in den Kantenverlauf, den auch Rundungen fuehren - so laesst sich die
 * Struktur mit anderen Einstellungen neu machen oder abnehmen, auch nach dem
 * Sichern.
 *
 * Gerechnet wird in einem eigenen Worker: Ein grosser Koerper braucht ein
 * paar Sekunden, und der Editor bleibt solange bedienbar.
 *
 * Nach layerling 1.121.1. Das Netz einer Form baut bei uns der Editor; die
 * Funktionen hier bekommen es darum hineingereicht.
 */

import { cloneWorkplaneShapeSnapshot, compactEdgeTreatmentHistory, edgeTreatmentAppliedFrame, restoreShapeBeforeEdgeTreatment } from "@/lib/edgeTreatmentHistory";
import { t, type MessageKey } from "@/lib/i18n";
import { createLocalId } from "@/lib/localIds";
import {
  applySurfaceTexture,
  normalizeSurfaceTexture,
  surfaceTexturePositions,
  SURFACE_TEXTURE_MAX_MASK_PLANES,
  type SurfaceTextureBarkType,
  type SurfaceTextureBrickBond,
  type SurfaceTextureCapEdge,
  type SurfaceTextureCapStyle,
  type SurfaceTextureCarbonWeave,
  type SurfaceTextureCrackStart,
  type SurfaceTextureCrackStyle,
  type SurfaceTextureDetail,
  type SurfaceTextureDirection,
  type SurfaceTextureImage,
  type SurfaceTextureMask,
  type SurfaceTextureMaskMode,
  type SurfaceTexturePattern,
  type SurfaceTextureProfile,
  type SurfaceTextureProjection,
  type SurfaceTextureSettings,
  type SurfaceTextureStats,
  type SurfaceTextureTiling,
  type SurfaceTextureWoodCut,
  type SurfaceTextureWoodType,
} from "@/lib/surfaceTexture";
import { canonicalizeShape, cleanNearZero, isNonSolidShapeKind } from "@/lib/workplaneShapes";
import type { EdgeTreatmentHistoryEntry, ShapeKind, WorkplaneShape } from "@/types/sketchforge";

/** Ein Netz, wie der Editor es zu einer Form baut: Punkte im inneren Rahmen (y oben) und je drei Punktnummern. */
export type SurfaceTextureMesh = { vertices: ReadonlyArray<readonly [number, number, number]>; faces: ReadonlyArray<readonly [number, number, number]> };

export type SurfaceTextureWorkerRequest = {
  requestId: number;
  /** Die Dreiecke des Koerpers, je neun Zahlen, im inneren Rahmen des Editors. */
  positions: Float64Array;
  settings: SurfaceTextureSettings;
  maxTriangles?: number;
};

export type SurfaceTextureWorkerResponse =
  | { requestId: number; positions: Float64Array; stats: SurfaceTextureStats; fill: Float64Array | null }
  | { requestId: number; error: string };

/** Die Dreiecke des strukturierten Koerpers und, bei Rissen mit Gold, die der Fuellung in ihrer Kerbe. */
export type SurfaceTextureOutcome = { positions: Float64Array; stats: SurfaceTextureStats; fill: Float64Array | null };

/** Die Farbe des Golds in den Rissen. */
export const SURFACE_TEXTURE_GOLD = "#d4a72c";

/** Die kleinste Abmessung einer Form, wie im Editor. */
const MIN_SHAPE_DIMENSION = 0.01;

function cleanModelDimension(value: number) {
  return Math.max(MIN_SHAPE_DIMENSION, Number(value.toFixed(3)));
}

/** Die Worte fuer jede Wahl, wie die Karte und die Statuszeile sie zeigen. */
export const SURFACE_TEXTURE_LABELS: {
  pattern: Record<SurfaceTexturePattern, MessageKey>;
  profile: Record<SurfaceTextureProfile, MessageKey>;
  /** Dieselben Profile als Form einer Noppe. */
  bumpShape: Record<SurfaceTextureProfile, MessageKey>;
  direction: Record<SurfaceTextureDirection, MessageKey>;
  projection: Record<SurfaceTextureProjection, MessageKey>;
  projectionHint: Record<SurfaceTextureProjection, MessageKey>;
  detail: Record<SurfaceTextureDetail, MessageKey>;
  mask: Record<SurfaceTextureMaskMode | "none", MessageKey>;
  crackStyle: Record<SurfaceTextureCrackStyle, MessageKey>;
  crackStart: Record<SurfaceTextureCrackStart, MessageKey>;
  carbonWeave: Record<SurfaceTextureCarbonWeave, MessageKey>;
  carbonWeaveHint: Record<SurfaceTextureCarbonWeave, MessageKey>;
  brickBond: Record<SurfaceTextureBrickBond, MessageKey>;
  brickBondHint: Record<SurfaceTextureBrickBond, MessageKey>;
  barkType: Record<SurfaceTextureBarkType, MessageKey>;
  barkTypeHint: Record<SurfaceTextureBarkType, MessageKey>;
  woodType: Record<SurfaceTextureWoodType, MessageKey>;
  woodCut: Record<SurfaceTextureWoodCut, MessageKey>;
  woodCutHint: Record<SurfaceTextureWoodCut, MessageKey>;
  image: Record<SurfaceTextureImage, MessageKey>;
  tiling: Record<SurfaceTextureTiling, MessageKey>;
  capStyle: Record<SurfaceTextureCapStyle, MessageKey>;
  capEdge: Record<SurfaceTextureCapEdge, MessageKey>;
  capEdgeHint: Record<SurfaceTextureCapEdge, MessageKey>;
} = {
  pattern: {
    grooves: "surfaceTexture.grooves",
    knurl: "surfaceTexture.knurl",
    honeycomb: "surfaceTexture.honeycomb",
    bumps: "surfaceTexture.bumps",
    cells: "surfaceTexture.cells",
    bricks: "surfaceTexture.bricks",
    knit: "surfaceTexture.knit",
    rope: "surfaceTexture.rope",
    weave: "surfaceTexture.weave",
    carbon: "surfaceTexture.carbon",
    bark: "surfaceTexture.bark",
    wood: "surfaceTexture.wood",
    grain: "surfaceTexture.grain",
    image: "surfaceTexture.image",
    cracks: "surfaceTexture.cracks",
    text: "surfaceTexture.text",
  },
  profile: { round: "surfaceTexture.round", pointed: "surfaceTexture.pointed", flat: "surfaceTexture.flat", dome: "surfaceTexture.dome" },
  bumpShape: { dome: "surfaceTexture.bumpDome", pointed: "surfaceTexture.bumpCone", round: "surfaceTexture.bumpSoft", flat: "surfaceTexture.bumpFlat" },
  direction: { inward: "surfaceTexture.inward", outward: "surfaceTexture.outward", both: "surfaceTexture.both" },
  projection: { auto: "surfaceTexture.auto", cylinder: "surfaceTexture.cylinder", allRound: "surfaceTexture.allRound", flat: "surfaceTexture.flatProjection" },
  projectionHint: { auto: "surfaceTexture.autoHint", cylinder: "surfaceTexture.cylinderHint", allRound: "surfaceTexture.allRoundHint", flat: "surfaceTexture.flatHint" },
  detail: { coarse: "surfaceTexture.coarse", medium: "surfaceTexture.medium", fine: "surfaceTexture.fine" },
  mask: { none: "surfaceTexture.maskNone", exclude: "surfaceTexture.maskExclude", only: "surfaceTexture.maskOnly" },
  crackStyle: { crack: "surfaceTexture.crackStyleCrack", lightning: "surfaceTexture.crackStyleLightning" },
  crackStart: { top: "surfaceTexture.crackStartTop", bottom: "surfaceTexture.crackStartBottom", rim: "surfaceTexture.crackStartRim", anywhere: "surfaceTexture.crackStartAnywhere" },
  carbonWeave: { twill22: "surfaceTexture.carbonTwill22", twill21: "surfaceTexture.carbonTwill21", twill31: "surfaceTexture.carbonTwill31" },
  carbonWeaveHint: { twill22: "surfaceTexture.carbonTwill22Hint", twill21: "surfaceTexture.carbonTwill21Hint", twill31: "surfaceTexture.carbonTwill31Hint" },
  brickBond: {
    running: "surfaceTexture.bondRunning",
    stack: "surfaceTexture.bondStack",
    english: "surfaceTexture.bondEnglish",
    englishCross: "surfaceTexture.bondEnglishCross",
    flemish: "surfaceTexture.bondFlemish",
  },
  brickBondHint: {
    running: "surfaceTexture.bondRunningHint",
    stack: "surfaceTexture.bondStackHint",
    english: "surfaceTexture.bondEnglishHint",
    englishCross: "surfaceTexture.bondEnglishCrossHint",
    flemish: "surfaceTexture.bondFlemishHint",
  },
  barkType: { oak: "surfaceTexture.barkOak", pine: "surfaceTexture.barkPine", spruce: "surfaceTexture.barkSpruce", birch: "surfaceTexture.barkBirch", beech: "surfaceTexture.barkBeech" },
  barkTypeHint: {
    oak: "surfaceTexture.barkOakHint",
    pine: "surfaceTexture.barkPineHint",
    spruce: "surfaceTexture.barkSpruceHint",
    birch: "surfaceTexture.barkBirchHint",
    beech: "surfaceTexture.barkBeechHint",
  },
  woodType: { oak: "surfaceTexture.woodOak", ash: "surfaceTexture.woodAsh", beech: "surfaceTexture.woodBeech", pine: "surfaceTexture.woodPine", walnut: "surfaceTexture.woodWalnut" },
  woodCut: { log: "surfaceTexture.woodCutLog", flatSawn: "surfaceTexture.woodCutFlatSawn", quarterSawn: "surfaceTexture.woodCutQuarterSawn" },
  woodCutHint: { log: "surfaceTexture.woodCutLogHint", flatSawn: "surfaceTexture.woodCutFlatSawnHint", quarterSawn: "surfaceTexture.woodCutQuarterSawnHint" },
  image: {
    topography: "surfaceTexture.imageTopography",
    wood: "surfaceTexture.imageWood",
    woodRift: "surfaceTexture.imageWoodRift",
    guilloche: "surfaceTexture.imageGuilloche",
    terrazzo: "surfaceTexture.imageTerrazzo",
    craquelure: "surfaceTexture.imageCraquelure",
    cord: "surfaceTexture.imageCord",
    moire: "surfaceTexture.imageMoire",
    mosaic: "surfaceTexture.imageMosaic",
    folds: "surfaceTexture.imageFolds",
    fingerprint: "surfaceTexture.imageFingerprint",
    rosettes: "surfaceTexture.imageRosettes",
    own: "surfaceTexture.imageOwn",
  },
  tiling: { repeat: "surfaceTexture.tilingRepeat", mirror: "surfaceTexture.tilingMirror", staggered: "surfaceTexture.tilingStaggered" },
  capStyle: { auto: "surfaceTexture.capAuto", rows: "surfaceTexture.capRows", rings: "surfaceTexture.capRings" },
  capEdge: { auto: "surfaceTexture.edgeAuto", sharp: "surfaceTexture.edgeSharp", over: "surfaceTexture.edgeOver", fold: "surfaceTexture.edgeFold", bead: "surfaceTexture.edgeBead" },
  capEdgeHint: { auto: "surfaceTexture.edgeAutoHint", sharp: "surfaceTexture.edgeSharpHint", over: "surfaceTexture.edgeOverHint", fold: "surfaceTexture.edgeFoldHint", bead: "surfaceTexture.edgeBeadHint" },
};

/** Der Name des Musters in der eingestellten Sprache. */
export function surfacePatternLabel(pattern: SurfaceTexturePattern) {
  return t(SURFACE_TEXTURE_LABELS.pattern[pattern] ?? "surfaceTexture.knurl");
}

/** Ob diese Form ein Koerper ist, der eine Struktur tragen kann: kein Buendel aus Gruppen, kein Messwerkzeug, kein Bezugspunkt. */
function solidBody(shape: WorkplaneShape) {
  return shape.kind !== "reference" && !isNonSolidShapeKind(shape.kind);
}

/** Ob eine Struktur auf diese Form darf: ein Koerper, nicht gesperrt und noch ohne Struktur (eine vorhandene wird geaendert). */
export function canTextureSurface(shape: WorkplaneShape | null | undefined) {
  return Boolean(shape && !shape.locked && !shape.surfaceTexture && solidBody(shape));
}

/**
 * Der Verlaufseintrag der Struktur eines Koerpers, mit dem Koerper darunter:
 * nur solange die Struktur sein letzter Schritt ist. Eine Struktur mit
 * Schritten danach hat keinen.
 */
export function surfaceTextureEntry(shape: WorkplaneShape | null | undefined): EdgeTreatmentHistoryEntry | null {
  const last = shape?.surfaceTexture ? shape.edgeTreatmentHistory?.at(-1) : undefined;
  return last?.feature.kind === "surfaceTexture" ? last : null;
}

/** Ob sich die Struktur dieses Koerpers aendern oder abnehmen laesst: Er hat den Koerper darunter und ist nicht gesperrt. */
export function canChangeSurfaceTexture(shape: WorkplaneShape | null | undefined) {
  return Boolean(shape && !shape.locked && surfaceTextureEntry(shape));
}

/** Der Koerper unter einer Struktur, dort und so gross, wie der strukturierte jetzt steht: was Abnehmen zurueckgibt und Aendern neu strukturiert. */
export function shapeUnderSurfaceTexture(shape: WorkplaneShape): WorkplaneShape | null {
  const entry = surfaceTextureEntry(shape);
  return entry ? restoreShapeBeforeEdgeTreatment(shape, entry) : null;
}

/** Ob die Karte fuer diese Form erscheint: fuer jeden Koerper; strukturierte sagen, was sie tragen. */
export function offersSurfaceTexture(shape: WorkplaneShape | null | undefined) {
  return Boolean(shape && solidBody(shape));
}

/** Arten, die eine Maske sein koennen: konvexe, die die Ebenen ihrer Flaechen genau beschreiben. */
export const SURFACE_TEXTURE_MASK_KINDS: readonly ShapeKind[] = ["box", "roundedBox", "cylinder", "ellipse", "sphere", "halfSphere", "cone", "pyramid"];

/** Ob dieser Koerper eine Maske sein kann (er traegt selbst keine Struktur). */
export function offersSurfaceTextureMask(shape: WorkplaneShape | null | undefined) {
  return Boolean(shape && SURFACE_TEXTURE_MASK_KINDS.includes(shape.kind) && !shape.groupedShapes?.length && !shape.surfaceTexture && !shape.importedMesh);
}

function meshBox(mesh: SurfaceTextureMesh) {
  const box = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  mesh.vertices.forEach(([x, y, z]) => {
    box[0] = Math.min(box[0], x); box[1] = Math.min(box[1], y); box[2] = Math.min(box[2], z);
    box[3] = Math.max(box[3], x); box[4] = Math.max(box[4], y); box[5] = Math.max(box[5], z);
  });
  return box;
}

/**
 * Ein konvexer Koerper als Maske: die Ebenen seiner Flaechen, nach aussen
 * zeigend, mit seinem Kasten, dort wo er im Entwurf steht. Flaechen einer
 * Ebene zaehlen einmal. Null, wenn er zu viele Flaechen fuer einen schnellen
 * Test hat.
 */
export function surfaceTextureMaskOf(mesh: SurfaceTextureMesh, mode: SurfaceTextureMaskMode): SurfaceTextureMask | null {
  if (!mesh.vertices.length) return null;
  const centroid = [0, 0, 0];
  mesh.vertices.forEach(([x, y, z]) => {
    centroid[0] += x / mesh.vertices.length;
    centroid[1] += y / mesh.vertices.length;
    centroid[2] += z / mesh.vertices.length;
  });
  const box = meshBox(mesh);
  const planes: number[] = [];
  const seen = new Set<string>();
  for (const [ia, ib, ic] of mesh.faces) {
    const [a, b, c] = [mesh.vertices[ia], mesh.vertices[ib], mesh.vertices[ic]];
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const wx = c[0] - a[0], wy = c[1] - a[1], wz = c[2] - a[2];
    let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    const length = Math.hypot(nx, ny, nz);
    if (length < 1e-9) continue;
    nx /= length; ny /= length; nz /= length;
    let d = nx * a[0] + ny * a[1] + nz * a[2];
    // Nach aussen, wie herum die Flaechen auch gewickelt sind: Die Mitte liegt hinter jeder Flaeche.
    if (nx * centroid[0] + ny * centroid[1] + nz * centroid[2] > d) {
      nx = -nx; ny = -ny; nz = -nz; d = -d;
    }
    const key = `${Math.round(nx * 1e4)},${Math.round(ny * 1e4)},${Math.round(nz * 1e4)},${Math.round(d * 1e3)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    planes.push(nx, ny, nz, d);
  }
  if (!planes.length || planes.length > SURFACE_TEXTURE_MAX_MASK_PLANES * 4) return null;
  return { mode, planes, box };
}

/** Die Masken, die eine Struktur auf `target` beachtet: als Masken markierte Koerper, die in seinen Kasten reichen. */
export function surfaceTextureMasksFor(target: WorkplaneShape, shapes: readonly WorkplaneShape[], meshOf: (shape: WorkplaneShape) => SurfaceTextureMesh) {
  const own = meshBox(meshOf(target));
  const masks: SurfaceTextureMask[] = [];
  for (const shape of shapes) {
    if (shape.id === target.id || !shape.surfaceTextureMask || !offersSurfaceTextureMask(shape)) continue;
    const mesh = meshOf(shape);
    const box = meshBox(mesh);
    if (box[3] < own[0] || box[0] > own[3] || box[4] < own[1] || box[1] > own[4] || box[5] < own[2] || box[2] > own[5]) continue;
    const mask = surfaceTextureMaskOf(mesh, shape.surfaceTextureMask);
    if (mask) masks.push(mask);
  }
  return masks;
}

/** Die Dreiecke eines Netzes, wie die Struktur sie nimmt: je neun Zahlen, dort wo sie im Entwurf stehen. */
export function surfaceTextureInput(mesh: SurfaceTextureMesh) {
  const out = new Float64Array(mesh.faces.length * 9);
  mesh.faces.forEach((face, index) => {
    for (let k = 0; k < 3; k += 1) {
      const [x, y, z] = mesh.vertices[face[k]];
      out[index * 9 + k * 3] = x;
      out[index * 9 + k * 3 + 1] = y;
      out[index * 9 + k * 3 + 2] = z;
    }
  });
  return out;
}

/** Die Dreiecke eines Koerpers hier und jetzt strukturieren (Tests, und wo kein Worker laeuft). */
export function textureSurfacePositions(positions: Float64Array, settings: SurfaceTextureSettings, maxTriangles?: number): SurfaceTextureOutcome {
  const result = applySurfaceTexture(positions, settings, maxTriangles ? { maxTriangles } : {});
  return { positions: Float64Array.from(surfaceTexturePositions(result)), stats: result.stats, fill: result.fill ? Float64Array.from(surfaceTexturePositions(result.fill)) : null };
}

/** Dreiecke, dort wo sie im Entwurf stehen, als Kasten eines Netzkoerpers (mittig auf x und z, Unterseite auf der Hoehe) und Punkte darin. */
function placedMesh(positions: ArrayLike<number>) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    minX = Math.min(minX, positions[i]);
    maxX = Math.max(maxX, positions[i]);
    minY = Math.min(minY, positions[i + 1]);
    maxY = Math.max(maxY, positions[i + 1]);
    minZ = Math.min(minZ, positions[i + 2]);
    maxZ = Math.max(maxZ, positions[i + 2]);
  }
  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;
  const local = new Array<number>(positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    local[i] = positions[i] - centerX;
    local[i + 1] = positions[i + 1] - minY;
    local[i + 2] = positions[i + 2] - centerZ;
  }
  const rawWidth = Math.max(MIN_SHAPE_DIMENSION, maxX - minX);
  const rawDepth = Math.max(MIN_SHAPE_DIMENSION, maxZ - minZ);
  const rawHeight = Math.max(MIN_SHAPE_DIMENSION, maxY - minY);
  const width = cleanModelDimension(rawWidth);
  const depth = cleanModelDimension(rawDepth);
  return {
    x: cleanNearZero(centerX, 0.0005),
    z: cleanNearZero(centerZ, 0.0005),
    elevation: cleanNearZero(minY, 0.0005),
    size: Math.max(width, depth),
    width,
    depth,
    height: cleanModelDimension(rawHeight),
    importedMesh: {
      positions: local,
      baseWidth: rawWidth,
      baseDepth: rawDepth,
      baseHeight: rawHeight,
      triangleCount: Math.floor(local.length / 9),
      sourceFormat: "json" as const,
    },
  };
}

/**
 * Das Gold der Risse eines Koerpers als eigenes Teil: Es sitzt in der Kerbe,
 * in Gold, und weiss, zu wem es gehoert - eine neu gemachte oder abgenommene
 * Struktur nimmt es mit.
 */
export function surfaceTextureGoldShape(body: WorkplaneShape, positions: ArrayLike<number>, name: string): WorkplaneShape | null {
  if (positions.length < 9) return null;
  return canonicalizeShape({
    id: createLocalId("mesh"),
    name,
    kind: "mesh",
    color: SURFACE_TEXTURE_GOLD,
    rotation: 0,
    rotationX: 0,
    rotationZ: 0,
    ...placedMesh(positions),
    surfaceFillOf: body.id,
    hidden: body.hidden,
  });
}

/**
 * Die Szene mit einem Koerper an Stelle dessen mit dieser Kennung (neu
 * strukturiert, oder die Struktur abgenommen) und dem Gold seiner Risse:
 * Gold von vorher weicht, neues (falls es welches gibt) kommt hinter den Koerper.
 */
export function sceneWithSurfaceBody(shapes: readonly WorkplaneShape[], id: string, body: WorkplaneShape, gold: WorkplaneShape | null) {
  const out: WorkplaneShape[] = [];
  for (const shape of shapes) {
    if (shape.surfaceFillOf === id) continue;
    if (shape.id !== id) {
      out.push(shape);
      continue;
    }
    out.push(body);
    if (gold) out.push(gold);
  }
  return out;
}

/**
 * Die Form, die die Struktur macht: ein Netzkoerper an Stelle des alten, dort
 * wo er stand, mit den Einstellungen, die er bekam. Drehungen und Spiegeln
 * stecken schon im Netz; der neue Koerper steht gerade. Null, wenn die
 * Struktur nichts uebrig liess.
 */
export function surfaceTexturedShape(shape: WorkplaneShape, positions: ArrayLike<number>, settings: SurfaceTextureSettings, createdAt = Date.now()): WorkplaneShape | null {
  if (positions.length < 9) return null;
  const normalized = normalizeSurfaceTexture(settings);
  const textured = canonicalizeShape({
    id: shape.id,
    name: shape.name,
    kind: "mesh",
    color: shape.color,
    opacity: shape.opacity,
    hole: shape.hole || undefined,
    rotation: 0,
    rotationX: 0,
    rotationZ: 0,
    ...placedMesh(positions),
    surfaceTexture: normalized,
    locked: false,
    hidden: shape.hidden,
  });
  // Der Koerper unter dem Relief bleibt, wie eine Rundung den Koerper davor
  // behaelt, mit dem Rahmen, in dem der strukturierte steht: spaeter
  // verschoben, gedreht oder gestreckt, kommt er genauso zurueck.
  return canonicalizeShape({
    ...textured,
    edgeTreatmentHistory: [
      ...compactEdgeTreatmentHistory(shape.edgeTreatmentHistory),
      {
        id: createLocalId("edge-history"),
        createdAt,
        feature: { kind: "surfaceTexture", amount: normalized.depth, edgeCount: 0, surfaceTexture: normalized },
        before: cloneWorkplaneShapeSnapshot(shape),
        appliedFrame: edgeTreatmentAppliedFrame(textured),
      },
    ],
  });
}
