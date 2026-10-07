import type { CustomSnapGrid, CustomSnapGridSize, GridSize, HistoryRetentionLimit, MeasurementAccuracy, ShapeCustomization, ShapeCustomizationMap, ShapeKind, WorkplaneWorkspaceSettings } from "@/types/sketchforge";
import { normalizeScaleForUnits } from "@/lib/measurementUnits";
import { DEFAULT_WORKPLANE_GRID_COLOR } from "@/lib/workplaneGrid";
import { clampBuildHeight, DEFAULT_BUILD_HEIGHT_MM } from "@/lib/buildVolume";
import { DEFAULT_OVERHANG_ANGLE, normalizeOverhangAngle } from "@/lib/overhangLimits";
import { normalizePrinterId } from "@/lib/printerPresets";
import {
  MAX_BORE_SIDES,
  MAX_COUNTERSINK_ANGLE,
  MAX_TEARDROP_TIP_ANGLE,
  MIN_BORE_SIDES,
  MIN_COUNTERSINK_ANGLE,
  MIN_TEARDROP_TIP_ANGLE,
} from "@/lib/boreGeometry";
import {
  MAX_THREAD_CLEARANCE,
  MAX_THREAD_DIAMETER,
  MAX_THREAD_PITCH,
  MAX_THREAD_QUALITY,
  MIN_THREAD_CLEARANCE,
  MIN_THREAD_DIAMETER,
  MIN_THREAD_PITCH,
  MIN_THREAD_QUALITY,
} from "@/lib/threadGeometry";
import {
  MAX_SPRING_QUALITY,
  MAX_SPRING_TURNS,
  MIN_SPRING_QUALITY,
  MIN_SPRING_TURNS,
  MIN_SPRING_WIRE,
} from "@/lib/springGeometry";

export const DEFAULT_SNAP_GRID: GridSize = "1.0 mm";
export const MIN_CUSTOM_SHAPE_DIMENSION = 0.01;
export const MAX_CUSTOM_SHAPE_DIMENSION = 2000;
export const MAX_HIGH_RESOLUTION_SIDES = 512;

export const DEFAULT_WORKPLANE_WORKSPACE: WorkplaneWorkspaceSettings = {
  width: 200,
  depth: 200,
  buildHeight: DEFAULT_BUILD_HEIGHT_MM,
  overhangAngle: DEFAULT_OVERHANG_ANGLE,
  printer: "",
  customSnapGrids: [],
  sizePreset: "200 x 200 mm",
  gridBlockSize: 5,
  gridBlockPreset: "5 mm",
  gridColor: DEFAULT_WORKPLANE_GRID_COLOR,
  background: "#f8fbfc",
  showShadows: true,
  showGrid: true,
  cruiseShapes: true,
  selectBeforeMove: false,
  zoomSpeed: 5,
  units: "Metric (Default)",
  scale: "1:1 (millimeters)",
  accuracy: 2,
  historyLimit: 100,
  shapeCustomizations: {},
};

/** Die festen Stufen des Fangmenues, in dieser Reihenfolge. */
export const FIXED_SNAP_GRIDS: readonly GridSize[] = ["Off", "0.1 mm", "0.25 mm", "0.5 mm", "1.0 mm", "2.0 mm", "5.0 mm", "Brick"];

export const MIN_CUSTOM_SNAP_GRID = 0.01;
export const MAX_CUSTOM_SNAP_GRID = 1000;
export const MAX_CUSTOM_SNAP_GRIDS = 12;
export const MAX_CUSTOM_SNAP_GRID_NAME = 32;

/**
 * Ein eigenes Mass faengt ganz, halb und geviertelt. Das Viertel bringt das
 * Dreiviertelmass mit, und damit ist alles erreichbar, was man an einem Raster
 * ueblicherweise braucht.
 */
export const CUSTOM_SNAP_GRID_DIVISORS = [1, 2, 4] as const;
const CUSTOM_SNAP_GRID_FRACTIONS: Record<number, string> = { 1: "1", 2: "½", 4: "¼" };

function cleanCustomSnapSize(value: number) {
  return Number(Math.min(MAX_CUSTOM_SNAP_GRID, Math.max(MIN_CUSTOM_SNAP_GRID, value)).toFixed(4));
}

export function customSnapGridSize(size: number, divisor: number): CustomSnapGridSize {
  return `custom:${cleanCustomSnapSize(size)}:${divisor}`;
}

/**
 * Das Mass und der Teiler, fuer die ein eigener Fangschritt steht - oder
 * `null` fuer alles andere. Ein Mass, das nicht mehr in der Liste steht,
 * laesst sich daran trotzdem noch lesen: Der Schritt selbst traegt seine
 * Millimeter.
 */
export function parseCustomSnapGrid(value: unknown): { size: number; divisor: number } | null {
  if (typeof value !== "string") return null;
  const match = /^custom:(\d+(?:\.\d+)?):(\d+)$/.exec(value);
  if (!match) return null;
  const size = Number(match[1]);
  const divisor = Number(match[2]);
  if (!(CUSTOM_SNAP_GRID_DIVISORS as readonly number[]).includes(divisor)) return null;
  if (!Number.isFinite(size) || size < MIN_CUSTOM_SNAP_GRID || size > MAX_CUSTOM_SNAP_GRID) return null;
  return { size, divisor };
}

export function normalizeCustomSnapGrids(value: unknown, fallback: CustomSnapGrid[] = []): CustomSnapGrid[] {
  if (!Array.isArray(value)) return fallback;
  const grids: CustomSnapGrid[] = [];
  for (const entry of value) {
    if (grids.length >= MAX_CUSTOM_SNAP_GRIDS) break;
    if (!entry || typeof entry !== "object") continue;
    const { name, size } = entry as { name?: unknown; size?: unknown };
    if (typeof size !== "number" || !Number.isFinite(size) || size <= 0) continue;
    grids.push({
      name: typeof name === "string" ? name.trim().slice(0, MAX_CUSTOM_SNAP_GRID_NAME) : "",
      size: cleanCustomSnapSize(size),
    });
  }
  return grids;
}

/** Das Fangmenue: die festen Stufen, dann jedes eigene Mass ganz, halb, viertel. */
export function snapGridOptions(customGrids: ReadonlyArray<CustomSnapGrid> = []): GridSize[] {
  const custom = customGrids.flatMap((grid) => CUSTOM_SNAP_GRID_DIVISORS.map((divisor) => customSnapGridSize(grid.size, divisor)));
  return [...FIXED_SNAP_GRIDS, ...new Set(custom)];
}

/**
 * Wie ein eigener Fangschritt im Menue heisst: "½ x Lochraster". Ein Schritt,
 * dessen Mass nicht mehr in der Liste steht, behaelt seine Millimeter.
 */
export function customSnapGridLabel(value: unknown, customGrids: ReadonlyArray<CustomSnapGrid> = []): string | null {
  const parsed = parseCustomSnapGrid(value);
  if (!parsed) return null;
  const name = customGrids.find((grid) => grid.size === parsed.size)?.name.trim() || `${parsed.size} mm`;
  return `${CUSTOM_SNAP_GRID_FRACTIONS[parsed.divisor] ?? `1/${parsed.divisor}`} × ${name}`;
}

/** Der Fangschritt in Millimetern. Null heisst: kein Fangen. */
export function snapGridStep(size: GridSize) {
  if (size === "Off") return 0;
  if (size === "Brick") return 8;
  const custom = parseCustomSnapGrid(size);
  // Ein eigenes Mass steht in Millimetern, gleichgueltig, worin die Platte
  // gerastert ist.
  if (custom) return custom.size / custom.divisor;
  return Number.parseFloat(size) || 1;
}
// Jede Art, deren Vorgaben sich in den Einstellungen setzen lassen. Fehlt eine
// hier, wirft das Normalisieren ihre gespeicherten Vorgaben beim naechsten
// Laden weg - das Fenster bietet sie an, behalten wuerde sie niemand.
const customizableShapeKinds: ShapeKind[] = [
  "box", "roundedBox", "honeycomb", "cylinder", "ellipse", "sphere", "sketch", "scribble", "cone", "pyramid", "roof", "text", "roundRoof",
  "halfSphere", "torus", "tube", "gear", "thread", "spring", "ruler", "ring", "wedge", "polygon", "icosahedron",
  "mesh", "loft", "counterbore", "countersink", "teardrop",
];

function numberOrDefault(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stringOrDefault(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function colorOrDefault(value: unknown, fallback: string) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value.trim()) ? value : fallback;
}

function booleanOrDefault(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function accuracyOrDefault(value: unknown, fallback: MeasurementAccuracy) {
  return value === 1 || value === 2 || value === 3 ? value : fallback;
}

function historyLimitOrDefault(value: unknown, fallback: HistoryRetentionLimit): HistoryRetentionLimit {
  if (value === "unlimited") return value;
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(5000, Math.max(1, Math.round(value)));
}

function optionalShapeDimension(value: unknown, fallback: number | undefined) {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(MAX_CUSTOM_SHAPE_DIMENSION, Math.max(MIN_CUSTOM_SHAPE_DIMENSION, value));
}

function optionalShapeNumber(value: unknown, fallback: number | undefined, min: number, max: number, integer = false) {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  const normalized = Math.min(max, Math.max(min, value));
  return integer ? Math.round(normalized) : normalized;
}

function optionalShapeText(value: unknown, fallback: string | undefined, maxLength: number) {
  if (value === undefined) return fallback;
  if (typeof value !== "string") return fallback;
  return value.slice(0, maxLength) || " ";
}

export function normalizeShapeCustomizations(value: unknown, fallback: ShapeCustomizationMap = {}): ShapeCustomizationMap {
  const candidate = value && typeof value === "object" ? value as Partial<Record<ShapeKind, unknown>> : {};
  const normalized: ShapeCustomizationMap = {};
  customizableShapeKinds.forEach((kind) => {
    const raw = candidate[kind];
    const source = raw && typeof raw === "object" ? raw as Partial<ShapeCustomization> : {};
    const fallbackEntry = fallback[kind];
    const entry: ShapeCustomization = {
      width: optionalShapeDimension(source.width, fallbackEntry?.width),
      depth: optionalShapeDimension(source.depth, fallbackEntry?.depth),
      height: optionalShapeDimension(source.height, fallbackEntry?.height),
      maxDimension: optionalShapeDimension(source.maxDimension, fallbackEntry?.maxDimension),
    };
    if (kind === "sphere" || kind === "halfSphere") {
      entry.steps = optionalShapeNumber(source.steps, fallbackEntry?.steps, 6, MAX_HIGH_RESOLUTION_STEPS, true);
    }
    if (kind === "honeycomb") {
      entry.honeycombCellSize = optionalShapeNumber(source.honeycombCellSize, fallbackEntry?.honeycombCellSize, 2, 100);
      entry.honeycombWallThickness = optionalShapeNumber(source.honeycombWallThickness, fallbackEntry?.honeycombWallThickness, 0.4, 50);
      entry.honeycombFrameWidth = optionalShapeNumber(source.honeycombFrameWidth, fallbackEntry?.honeycombFrameWidth, 0, 100);
    }
    if (kind === "counterbore" || kind === "countersink" || kind === "teardrop") {
      entry.sides = optionalShapeNumber(source.sides, fallbackEntry?.sides, MIN_BORE_SIDES, MAX_BORE_SIDES, true);
      if (kind === "counterbore" || kind === "countersink") {
        entry.boreHeadDiameter = optionalShapeNumber(source.boreHeadDiameter, fallbackEntry?.boreHeadDiameter, 0.2, MAX_CUSTOM_SHAPE_DIMENSION);
      }
      if (kind === "counterbore") {
        entry.boreHeadDepth = optionalShapeNumber(source.boreHeadDepth, fallbackEntry?.boreHeadDepth, 0.05, MAX_CUSTOM_SHAPE_DIMENSION);
      }
      if (kind === "countersink") {
        entry.boreHeadAngle = optionalShapeNumber(source.boreHeadAngle, fallbackEntry?.boreHeadAngle, MIN_COUNTERSINK_ANGLE, MAX_COUNTERSINK_ANGLE);
      }
      if (kind === "teardrop") {
        entry.boreTipAngle = optionalShapeNumber(source.boreTipAngle, fallbackEntry?.boreTipAngle, MIN_TEARDROP_TIP_ANGLE, MAX_TEARDROP_TIP_ANGLE);
      }
    }
    if (kind === "roundedBox") {
      entry.cornerFillet = optionalShapeNumber(source.cornerFillet, fallbackEntry?.cornerFillet, 0, MAX_CUSTOM_SHAPE_DIMENSION / 2);
      entry.topBottomFillet = optionalShapeNumber(source.topBottomFillet, fallbackEntry?.topBottomFillet, 0, MAX_CUSTOM_SHAPE_DIMENSION / 2);
      entry.roundedBoxQuality = optionalShapeNumber(source.roundedBoxQuality, fallbackEntry?.roundedBoxQuality, 4, 32, true);
    }
    if (kind === "cylinder" || kind === "ellipse" || kind === "cone") {
      entry.sides = optionalShapeNumber(source.sides, fallbackEntry?.sides, 3, MAX_HIGH_RESOLUTION_SIDES, true);
    } else if (kind === "pyramid" || kind === "polygon") {
      entry.sides = optionalShapeNumber(source.sides, fallbackEntry?.sides, 3, 24, true);
    } else if (kind === "roundRoof") {
      entry.sides = optionalShapeNumber(source.sides, fallbackEntry?.sides, 4, MAX_HIGH_RESOLUTION_SIDES, true);
    }
    if (kind === "pyramid") {
      entry.topWidth = optionalShapeNumber(source.topWidth, fallbackEntry?.topWidth, 0, MAX_CUSTOM_SHAPE_DIMENSION);
      entry.topDepth = optionalShapeNumber(source.topDepth, fallbackEntry?.topDepth, 0, MAX_CUSTOM_SHAPE_DIMENSION);
    }
    if (kind === "cone") {
      entry.topRadius = optionalShapeNumber(source.topRadius, fallbackEntry?.topRadius, 0, MAX_CUSTOM_SHAPE_DIMENSION / 2);
      entry.baseRadius = optionalShapeNumber(source.baseRadius, fallbackEntry?.baseRadius, MIN_CUSTOM_SHAPE_DIMENSION, MAX_CUSTOM_SHAPE_DIMENSION / 2);
    }
    if (kind === "tube" || kind === "ring") {
      entry.bevel = optionalShapeNumber(source.bevel, fallbackEntry?.bevel, 0.5, 20);
    }
    if (kind === "text") {
      entry.text = optionalShapeText(source.text, fallbackEntry?.text, 24);
      entry.font = source.font === undefined
        ? fallbackEntry?.font
        : ["Multilanguage", "Sans", "Serif", "Script", "Monospace", "Rounded", "Stencil"].includes(source.font)
          ? source.font
          : fallbackEntry?.font;
      entry.bevel = optionalShapeNumber(source.bevel, fallbackEntry?.bevel, 0, 8);
      entry.segments = optionalShapeNumber(source.segments, fallbackEntry?.segments, 0, 24, true);
    }
    if (kind === "gear") {
      entry.teeth = optionalShapeNumber(source.teeth, fallbackEntry?.teeth, 6, 64, true);
      entry.toothSize = optionalShapeNumber(source.toothSize, fallbackEntry?.toothSize, 0.2, MAX_CUSTOM_SHAPE_DIMENSION / 2);
      entry.toothWidth = optionalShapeNumber(source.toothWidth, fallbackEntry?.toothWidth, MIN_CUSTOM_SHAPE_DIMENSION, MAX_CUSTOM_SHAPE_DIMENSION);
      entry.centerHoleSize = optionalShapeNumber(source.centerHoleSize, fallbackEntry?.centerHoleSize, 0, MAX_CUSTOM_SHAPE_DIMENSION);
      entry.gearType = source.gearType === undefined
        ? fallbackEntry?.gearType
        : source.gearType === "spur" || source.gearType === "helical" || source.gearType === "bevel"
          ? source.gearType
          : fallbackEntry?.gearType;
      entry.helixAngle = optionalShapeNumber(source.helixAngle, fallbackEntry?.helixAngle, -45, 45);
      entry.helixQuality = optionalShapeNumber(source.helixQuality, fallbackEntry?.helixQuality, 4, 32, true);
    }
    if (kind === "spring") {
      entry.springTurns = optionalShapeNumber(source.springTurns, fallbackEntry?.springTurns, MIN_SPRING_TURNS, MAX_SPRING_TURNS, true);
      entry.springWire = optionalShapeNumber(source.springWire, fallbackEntry?.springWire, MIN_SPRING_WIRE, MAX_CUSTOM_SHAPE_DIMENSION);
      entry.springQuality = optionalShapeNumber(source.springQuality, fallbackEntry?.springQuality, MIN_SPRING_QUALITY, MAX_SPRING_QUALITY, true);
    }
    if (kind === "thread") {
      const pick = <T extends string>(value: unknown, allowed: readonly T[], previous: T | undefined) => (
        value === undefined ? previous : allowed.includes(value as T) ? (value as T) : previous
      );
      entry.threadRole = pick(source.threadRole, ["rod", "screw", "setScrew", "nut", "bore"] as const, fallbackEntry?.threadRole);
      entry.threadHead = pick(source.threadHead, ["cylinder", "pan", "countersunk", "hex"] as const, fallbackEntry?.threadHead);
      entry.threadDrive = pick(source.threadDrive, ["none", "hex", "slot", "phillips", "pozidriv", "torx", "star", "spline"] as const, fallbackEntry?.threadDrive);
      entry.threadHand = pick(source.threadHand, ["right", "left"] as const, fallbackEntry?.threadHand);
      entry.threadProfile = pick(source.threadProfile, ["v", "trapezoidal", "round"] as const, fallbackEntry?.threadProfile);
      entry.threadDiameter = optionalShapeNumber(source.threadDiameter, fallbackEntry?.threadDiameter, MIN_THREAD_DIAMETER, MAX_THREAD_DIAMETER);
      entry.threadPitch = optionalShapeNumber(source.threadPitch, fallbackEntry?.threadPitch, MIN_THREAD_PITCH, MAX_THREAD_PITCH);
      entry.threadClearance = optionalShapeNumber(source.threadClearance, fallbackEntry?.threadClearance, MIN_THREAD_CLEARANCE, MAX_THREAD_CLEARANCE);
      entry.threadQuality = optionalShapeNumber(source.threadQuality, fallbackEntry?.threadQuality, MIN_THREAD_QUALITY, MAX_THREAD_QUALITY, true);
    }
    const compact = Object.fromEntries(Object.entries(entry).filter(([, entryValue]) => entryValue !== undefined)) as ShapeCustomization;
    if (Object.keys(compact).length > 0) normalized[kind] = compact;
  });
  return normalized;
}

export function shapeDimensionLimit(workspace: WorkplaneWorkspaceSettings, kind: ShapeKind, appDefault: number) {
  return workspace.shapeCustomizations[kind]?.maxDimension ?? appDefault;
}

/**
 * Wie fein eine Kugel oder Halbkugel hoechstens facettiert wird.
 *
 * Zweihundertsechsundfuenfzig Stufen sind fuenfhundertzwoelf Segmente im
 * Rund - genug, dass auch eine grosse Kugel im Druck nicht mehr kantig
 * wirkt. Das kostet Netz: Wer es nicht braucht, bleibt tiefer.
 */
export const MAX_HIGH_RESOLUTION_STEPS = 256;

export function normalizeSnapGrid(value: unknown, fallback: GridSize = DEFAULT_SNAP_GRID): GridSize {
  // Ein eigener Schritt bleibt stehen, auch wenn sein Mass nicht mehr in der
  // Liste steht: Er traegt seine Millimeter selbst, und ein Projekt soll nicht
  // still auf ein anderes Raster springen.
  if (parseCustomSnapGrid(value)) return value as GridSize;
  return FIXED_SNAP_GRIDS.includes(value as GridSize) ? (value as GridSize) : fallback;
}

export function normalizeWorkspaceSettings(value: unknown, fallback: WorkplaneWorkspaceSettings = DEFAULT_WORKPLANE_WORKSPACE): WorkplaneWorkspaceSettings {
  const candidate = value && typeof value === "object" ? (value as Partial<WorkplaneWorkspaceSettings>) : {};
  const units = stringOrDefault(candidate.units, fallback.units);
  return {
    width: numberOrDefault(candidate.width, fallback.width),
    depth: numberOrDefault(candidate.depth, fallback.depth),
    // Alte Projekte haben keine Bauhoehe - dann gilt die uebliche.
    buildHeight: clampBuildHeight(numberOrDefault(candidate.buildHeight, fallback.buildHeight)),
    // Ebenso der Ueberhangwinkel: Alte Projekte kennen ihn nicht.
    overhangAngle: normalizeOverhangAngle(candidate.overhangAngle, fallback.overhangAngle),
    printer: normalizePrinterId(candidate.printer),
    customSnapGrids: normalizeCustomSnapGrids(candidate.customSnapGrids, fallback.customSnapGrids),
    sizePreset: stringOrDefault(candidate.sizePreset, fallback.sizePreset),
    gridBlockSize: numberOrDefault(candidate.gridBlockSize, fallback.gridBlockSize),
    gridBlockPreset: stringOrDefault(candidate.gridBlockPreset, fallback.gridBlockPreset),
    gridColor: colorOrDefault(candidate.gridColor, fallback.gridColor),
    background: stringOrDefault(candidate.background, fallback.background),
    showShadows: booleanOrDefault(candidate.showShadows, fallback.showShadows),
    showGrid: booleanOrDefault(candidate.showGrid, fallback.showGrid),
    cruiseShapes: booleanOrDefault(candidate.cruiseShapes, fallback.cruiseShapes),
    selectBeforeMove: booleanOrDefault(candidate.selectBeforeMove, fallback.selectBeforeMove),
    zoomSpeed: numberOrDefault(candidate.zoomSpeed, fallback.zoomSpeed),
    units,
    scale: normalizeScaleForUnits(units, stringOrDefault(candidate.scale, fallback.scale)),
    accuracy: accuracyOrDefault(candidate.accuracy, fallback.accuracy),
    historyLimit: historyLimitOrDefault(candidate.historyLimit, fallback.historyLimit),
    shapeCustomizations: normalizeShapeCustomizations(candidate.shapeCustomizations, fallback.shapeCustomizations),
  };
}

export function canBeginShapeDrag(selectBeforeMove: boolean, alreadySelected: boolean) {
  return !selectBeforeMove || alreadySelected;
}

export function workplaneSettingsFingerprint(workspace: WorkplaneWorkspaceSettings, snapGrid: GridSize) {
  return JSON.stringify({ workspace, snapGrid });
}

export function workspaceHydrationSyncDecision(pendingFingerprint: string | null, currentFingerprint: string) {
  if (pendingFingerprint === null) {
    return { shouldSync: true, pendingFingerprint: null };
  }
  return {
    shouldSync: false,
    pendingFingerprint: currentFingerprint === pendingFingerprint ? null : pendingFingerprint,
  };
}
