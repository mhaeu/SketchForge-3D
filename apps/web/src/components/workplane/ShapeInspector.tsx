"use client";

import {
  MAX_GRIDFINITY_HEIGHT_UNITS,
  MAX_GRIDFINITY_TRAY_HEIGHT,
  MAX_GRIDFINITY_TRAY_SIZE,
  MIN_GRIDFINITY_TRAY_HEIGHT,
  MIN_GRIDFINITY_TRAY_SIZE,
  MIN_GRIDFINITY_UNITS,
  MIN_GRIDFINITY_WALL_THICKNESS,
  gridfinityCompartmentCount,
  gridfinityCompartmentCountPatch,
  gridfinityCompartmentMax,
  gridfinityMaxUnits,
  gridfinityShapePatch,
  gridfinityUnits,
  gridfinityWallMaxThickness,
  gridfinityWallThickness,
  normalizeGridfinityType,
} from "@/lib/gridfinityGeometry";
import { ChevronDown, ChevronUp, Eraser, ImageUp, Link2, LockKeyhole, LockKeyholeOpen, Split, Unlink2, Waves } from "lucide-react";
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type Dispatch, type SetStateAction } from "react";
import { ToolbarHideSelectedIcon } from "@/components/icons";
import { t, type MessageKey } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import {
  normalizeSurfaceTexture,
  SURFACE_TEXTURE_AXES,
  SURFACE_TEXTURE_BARK_TYPES,
  SURFACE_TEXTURE_BRICK_BONDS,
  SURFACE_TEXTURE_CAP_EDGES,
  SURFACE_TEXTURE_CAP_STYLES,
  SURFACE_TEXTURE_CARBON_WEAVES,
  SURFACE_TEXTURE_CRACK_STARTS,
  SURFACE_TEXTURE_CRACK_STYLES,
  SURFACE_TEXTURE_DEFAULTS,
  SURFACE_TEXTURE_DETAILS,
  SURFACE_TEXTURE_DIRECTIONS,
  SURFACE_TEXTURE_IMAGES,
  SURFACE_TEXTURE_LIMITS,
  SURFACE_TEXTURE_MASK_MODES,
  SURFACE_TEXTURE_PATTERNS,
  SURFACE_TEXTURE_PROFILES,
  SURFACE_TEXTURE_PROJECTIONS,
  SURFACE_TEXTURE_STARTERS,
  SURFACE_TEXTURE_TILINGS,
  SURFACE_TEXTURE_WOOD_CUTS,
  SURFACE_TEXTURE_WOOD_TYPES,
  surfaceTextureImageTile,
  type SurfaceTextureMaskMode,
  type SurfaceTexturePattern,
  type SurfaceTextureSettings,
} from "@/lib/surfaceTexture";
import { SURFACE_TEXTURE_OWN_IMAGE_SIZE, surfaceTextureOwnImage } from "@/lib/surfaceTextureImages";
import { offersSurfaceTextureMask, SURFACE_TEXTURE_LABELS, surfacePatternLabel, surfaceTextureEntry } from "@/lib/surfaceTextureShape";
import { BARK_STARTS, WOOD_RINGS } from "@/lib/surfaceTextureWood";
import { SURFACE_TEXT_FONTS } from "@/lib/surfaceTextOutline";
import {
  DEFAULT_GEAR_HELIX_ANGLE,
  DEFAULT_GEAR_HELIX_QUALITY,
  DEFAULT_GEAR_TEETH,
  DEFAULT_GEAR_TOOTH_SIZE,
  MAX_GEAR_HELIX_ANGLE,
  MAX_GEAR_HELIX_QUALITY,
  MIN_GEAR_HELIX_ANGLE,
  MIN_GEAR_HELIX_QUALITY,
  gearCenterHoleLimits,
  involuteGearDiameter,
  involuteGearMeasures,
  roundGearMeasures,
  MAX_GEAR_BACKLASH,
  MAX_GEAR_MODULE,
  MAX_GEAR_PRESSURE_ANGLE,
  MAX_GEAR_TEETH,
  MIN_GEAR_MODULE,
  MIN_GEAR_PRESSURE_ANGLE,
  MIN_GEAR_TEETH,
  normalizeGearBacklash,
  normalizeGearModule,
  normalizeGearPressureAngle,
  normalizeGearProfile,
  normalizeGearTeeth,
  normalizeGearHelixAngle,
  normalizeGearHelixQuality,
  normalizeGearCenterHoleSize,
  normalizeGearToothSize,
  normalizeGearToothWidth,
  normalizeGearType,
  gearToothPitch,
} from "@/lib/gearGeometry";
import {
  MAX_RACK_TEETH,
  MIN_RACK_TEETH,
  minRackDepth,
  normalizeRackDepth,
  normalizeRackTeeth,
  rackLength,
  rackMeasures,
  rackModule,
  rackPinionLimitTeeth,
} from "@/lib/rackGeometry";
import {
  MIN_RING_RIM,
  normalizeRingRim,
  RING_GEAR_MIN_TEETH_DIFFERENCE,
  ringGearMeasures,
  ringGearModule,
  ringGearOuterDiameter,
} from "@/lib/ringGearGeometry";
import {
  knurlSettings,
  MAX_KNURL_ANGLE,
  maxKnurlChamfer,
  maxKnurlCount,
  maxKnurlDepth,
  MIN_KNURL_ANGLE,
  MIN_KNURL_COUNT,
  MIN_KNURL_DEPTH,
  normalizeKnurlAngle,
  normalizeKnurlChamfer,
  normalizeKnurlCount,
  normalizeKnurlDepth,
  normalizeKnurlPattern,
} from "@/lib/knurlGeometry";
import {
  MAX_BORE_SIDES,
  MAX_COUNTERSINK_ANGLE,
  MAX_TEARDROP_TIP_ANGLE,
  MIN_BORE_SIDES,
  MIN_COUNTERSINK_ANGLE,
  MIN_TEARDROP_TIP_ANGLE,
  normalizeBoreHeadDepth,
  normalizeBoreHeadDiameter,
  normalizeBoreSides,
  normalizeCountersinkAngle,
  normalizeTeardropTipAngle,
  teardropDepthFor,
} from "@/lib/boreGeometry";
import { formulaForValue, measurementFormulasPatch, nextMeasurementFormula } from "@/lib/measurementFormula";
import { displayStepFromMillimeters, displayToMillimeters, formatMeasurementNumber, lengthDisplayUnit, measurementOptionLabel, millimetersToDisplay, parseMeasurementInput } from "@/lib/measurementUnits";
import { MIN_REGION_SIZE, regionSliderBounds, type ResizeRegion } from "@/lib/regionResize";
import { regionTaperIsUntouched, untouchedRegionTaper, type RegionTaper } from "@/lib/regionTaper";
import {
  DEFAULT_ROUNDED_BOX_CORNER_FILLET,
  DEFAULT_ROUNDED_BOX_QUALITY,
  DEFAULT_ROUNDED_BOX_TOP_BOTTOM_FILLET,
  MAX_ROUNDED_BOX_QUALITY,
  MIN_ROUNDED_BOX_QUALITY,
  normalizeCornerFillet,
  normalizeRoundedBoxQuality,
  normalizeTopBottomFillet,
} from "@/lib/roundedBoxGeometry";
import {
  DEFAULT_HONEYCOMB_CELL_SIZE,
  DEFAULT_HONEYCOMB_FRAME_WIDTH,
  DEFAULT_HONEYCOMB_WALL_THICKNESS,
  normalizeHoneycombCellSize,
  normalizeHoneycombFrameWidth,
  normalizeHoneycombWallThickness,
} from "@/lib/honeycombGeometry";
import { sceneAxisLetter } from "@/lib/axisLabels";
import { linkedResizeValues, normalizeShapeOpacity, NO_LINKED_RESIZE_AXES, RESIZE_AXES, resizeAxisIsLinked, resizedShapeSize, shapeDepth, shapeHasTaper, shapeOverallFootprintDimensions, shapeSideHeightPatch, shapeSideHeights, shapeSupportsExtrudeDeform, shapeTaperDimensions, shapeTopFaceEdgePatch, shapeTopFaceEdges, shapeWidth, type LinkedResizeAxes, type ResizeAxis } from "@/lib/workplaneShapes";
import { normalizeSketchRevolveSettings } from "@/lib/sketchRevolve";
import { MAX_HIGH_RESOLUTION_SIDES, MAX_HIGH_RESOLUTION_STEPS, POSITION_TYPED_LIMIT, customSnapGridLabel, snapGridOptions } from "@/lib/workplaneSettings";
import { maxTubeInnerDiameter, tubeInnerDiameter, tubeWallForInnerDiameter } from "@/lib/tubeWall";
import { THREAD_GROUPS, THREAD_TABLES } from "@/lib/threadGenerator";
import {
  MAX_THREAD_CLEARANCE,
  MAX_THREAD_DIAMETER,
  MAX_THREAD_QUALITY,
  MIN_THREAD_CLEARANCE,
  MIN_THREAD_DIAMETER,
  MIN_THREAD_QUALITY,
  THREAD_SIZE_GROUPS,
  defaultThreadHeadHeight,
  normalizeThreadChamfer,
  normalizeThreadClearance,
  normalizeThreadDiameter,
  normalizeThreadDrive,
  normalizeThreadHand,
  normalizeThreadHead,
  normalizeThreadHeadChamfer,
  normalizeThreadHeadHeight,
  normalizeThreadPitch,
  normalizeThreadProfile,
  normalizeThreadQuality,
  normalizeThreadRole,
  pitchToThreadsPerInch,
  threadChamferLimits,
  threadDriveSpec,
  threadHeadChamferLimits,
  threadHeadHeightLimits,
  threadNaturalFootprint,
  threadNaturalHeight,
  threadPitchLimits,
  threadSettings,
  threadSizeFor,
  threadTakesDrive,
  threadUsesInchPitch,
  threadsPerInchToPitch,
  type ThreadSettings,
} from "@/lib/threadGeometry";
import {
  MAX_SPRING_QUALITY,
  MIN_SPRING_QUALITY,
  normalizeSpringQuality,
  normalizeSpringTurns,
  normalizeSpringWire,
  springSettings,
  springTurnLimits,
  springWireLimits,
} from "@/lib/springGeometry";
import { regularPolygonAspect } from "@/lib/regularPolygonFootprint";
import { selectWholeValue } from "@/lib/numberField";
import { normalizePyramidTop } from "@/lib/pyramidGeometry";
import { createThreadShapeFields, findDesignation } from "@/lib/threadShape";
import {
  LOFT_PROFILE_SHAPES,
  MAX_LOFT_LAYERS,
  MAX_LOFT_SEGMENTS,
  MIN_LOFT_LAYERS,
  MIN_LOFT_SEGMENTS,
  isPolygonLoftShape,
  loftSettings,
} from "@/lib/loftGeometry";
import type { CustomSnapGrid, GearType, GridfinityType, GridSize, LoftProfileShape, MeasurementAccuracy, ThreadDrive, ThreadShapeParams, WorkplaneShape, WorkplaneWorkspaceSettings } from "@/types/sketchforge";

const MIN_SHAPE_SIZE = 0.01;
const SOLID_COLORS = [
  "#d41721",
  "#ff4b4b",
  "#ff7a1a",
  "#d97813",
  "#f6a21a",
  "#f2cf10",
  "#f7e65a",
  "#a8d642",
  "#33983d",
  "#1fb66d",
  "#18b99a",
  "#0098c7",
  "#49c7ef",
  "#3b82f6",
  "#294c93",
  "#5b5ce2",
  "#6e2786",
  "#9b3bd2",
  "#c9009a",
  "#f062b6",
  "#8a5a2b",
  "#b98254",
  "#f2caa0",
  "#ffffff",
  "#cfd8df",
  "#8a98a6",
  "#4b5563",
  "#111111",
];
const TEXT_FONT_OPTIONS = ["Multilanguage", "Sans", "Serif", "Script", "Monospace", "Rounded", "Stencil"];
const GEAR_TYPE_OPTIONS: Array<{ value: GearType; label: MessageKey }> = [
  { value: "spur", label: "gear.spur" },
  { value: "helical", label: "gear.helical" },
  { value: "bevel", label: "gear.bevel" },
];

type RangePropertyConfig = {
  type?: "range";
  // Stable name of the row, independent of its wording: the link toggles, the
  // unit formatting and the app limits look the row up by this, and a
  // translated label would leave them looking for a string that is no longer
  // there.
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  // Present only on the three size rows: toggles whether this axis scales
  // together with the other linked ones.
  link?: { axis: ResizeAxis; linked: boolean; active: boolean; onToggle: () => void };
};

type TextPropertyConfig = {
  type: "text";
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
};

export type SelectPropertyOption = { value: string; label: string; group?: string };

type SelectPropertyConfig = {
  type: "select";
  id: string;
  label: string;
  value: string;
  // A plain string is its own value and label; the object form carries a
  // separate label (translated, or a standard's own name) and an optional
  // heading that groups consecutive entries.
  options: Array<string | SelectPropertyOption>;
  onChange: (value: string) => void;
};

type ShapePropertyConfig = RangePropertyConfig | TextPropertyConfig | SelectPropertyConfig;
export type ShapeInspectorUpdateOptions = { resizeAxis?: "width" | "depth" | "height" };
type ShapeInspectorUpdate = (patch: Partial<WorkplaneShape>, options?: ShapeInspectorUpdateOptions) => void;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

const CUSTOM_THREAD_OPTION = "— custom —";

/**
 * Options for the standard menu. The groups from threadGenerator.ts are
 * concatenated into a flat list, because this project's select field expects
 * one.
 */
const THREAD_DESIGNATION_OPTIONS: string[] = [
  CUSTOM_THREAD_OPTION,
  ...THREAD_GROUPS.flatMap((group) => group.items),
];

/**
 * Builds the updateShape patch from thread parameters. A thread must not be
 * scaled like a mesh - that would grow the pitch along with it - so the
 * geometry is fully rebuilt here.
 */
function threadShapeUpdate(params: ThreadShapeParams): Partial<WorkplaneShape> {
  return createThreadShapeFields(params);
}

function formatReferenceDelta(valueMm: number, workspace: WorkplaneWorkspaceSettings) {
  // Show the offset in the workspace's length unit, with a sign so direction is
  // readable. Distance uses the same formatter but is always non-negative.
  const display = millimetersToDisplay(valueMm, workspace);
  const unit = lengthDisplayUnit(workspace).label;
  const text = formatMeasurementNumber(display, workspace.accuracy);
  const signed = valueMm > 0 ? `+${text}` : text;
  return `${signed} ${unit}`;
}

function formatPropertyNumber(value: number, accuracy: MeasurementAccuracy, step: number) {
  if (step >= 1) return String(Math.round(value));
  return formatMeasurementNumber(value, accuracy, step);
}

/**
 * A loft profile is stored by its English name; this is what the select shows.
 */
const LOFT_SHAPE_KEYS: Record<LoftProfileShape, MessageKey> = {
  Oval: "loft.oval",
  Rectangle: "loft.rectangle",
  Triangle: "loft.triangle",
  Pentagon: "loft.pentagon",
  Hexagon: "loft.hexagon",
};

function loftShapeOptions(): SelectPropertyOption[] {
  return LOFT_PROFILE_SHAPES.map((shape) => ({ value: shape, label: t(LOFT_SHAPE_KEYS[shape]) }));
}

function propertyUsesLengthUnit(id: string) {
  // The region bounds ("lengthFrom" ...) are lengths as well.
  if (/^(length|width|height)(From|To)$/.test(id)) return true;
  // Die vier Deckkanten und die vier Seitenhoehen sind ebenfalls Laengen.
  if (/^(side|height)(Left|Right|Front|Back)$/.test(id)) return true;
  if (id === "cornerFillet" || id === "topBottomFillet") return true;
  if (id === "honeycombCellSize" || id === "honeycombWallThickness" || id === "honeycombFrameWidth") return true;
  return ["radius", "length", "width", "height", "bevel", "topRadius", "baseRadius", "thickness", "innerDiameter", "toothSize", "toothWidth", "centerHole", "topLength", "topWidth", "bottomLength", "bottomWidth", "diameter", "pitch", "threadLength", "clearance", "headHeight", "chamfer", "headChamfer", "rimChamfer", "wire", "x", "y", "z", "crossSize", "markerSize"].includes(id);
}

type OptionKeys = ReadonlyArray<{ value: string; label: MessageKey }>;

const THREAD_ROLE_OPTIONS: OptionKeys = [
  { value: "rod", label: "thread.rod" },
  { value: "screw", label: "thread.screw" },
  { value: "setScrew", label: "thread.setScrew" },
  { value: "nut", label: "thread.nut" },
  { value: "bore", label: "thread.bore" },
];

const THREAD_HEAD_OPTIONS: OptionKeys = [
  { value: "cylinder", label: "thread.headCylinder" },
  { value: "pan", label: "thread.headPan" },
  { value: "countersunk", label: "thread.headCountersunk" },
  { value: "hex", label: "thread.headHex" },
];

const THREAD_PROFILE_OPTIONS: OptionKeys = [
  { value: "v", label: "thread.profileV" },
  { value: "trapezoidal", label: "thread.profileTrapezoidal" },
  { value: "round", label: "thread.profileRound" },
];

const THREAD_DRIVE_LABELS: Record<Exclude<ThreadDrive, "none">, MessageKey> = {
  hex: "thread.driveHex",
  slot: "thread.driveSlot",
  phillips: "thread.drivePhillips",
  pozidriv: "thread.drivePozidriv",
  torx: "thread.driveTorx",
  star: "thread.driveStar",
  spline: "thread.driveSpline",
};

/** Turns a list of option keys into the wording of the current language. */
function translatedOptions(options: OptionKeys): SelectPropertyOption[] {
  return options.map((option) => ({ value: option.value, label: t(option.label) }));
}

/**
 * The drive choices, each with the size that belongs to this thread: a hex
 * socket on an M5 is 4 mm wide, its Torx is a T25. Showing the standard size
 * in the option is the whole point - it is what one buys the bit for.
 */
function threadDriveOptions(settings: ThreadSettings): SelectPropertyOption[] {
  // A set screw carries the recess in its own face, so its depth is measured
  // against the body rather than against a head it does not have, and its size
  // has to fit the core instead of a head.
  const headHeight = Math.max(0.2, settings.role === "setScrew" ? threadNaturalHeight(settings) : settings.headHeight);
  return [
    { value: "none", label: t("common.none") },
    ...(Object.keys(THREAD_DRIVE_LABELS) as Array<Exclude<ThreadDrive, "none">>).map((drive) => {
      const spec = threadDriveSpec(drive, settings.diameter, settings.pitch, headHeight, settings.role);
      const name = t(THREAD_DRIVE_LABELS[drive]);
      return { value: drive, label: spec?.label ? `${name} ${spec.label}` : name };
    }),
  ];
}

/**
 * Everything a thread can be: rod, screw, nut or tapped hole, in a standard
 * size, with a profile, a hand, a head and - in that head - a drive.
 *
 * Width and depth are not offered: they follow the diameter and the role.
 * Turning the diameter gives a round body of the right size, and the head
 * grows with it as long as it stands on its standard height.
 */
function threadProperties(shape: WorkplaneShape, onUpdate: ShapeInspectorUpdate): ShapePropertyConfig[] {
  const settings = threadSettings(shape);
  const standard = threadSizeFor(settings.diameter, settings.pitch);
  const pitchLimits = threadPitchLimits(settings.diameter);
  const headLimits = threadHeadHeightLimits(settings);
  const chamferLimits = threadChamferLimits(settings);
  const rimChamferLimits = threadHeadChamferLimits(settings);
  // Inch threads are thought of in threads per inch, not in millimetres.
  const inchPitch = threadUsesInchPitch(settings.diameter);
  const sizeOptions: SelectPropertyOption[] = [
    ...THREAD_SIZE_GROUPS.flatMap((group) => group.sizes.map((size) => ({
      value: size.id,
      label: size.id,
      group: group.series === "metric" ? "Metric" : group.series,
    }))),
    { value: "custom", label: t("inspector.custom") },
  ];
  // The body's height stays head plus thread; what is asked for is the thread,
  // because a measurement that counts the head in tells nobody anything.
  const threadLength = Math.max(MIN_SHAPE_SIZE, shape.height - settings.headHeight);
  const headFollowsStandard = Math.abs(settings.headHeight - defaultThreadHeadHeight(settings)) < 1e-6;
  const applyThread = (patch: Partial<ThreadSettings>, nextLength?: number, resetHeight = false) => {
    const next: ThreadSettings = { ...settings, ...patch };
    next.diameter = normalizeThreadDiameter(next.diameter);
    next.pitch = normalizeThreadPitch(next.pitch, next.diameter);
    next.clearance = normalizeThreadClearance(next.clearance);
    next.quality = normalizeThreadQuality(next.quality);
    next.chamfer = normalizeThreadChamfer(next.chamfer, { role: next.role, diameter: next.diameter, pitch: next.pitch, profile: next.profile });
    const headBase = { role: next.role, head: next.head, diameter: next.diameter, pitch: next.pitch };
    const keepHeadHeight = patch.headHeight !== undefined || !headFollowsStandard;
    next.headHeight = normalizeThreadHeadHeight(
      keepHeadHeight ? next.headHeight : defaultThreadHeadHeight(headBase),
      headBase,
    );
    next.headChamfer = normalizeThreadHeadChamfer(next.headChamfer, { ...headBase, headHeight: next.headHeight, profile: next.profile });
    const footprint = threadNaturalFootprint(next);
    const update: Partial<WorkplaneShape> = {
      threadRole: next.role,
      threadHead: next.head,
      threadDrive: next.drive,
      threadHand: next.hand,
      threadProfile: next.profile,
      threadDiameter: next.diameter,
      threadPitch: next.pitch,
      threadClearance: next.clearance,
      threadQuality: next.quality,
      threadHeadHeight: next.headHeight,
      threadChamfer: next.chamfer,
      threadHeadChamfer: next.headChamfer,
      width: footprint.width,
      depth: footprint.depth,
      size: resizedShapeSize(footprint.width, footprint.depth),
      height: resetHeight
        ? threadNaturalHeight(next)
        : Math.max(MIN_SHAPE_SIZE, (nextLength ?? threadLength) + next.headHeight),
    };
    // A tapped hole is there to be subtracted; everything else is material.
    if (next.role === "bore") update.hole = true;
    else if (settings.role === "bore") update.hole = false;
    onUpdate(update);
  };

  const properties: ShapePropertyConfig[] = [
    {
      type: "select",
      id: "type",
      label: t("inspector.threadRole"),
      value: settings.role,
      options: translatedOptions(THREAD_ROLE_OPTIONS),
      onChange: (role) => applyThread({ role: normalizeThreadRole(role) }, undefined, true),
    },
  ];
  if (settings.role === "screw") {
    properties.push({
      type: "select",
      id: "head",
      label: t("inspector.threadHead"),
      value: settings.head,
      options: translatedOptions(THREAD_HEAD_OPTIONS),
      onChange: (head) => applyThread({ head: normalizeThreadHead(head) }),
    });
  }
  // A hex head is gripped from the outside; a recess in it would be one no
  // tool ever looks for. A set screw has nothing else.
  if (threadTakesDrive(settings.role, settings.head)) {
    properties.push({
      type: "select",
      id: "drive",
      label: t("prop.threadDrive"),
      value: settings.drive,
      options: threadDriveOptions(settings),
      onChange: (drive) => applyThread({ drive: normalizeThreadDrive(drive) }),
    });
  }
  properties.push(
    {
      type: "select",
      id: "standard",
      label: t("prop.threadStandard"),
      value: standard ? standard.id : "custom",
      options: sizeOptions,
      onChange: (value) => {
        const chosen = THREAD_SIZE_GROUPS.flatMap((group) => group.sizes).find((size) => size.id === value);
        if (chosen) applyThread({ diameter: chosen.diameter, pitch: chosen.pitch });
      },
    },
    {
      id: "diameter",
      label: t("prop.diameter"),
      value: settings.diameter,
      min: MIN_THREAD_DIAMETER,
      max: MAX_THREAD_DIAMETER,
      step: 0.1,
      onChange: (diameter) => applyThread({ diameter }),
    },
    {
      // A nut has no thread length, it has a height.
      id: "threadLength",
      label: settings.role === "nut" ? "Height" : t("prop.threadLength"),
      value: threadLength,
      min: MIN_SHAPE_SIZE,
      max: 160,
      onChange: (length) => applyThread({}, length),
    },
  );
  if (settings.role === "screw") {
    properties.push({
      id: "headHeight",
      label: t("prop.headHeight"),
      value: settings.headHeight,
      min: headLimits.min,
      max: headLimits.max,
      step: 0.1,
      onChange: (headHeight) => applyThread({ headHeight }),
    });
  }
  // The outer chamfer exists on a screw head and on a nut: both have a sharp
  // outer edge on both faces, and both are chamfered there in reality. The
  // countersunk head is already a cone - nothing to break there, and the limit
  // says so with a maximum of zero.
  if (rimChamferLimits.max > 0) {
    properties.push({
      id: "headChamfer",
      label: settings.role === "nut" ? t("prop.rimChamfer") : t("prop.headChamfer"),
      value: settings.headChamfer,
      min: rimChamferLimits.min,
      max: rimChamferLimits.max,
      step: 0.05,
      onChange: (headChamfer) => applyThread({ headChamfer }),
    });
  }
  properties.push(
    inchPitch
      ? {
        id: "threadsPerInch",
        label: t("prop.threadsPerInch"),
        value: pitchToThreadsPerInch(settings.pitch),
        min: Math.max(4, Math.ceil(pitchToThreadsPerInch(pitchLimits.max))),
        max: Math.min(80, Math.floor(pitchToThreadsPerInch(pitchLimits.min))),
        step: 1,
        onChange: (perInch) => applyThread({ pitch: threadsPerInchToPitch(Math.round(perInch)) }),
      }
      : {
        id: "pitch",
        label: t("prop.pitch"),
        value: settings.pitch,
        min: pitchLimits.min,
        max: pitchLimits.max,
        step: 0.05,
        onChange: (pitch) => applyThread({ pitch }),
      },
    {
      type: "select",
      id: "hand",
      label: t("prop.threadHand"),
      value: settings.hand,
      options: [{ value: "right", label: t("thread.right") }, { value: "left", label: t("thread.left") }],
      onChange: (hand) => applyThread({ hand: normalizeThreadHand(hand) }),
    },
    {
      type: "select",
      id: "profile",
      label: t("prop.threadProfile"),
      value: settings.profile,
      options: translatedOptions(THREAD_PROFILE_OPTIONS),
      onChange: (profile) => applyThread({ profile: normalizeThreadProfile(profile) }),
    },
  );
  if (settings.role === "bore" || settings.role === "nut") {
    properties.push({
      id: "clearance",
      label: t("prop.clearance"),
      value: settings.clearance,
      min: MIN_THREAD_CLEARANCE,
      max: MAX_THREAD_CLEARANCE,
      step: 0.05,
      onChange: (clearance) => applyThread({ clearance }),
    });
  }
  properties.push(
    {
      id: "chamfer",
      label: t("prop.chamfer"),
      value: settings.chamfer,
      min: chamferLimits.min,
      max: chamferLimits.max,
      step: 0.05,
      onChange: (chamfer) => applyThread({ chamfer }),
    },
    {
      id: "quality",
      label: t("prop.quality"),
      value: settings.quality,
      min: MIN_THREAD_QUALITY,
      max: MAX_THREAD_QUALITY,
      step: 6,
      onChange: (quality) => applyThread({ quality }),
    },
  );
  return properties;
}

function getShapePropertiesWithAppLimits(
  shape: WorkplaneShape,
  onUpdate: ShapeInspectorUpdate,
  textWidthMax = 260,
  linkedAxes: LinkedResizeAxes = NO_LINKED_RESIZE_AXES,
  dimensionMax = 160,
): ShapePropertyConfig[] {
  // The reference point has a fixed on-screen size; it only exposes position,
  // so it gets no size/shape properties at all.
  if (shape.kind === "reference") {
    return [];
  }
  const baseWidth = shapeWidth(shape);
  const baseDepth = shapeDepth(shape);
  const footprint = shapeOverallFootprintDimensions(shape);
  const width = footprint.width;
  const depth = footprint.depth;
  const taper = shapeTaperDimensions(shape);
  const widthPatch = (value: number): Partial<WorkplaneShape> => {
    if (!shapeHasTaper(shape)) {
      return { width: value, size: resizedShapeSize(value, baseDepth) };
    }
    const scale = value / Math.max(MIN_SHAPE_SIZE, width);
    const nextBaseWidth = Math.max(MIN_SHAPE_SIZE, baseWidth * scale);
    return {
      width: nextBaseWidth,
      size: resizedShapeSize(nextBaseWidth, baseDepth),
      taperTopWidth: Math.max(MIN_SHAPE_SIZE, taper.topWidth * scale),
      taperBottomWidth: Math.max(MIN_SHAPE_SIZE, taper.bottomWidth * scale),
    };
  };
  const depthPatch = (value: number): Partial<WorkplaneShape> => {
    if (!shapeHasTaper(shape)) {
      return { depth: value, size: resizedShapeSize(baseWidth, value) };
    }
    const scale = value / Math.max(MIN_SHAPE_SIZE, depth);
    const nextBaseDepth = Math.max(MIN_SHAPE_SIZE, baseDepth * scale);
    return {
      depth: nextBaseDepth,
      size: resizedShapeSize(baseWidth, nextBaseDepth),
      taperTopDepth: Math.max(MIN_SHAPE_SIZE, taper.topDepth * scale),
      taperBottomDepth: Math.max(MIN_SHAPE_SIZE, taper.bottomDepth * scale),
    };
  };
  // Linked axes are carried along by reusing each axis's own patch builder, so
  // taper fields stay consistent instead of being recomputed a second way.
  const axisPatch = (axis: ResizeAxis, value: number): Partial<WorkplaneShape> => {
    if (axis === "height") return { height: value };
    const patch = axis === "width" ? widthPatch(value) : depthPatch(value);
    if (shape.kind !== "loft") return patch;
    // A loft's far end sits on the same two axes as its near end, but in its
    // own fields. Scaling only the near end would reshape the loft instead of
    // resizing it, so the same factor goes to the top as well.
    const current = axis === "width" ? width : depth;
    const factor = value / Math.max(MIN_SHAPE_SIZE, current);
    const topCurrent = (axis === "width" ? shape.loftTopWidth : shape.loftTopDepth) ?? current;
    return {
      ...patch,
      [axis === "width" ? "loftTopWidth" : "loftTopDepth"]: Math.max(MIN_SHAPE_SIZE, topCurrent * factor),
    };
  };
  const setAxis = (axis: ResizeAxis, value: number, extra?: (patch: Partial<WorkplaneShape>) => Partial<WorkplaneShape>) => {
    const next = linkedResizeValues(
      { width, depth, height: shape.height },
      axis,
      value,
      linkedAxes,
      { min: MIN_SHAPE_SIZE, max: dimensionMax },
    );
    // A thread is defined by its parameters: it may follow a link in length,
    // but a carried width/depth would stretch its profile out of standard.
    // canonicalizeShape rebuilds it from the new height instead.
    const carries = (candidate: ResizeAxis) => candidate === axis || candidate === "height" || !shape.threadParams;
    const patch = RESIZE_AXES.reduce<Partial<WorkplaneShape>>(
      (merged, candidate) => next[candidate] === undefined || !carries(candidate)
        ? merged
        : { ...merged, ...axisPatch(candidate, next[candidate]) },
      {},
    );
    if (Object.keys(patch).length === 0) return;
    onUpdate({ ...patch, ...extra?.(patch) }, { resizeAxis: axis });
  };
  const setWidth = (value: number) => setAxis("width", value);
  const setDepth = (value: number) => setAxis("depth", value);
  const setConeWidth = (value: number) => setAxis("width", value, (patch) => ({
    baseRadius: Math.max(MIN_SHAPE_SIZE, (patch.width ?? baseWidth) / 2),
  }));
  const setBaseRadius = (value: number) => setAxis("width", value * 2, () => ({ baseRadius: value }));
  const setHeight = (height: number) => setAxis("height", height);

  if (shape.threadParams) {
    const params = shape.threadParams;
    const rebuild = (changes: Partial<typeof params>) => {
      const next = { ...params, ...changes };
      try {
        onUpdate(threadShapeUpdate(next));
      } catch (error) {
        // Invalid combination (e.g. pitch >= diameter). Keep the previous
        // state instead of producing broken geometry.
        console.warn("Thread could not be rebuilt:", (error as Error).message);
      }
    };
    return [
      {
        type: "select",
        id: "standard",
        label: t("prop.threadStandard"),
        value: findDesignation(params.diameter, params.pitch) ?? CUSTOM_THREAD_OPTION,
        options: THREAD_DESIGNATION_OPTIONS,
        onChange: (designation) => {
          const spec = THREAD_TABLES[designation];
          if (spec) rebuild({ diameter: spec.diameter, pitch: spec.pitch });
        },
      },
      {
        type: "select",
        id: "type",
        label: t("inspector.threadRole"),
        value: params.kind,
        options: [{ value: "external", label: t("thread.externalMesh") }, { value: "internal", label: t("thread.internalMesh") }],
        onChange: (mode) => rebuild({ kind: mode === "internal" ? "internal" : "external" }),
      },
      { id: "diameter", label: t("prop.diameter"), value: params.diameter, min: 0.1, max: 80, onChange: (diameter) => rebuild({ diameter }) },
      { id: "pitch", label: t("prop.pitch"), value: params.pitch, min: 0.05, max: 8, step: 0.05, onChange: (pitch) => rebuild({ pitch }) },
      { id: "threadLength", label: t("prop.threadLength"), value: params.length, min: MIN_SHAPE_SIZE, max: 160, onChange: (length) => rebuild({ length }) },
      { id: "clearance", label: t("prop.clearance"), value: params.clearance, min: 0, max: 1.5, step: 0.05, onChange: (clearance) => rebuild({ clearance }) },
      { id: "segments", label: t("prop.segments"), value: params.segments, min: 16, max: 256, step: 8, onChange: (segments) => rebuild({ segments: Math.round(segments) }) },
      { id: "leadIn", label: t("prop.leadIn"), value: params.taperTurns, min: 0, max: 5, step: 0.5, onChange: (taperTurns) => rebuild({ taperTurns }) },
    ];
  }

  if (shape.sketchOperation === "revolve" || shape.sketchRevolve) {
    const settings = normalizeSketchRevolveSettings(shape.sketchRevolve);
    const updateRevolve = (patch: Partial<typeof settings>) => onUpdate({ sketchRevolve: normalizeSketchRevolveSettings({ ...settings, ...patch }) });
    return [
      { id: "startAngle", label: t("prop.startAngle"), value: settings.startAngle, min: 0, max: 359, step: 1, onChange: (startAngle) => updateRevolve({ startAngle }) },
      { id: "sweep", label: t("prop.sweep"), value: settings.sweepAngle, min: -360, max: 360, step: 1, onChange: (sweepAngle) => updateRevolve({ sweepAngle }) },
      // Ein genauer Drehkoerper ist bei jeder Groesse rund; die Seitenzahl
      // formt nur das Netz eines aelteren.
      ...(shape.cadBrep ? [] : [{ id: "sides", label: t("prop.sides"), value: settings.sides, min: 3, max: MAX_HIGH_RESOLUTION_SIDES, step: 1, onChange: (sides: number) => updateRevolve({ sides }) }]),
      { id: "length", label: t("prop.length"), value: depth, min: MIN_SHAPE_SIZE, max: 160, onChange: setDepth },
      { id: "width", label: t("prop.width"), value: width, min: MIN_SHAPE_SIZE, max: 160, onChange: setWidth },
      { id: "height", label: t("prop.height"), value: shape.height, min: MIN_SHAPE_SIZE, max: 160, onChange: setHeight },
    ];
  }

  if (shape.kind === "box") {
    return [
      { id: "length", label: t("prop.length"), value: depth, min: MIN_SHAPE_SIZE, max: 160, onChange: setDepth },
      { id: "width", label: t("prop.width"), value: width, min: MIN_SHAPE_SIZE, max: 160, onChange: setWidth },
      { id: "height", label: t("prop.height"), value: shape.height, min: MIN_SHAPE_SIZE, max: 160, onChange: setHeight },
    ];
  }

  if (shape.kind === "ringGear") {
    /*
     * Das Hohlrad folgt dem Modul wie das Rad, und sein Aussendurchmesser
     * folgt aus Modul, Zaehnezahl und Kranz: `m (z + 2,5) + 2 Kranz`. Beide
     * Zahlen stehen als Regler da - oft ist der Aussendurchmesser das
     * Gegebene (er muss in ein Gehaeuse), dann rueckt das Modul mit.
     */
    const measures = ringGearMeasures(width, shape);
    const sized = (module: number, teeth: number, rim: number) => {
      const diameter = ringGearOuterDiameter(module, teeth, rim);
      return {
        teeth,
        ringRim: rim,
        width: diameter,
        depth: diameter,
        size: diameter,
        // Das Spiel haengt am Modul (hoechstens ein halbes) und rueckt mit.
        gearBacklash: normalizeGearBacklash(shape.gearBacklash, module),
      };
    };
    /*
     * Welches Rad in diesen Ring passt - die Zahl, die man beim
     * Eingriffswinkel wissen will, und darum steht sie in seiner
     * Beschriftung. Zwei Grenzen, beide gemessen: Das Rad braucht genug
     * Zaehne, um nicht unterschnitten zu sein (`2 / sin^2(a)`, dieselbe Zahl
     * wie bei der Zahnstange), und die Zaehnezahlen muessen sich um
     * mindestens zehn unterscheiden, sonst stossen die Zahnkoepfe aneinander.
     */
    const smallest = Math.ceil(rackPinionLimitTeeth(shape.gearPressureAngle));
    const largest = Math.max(smallest, measures.teeth - RING_GEAR_MIN_TEETH_DIFFERENCE);
    return [
      {
        id: "module",
        label: t("prop.gearModule"),
        value: measures.module,
        min: MIN_GEAR_MODULE,
        max: MAX_GEAR_MODULE,
        step: 0.1,
        onChange: (value) => onUpdate(sized(normalizeGearModule(value), measures.teeth, measures.rim), { resizeAxis: "width" }),
      },
      {
        id: "teeth",
        label: t("inspector.teeth"),
        value: measures.teeth,
        min: MIN_GEAR_TEETH,
        max: MAX_GEAR_TEETH,
        step: 1,
        onChange: (value) => onUpdate(sized(measures.module, normalizeGearTeeth(value), measures.rim), { resizeAxis: "width" }),
      },
      {
        id: "diameter",
        label: t("prop.diameter"),
        value: measures.outerRadius * 2,
        min: ringGearOuterDiameter(MIN_GEAR_MODULE, measures.teeth, MIN_RING_RIM),
        max: ringGearOuterDiameter(MAX_GEAR_MODULE, measures.teeth, measures.rim),
        onChange: (value) => onUpdate(
          sized(ringGearModule(value, measures.teeth, measures.rim), measures.teeth, measures.rim),
          { resizeAxis: "width" },
        ),
      },
      {
        id: "ringRim",
        label: t("prop.ringRim"),
        value: measures.rim,
        min: MIN_RING_RIM,
        max: Math.max(MIN_RING_RIM, measures.pitchRadius),
        step: 0.1,
        onChange: (value) => onUpdate(
          sized(measures.module, measures.teeth, normalizeRingRim(value, measures.module)),
          { resizeAxis: "width" },
        ),
      },
      { id: "height", label: t("prop.height"), value: shape.height, min: MIN_SHAPE_SIZE, max: 160, onChange: setHeight },
      {
        id: "pressureAngle",
        label: `${t("prop.gearPressureAngle")} — ${t("prop.ringPinionTeeth", { from: smallest, to: largest })}`,
        value: normalizeGearPressureAngle(shape.gearPressureAngle),
        min: MIN_GEAR_PRESSURE_ANGLE,
        max: MAX_GEAR_PRESSURE_ANGLE,
        step: 0.5,
        onChange: (gearPressureAngle: number) => onUpdate({ gearPressureAngle }),
      },
      {
        id: "backlash",
        label: t("prop.gearBacklash"),
        value: normalizeGearBacklash(shape.gearBacklash, measures.module),
        min: 0,
        max: Math.min(MAX_GEAR_BACKLASH, measures.module * 0.5),
        step: 0.05,
        onChange: (gearBacklash) => onUpdate({ gearBacklash }),
      },
    ];
  }

  if (shape.kind === "rack") {
    /*
     * Die Zahnstange wird wie das Zahnrad nach Modul und Zaehnezahl
     * eingestellt, und ihre Laenge folgt daraus: genau Zaehne x Teilung. Die
     * Laenge steht trotzdem als eigener Regler da, denn oft ist sie das
     * Gegebene ("ich brauche 100 mm") - dann rueckt das Modul mit.
     *
     * Die Tiefe hat ein Mindestmass (Zahn und Ruecken), und sie rueckt mit dem
     * Modul mit: Sonst stuende da eine Zahl, die der Koerper nicht einhaelt.
     */
    const measures = rackMeasures(width, depth, shape);
    const resized = (module: number, teeth: number) => ({
      teeth,
      width: rackLength(module, teeth),
      size: resizedShapeSize(rackLength(module, teeth), normalizeRackDepth(depth, module)),
      depth: normalizeRackDepth(depth, module),
      gearBacklash: normalizeGearBacklash(shape.gearBacklash, module),
    });
    const limit = Math.ceil(rackPinionLimitTeeth(shape.gearPressureAngle));
    return [
      {
        id: "module",
        label: t("prop.gearModule"),
        value: measures.module,
        min: MIN_GEAR_MODULE,
        max: MAX_GEAR_MODULE,
        step: 0.1,
        onChange: (value) => onUpdate(resized(normalizeGearModule(value), measures.teeth), { resizeAxis: "width" }),
      },
      {
        id: "teeth",
        label: t("inspector.teeth"),
        value: measures.teeth,
        min: MIN_RACK_TEETH,
        max: MAX_RACK_TEETH,
        step: 1,
        onChange: (value) => onUpdate(resized(measures.module, normalizeRackTeeth(value)), { resizeAxis: "width" }),
      },
      {
        id: "length",
        label: t("prop.length"),
        value: measures.length,
        min: rackLength(MIN_GEAR_MODULE, measures.teeth),
        max: rackLength(MAX_GEAR_MODULE, measures.teeth),
        onChange: (value) => onUpdate(resized(rackModule(value, measures.teeth), measures.teeth), { resizeAxis: "width" }),
      },
      {
        id: "depth",
        // Die Stange liegt flach, die Zaehne zeigen nach hinten: Von oben
        // gesehen ist diese Abmessung ihre Breite, die Hoehe die Dicke.
        label: t("prop.width"),
        value: measures.depth,
        min: minRackDepth(measures.module),
        max: 160,
        onChange: (value) => onUpdate({
          depth: normalizeRackDepth(value, measures.module),
          size: resizedShapeSize(width, normalizeRackDepth(value, measures.module)),
        }, { resizeAxis: "depth" }),
      },
      { id: "height", label: t("prop.height"), value: shape.height, min: MIN_SHAPE_SIZE, max: 160, onChange: setHeight },
      {
        id: "pressureAngle",
        /*
         * Die Zaehnezahl, ab der ein Rad auf dieser Stange sauber laeuft,
         * steht in der Beschriftung - das ist die Zahl, die man beim
         * Eingriffswinkel wissen will, und ein weiterer Winkel senkt sie.
         */
        label: `${t("prop.gearPressureAngle")} — ${t("prop.rackPinionTeeth", { teeth: limit })}`,
        value: normalizeGearPressureAngle(shape.gearPressureAngle),
        min: MIN_GEAR_PRESSURE_ANGLE,
        max: MAX_GEAR_PRESSURE_ANGLE,
        step: 0.5,
        onChange: (gearPressureAngle: number) => onUpdate({ gearPressureAngle }),
      },
      {
        id: "backlash",
        label: t("prop.gearBacklash"),
        value: normalizeGearBacklash(shape.gearBacklash, measures.module),
        min: 0,
        max: Math.min(MAX_GEAR_BACKLASH, measures.module * 0.5),
        step: 0.05,
        onChange: (gearBacklash) => onUpdate({ gearBacklash }),
      },
    ];
  }

  if (shape.kind === "gridfinity") {
    /*
     * Gridfinity: Ein Behaelter oder eine Grundplatte zaehlt Rastereinheiten
     * von 42 mm (Hoehe 7 mm), eine Schale hat freie Masse. Gezeigt werden die
     * Einstellungen, die man am haeufigsten braucht; alle anderen, die eine
     * Datei aus layerling mitbringt, bleiben erhalten und wirken weiter.
     */
    const fields = { ...shape, width, depth };
    const type = normalizeGridfinityType(shape.gridfinityType);
    const count = gridfinityUnits(fields);
    const onOff = [{ value: "on", label: t("common.on") }, { value: "off", label: t("common.off") }];
    const toggle = (id: string, label: string, on: boolean, patch: (on: boolean) => Partial<WorkplaneShape>): ShapePropertyConfig => ({
      type: "select", id, label, value: on ? "on" : "off", options: onOff, onChange: (value) => onUpdate(patch(value === "on")),
    });
    const units = (next: { type?: GridfinityType; x?: number; z?: number; y?: number; lip?: boolean; halfGrid?: boolean }) => onUpdate(gridfinityShapePatch(fields, next));
    const properties: ShapePropertyConfig[] = [{
      type: "select",
      id: "gridfinityType",
      label: t("gridfinity.type"),
      value: type,
      options: [
        { value: "bin", label: t("gridfinity.bin") },
        { value: "baseplate", label: t("gridfinity.baseplate") },
        { value: "tray", label: t("gridfinity.tray") },
      ],
      onChange: (value) => units({ type: normalizeGridfinityType(value) }),
    }];
    if (type === "tray") {
      properties.push(
        { id: "width", label: t("prop.width"), value: width, min: MIN_GRIDFINITY_TRAY_SIZE, max: MAX_GRIDFINITY_TRAY_SIZE, onChange: setWidth },
        { id: "length", label: t("prop.length"), value: depth, min: MIN_GRIDFINITY_TRAY_SIZE, max: MAX_GRIDFINITY_TRAY_SIZE, onChange: setDepth },
        { id: "height", label: t("prop.height"), value: shape.height, min: MIN_GRIDFINITY_TRAY_HEIGHT, max: MAX_GRIDFINITY_TRAY_HEIGHT, onChange: setHeight },
      );
    } else {
      const max = gridfinityMaxUnits(fields);
      properties.push(
        { id: "gridfinityUnitsX", label: t("gridfinity.unitsX"), value: count.x, min: MIN_GRIDFINITY_UNITS, max, step: 1, onChange: (x) => units({ x }) },
        { id: "gridfinityUnitsZ", label: t("gridfinity.unitsZ"), value: count.z, min: MIN_GRIDFINITY_UNITS, max, step: 1, onChange: (z) => units({ z }) },
      );
      if (type === "bin") {
        properties.push(
          { id: "gridfinityUnitsY", label: t("gridfinity.unitsY"), value: count.y, min: MIN_GRIDFINITY_UNITS, max: MAX_GRIDFINITY_HEIGHT_UNITS, step: 1, onChange: (y) => units({ y }) },
          toggle("gridfinityLip", t("gridfinity.lip"), shape.gridfinityLip !== false, (lip) => gridfinityShapePatch(fields, { lip })),
          toggle("gridfinityMagnets", t("gridfinity.magnets"), shape.gridfinityMagnets === true, (gridfinityMagnets) => ({ gridfinityMagnets })),
          toggle("gridfinityHalfGrid", t("gridfinity.halfGrid"), shape.gridfinityHalfGrid === true, (halfGrid) => gridfinityShapePatch(fields, { halfGrid })),
        );
      }
    }
    if (type !== "baseplate") {
      properties.push(
        { id: "thickness", label: t("gridfinity.wall"), value: gridfinityWallThickness(fields), min: MIN_GRIDFINITY_WALL_THICKNESS, max: Math.max(MIN_GRIDFINITY_WALL_THICKNESS, gridfinityWallMaxThickness(fields)), step: 0.05, onChange: (gridfinityWallThickness) => onUpdate({ gridfinityWallThickness }) },
        { id: "gridfinityCompartmentsX", label: t("gridfinity.compartmentsX"), value: gridfinityCompartmentCount(fields, "x"), min: 1, max: Math.max(1, gridfinityCompartmentMax(fields, "x")), step: 1, onChange: (value) => onUpdate(gridfinityCompartmentCountPatch("x", value)) },
        { id: "gridfinityCompartmentsZ", label: t("gridfinity.compartmentsZ"), value: gridfinityCompartmentCount(fields, "z"), min: 1, max: Math.max(1, gridfinityCompartmentMax(fields, "z")), step: 1, onChange: (value) => onUpdate(gridfinityCompartmentCountPatch("z", value)) },
        toggle("gridfinityScoopFront", t("gridfinity.scoopFront"), shape.gridfinityScoopFront === true, (gridfinityScoopFront) => ({ gridfinityScoopFront })),
        toggle("gridfinityLabelBack", t("gridfinity.labelBack"), shape.gridfinityLabelBack === true, (gridfinityLabelBack) => ({ gridfinityLabelBack })),
      );
    }
    return properties;
  }

  if (shape.kind === "knurl") {
    const knurl = knurlSettings({ ...shape, width });
    /*
     * Ein Durchmesser, nicht Breite und Tiefe getrennt: Die Raendelung rechnet
     * nur mit der Breite, und eine abweichende Tiefe waere eine Zahl, die der
     * Koerper nicht zeigt. Wer ihn unrund will, zieht ihn danach breit.
     *
     * Rillenzahl, Rillentiefe und Fase haengen an den Massen und ruecken mit:
     * ein duennerer Griff traegt weniger Rillen (enger als 0,8 mm zeigt sie
     * kein Drucker), ein flacherer eine kleinere Fase. Sonst stuende da eine
     * Zahl, die der Koerper schon nicht mehr einhaelt.
     */
    const setDiameter = (value: number) => onUpdate({
      width: value,
      depth: value,
      size: resizedShapeSize(value, value),
      knurlCount: normalizeKnurlCount(knurl.count, value),
      knurlDepth: normalizeKnurlDepth(knurl.depth, value, knurl.count, knurl.pattern),
      knurlChamfer: normalizeKnurlChamfer(knurl.chamfer, value, shape.height),
    }, { resizeAxis: "width" });
    const setKnurlHeight = (value: number) => onUpdate({
      height: value,
      knurlChamfer: normalizeKnurlChamfer(knurl.chamfer, width, value),
    }, { resizeAxis: "height" });
    const properties: ShapePropertyConfig[] = [
      {
        type: "select",
        id: "knurlPattern",
        label: t("inspector.knurlPattern"),
        value: knurl.pattern,
        options: [
          { value: "straight", label: t("knurl.straight") },
          { value: "round", label: t("knurl.round") },
          { value: "diamond", label: t("knurl.diamond") },
        ],
        // Runde Rillen duerfen nicht so tief; die Tiefe rueckt beim Umstellen
        // mit, statt eine Zahl stehen zu lassen, die nicht mehr gilt.
        onChange: (value) => {
          const knurlPattern = normalizeKnurlPattern(value);
          onUpdate({ knurlPattern, knurlDepth: normalizeKnurlDepth(knurl.depth, width, knurl.count, knurlPattern) });
        },
      },
      { id: "diameter", label: t("prop.diameter"), value: width, min: MIN_SHAPE_SIZE, max: 160, onChange: setDiameter },
      { id: "height", label: t("prop.height"), value: shape.height, min: MIN_SHAPE_SIZE, max: 160, onChange: setKnurlHeight },
      {
        id: "knurlCount",
        label: t("prop.knurlCount"),
        value: knurl.count,
        min: MIN_KNURL_COUNT,
        max: maxKnurlCount(width),
        step: 1,
        onChange: (value) => {
          const knurlCount = normalizeKnurlCount(value, width);
          onUpdate({ knurlCount, knurlDepth: normalizeKnurlDepth(knurl.depth, width, knurlCount, knurl.pattern) });
        },
      },
      { id: "knurlDepth", label: t("prop.knurlDepth"), value: knurl.depth, min: MIN_KNURL_DEPTH, max: maxKnurlDepth(width, knurl.count, knurl.pattern), step: 0.05, onChange: (value) => onUpdate({ knurlDepth: normalizeKnurlDepth(value, width, knurl.count, knurl.pattern) }) },
      { id: "knurlChamfer", label: t("prop.knurlChamfer"), value: knurl.chamfer, min: 0, max: Math.max(0.05, maxKnurlChamfer(width, shape.height)), step: 0.05, onChange: (value) => onUpdate({ knurlChamfer: normalizeKnurlChamfer(value, width, shape.height) }) },
    ];
    // Der Winkel gilt nur fuer die gekreuzte Raendelung - bei der geraden
    // waere er ein Regler ohne Wirkung.
    if (knurl.pattern === "diamond") {
      properties.push({ id: "knurlAngle", label: t("prop.knurlAngle"), value: knurl.angle, min: MIN_KNURL_ANGLE, max: MAX_KNURL_ANGLE, step: 1, onChange: (value) => onUpdate({ knurlAngle: normalizeKnurlAngle(value) }) });
    }
    return properties;
  }

  if (shape.kind === "cylinder") {
    return [
      { id: "sides", label: t("prop.sides"), value: shape.sides ?? 96, min: 3, max: MAX_HIGH_RESOLUTION_SIDES, step: 1, onChange: (sides) => onUpdate({ sides: Math.round(sides) }) },
      { id: "length", label: t("prop.length"), value: depth, min: MIN_SHAPE_SIZE, max: 160, onChange: setDepth },
      { id: "width", label: t("prop.width"), value: width, min: MIN_SHAPE_SIZE, max: 160, onChange: setWidth },
      { id: "height", label: t("prop.height"), value: shape.height, min: MIN_SHAPE_SIZE, max: 160, onChange: setHeight },
    ];
  }

  if (shape.kind === "ellipse") {
    return [
      { id: "sides", label: t("prop.sides"), value: shape.sides ?? 96, min: 3, max: MAX_HIGH_RESOLUTION_SIDES, step: 1, onChange: (sides) => onUpdate({ sides: Math.round(sides) }) },
      { id: "length", label: t("prop.length"), value: depth, min: MIN_SHAPE_SIZE, max: 160, onChange: setDepth },
      { id: "width", label: t("prop.width"), value: width, min: MIN_SHAPE_SIZE, max: 160, onChange: setWidth },
      { id: "height", label: t("prop.height"), value: shape.height, min: MIN_SHAPE_SIZE, max: 160, onChange: setHeight },
    ];
  }

  if (shape.kind === "polygon") {
    return [
      {
        id: "sides",
        label: t("prop.sides"),
        value: shape.sides ?? 6,
        min: 3,
        max: 24,
        step: 1,
        onChange: (value) => {
          // A pentagon has a different width-to-depth ratio than a hexagon.
          // Without carrying it along, switching turns the regular polygon
          // into a squashed one.
          const nextSides = Math.round(value);
          const current = regularPolygonAspect(shape.sides ?? 6);
          const next = regularPolygonAspect(nextSides);
          const nextWidth = Math.max(MIN_SHAPE_SIZE, (width / current.width) * next.width);
          const nextDepth = Math.max(MIN_SHAPE_SIZE, (depth / current.depth) * next.depth);
          onUpdate({ sides: nextSides, width: nextWidth, depth: nextDepth, size: resizedShapeSize(nextWidth, nextDepth) });
        },
      },
      { id: "length", label: t("prop.length"), value: depth, min: MIN_SHAPE_SIZE, max: 160, onChange: setDepth },
      { id: "width", label: t("prop.width"), value: width, min: MIN_SHAPE_SIZE, max: 160, onChange: setWidth },
      { id: "height", label: t("prop.height"), value: shape.height, min: MIN_SHAPE_SIZE, max: 160, onChange: setHeight },
    ];
  }

  if (shape.kind === "ruler") {
    // Only the length can be set - the ruler's cross width and thickness are fixed.
    return [
      { id: "length", label: t("prop.length"), value: width, min: 30, max: 500, onChange: setWidth },
    ];
  }

  if (shape.kind === "spring") {
    const across = Math.max(width, depth);
    const settings = springSettings(shape, across, shape.height);
    const wireLimits = springWireLimits(across, shape.height);
    const turnLimits = springTurnLimits(across, shape.height, settings.wire);
    // Wire and turns hang on the dimensions: a flatter spring carries fewer
    // turns, a thinner one less wire. Dragging a size therefore moves them
    // into their new limits instead of showing a body running through itself.
    const fit = (nextWidth: number, nextDepth: number, nextHeight: number) => {
      const reach = Math.max(nextWidth, nextDepth);
      const wire = normalizeSpringWire(settings.wire, reach, nextHeight);
      return { springWire: wire, springTurns: normalizeSpringTurns(settings.turns, reach, nextHeight, wire) };
    };
    return [
      {
        id: "turns",
        label: t("prop.turns"),
        value: settings.turns,
        min: turnLimits.min,
        max: turnLimits.max,
        step: 1,
        onChange: (turns) => onUpdate({ springTurns: normalizeSpringTurns(turns, across, shape.height, settings.wire) }),
      },
      {
        id: "wire",
        label: t("prop.wire"),
        value: settings.wire,
        min: wireLimits.min,
        max: wireLimits.max,
        step: 0.1,
        onChange: (value) => {
          const wire = normalizeSpringWire(value, across, shape.height);
          onUpdate({ springWire: wire, springTurns: normalizeSpringTurns(settings.turns, across, shape.height, wire) });
        },
      },
      {
        id: "quality",
        label: t("prop.quality"),
        value: settings.quality,
        min: MIN_SPRING_QUALITY,
        max: MAX_SPRING_QUALITY,
        step: 4,
        onChange: (quality) => onUpdate({ springQuality: normalizeSpringQuality(quality) }),
      },
      {
        id: "length",
        label: t("prop.length"),
        value: depth,
        min: MIN_SHAPE_SIZE,
        max: 160,
        onChange: (value) => onUpdate({ depth: value, size: resizedShapeSize(width, value), ...fit(width, value, shape.height) }, { resizeAxis: "depth" }),
      },
      {
        id: "width",
        label: t("prop.width"),
        value: width,
        min: MIN_SHAPE_SIZE,
        max: 160,
        onChange: (value) => onUpdate({ width: value, size: resizedShapeSize(value, depth), ...fit(value, depth, shape.height) }, { resizeAxis: "width" }),
      },
      {
        id: "height",
        label: t("prop.height"),
        value: shape.height,
        min: MIN_SHAPE_SIZE,
        max: 160,
        onChange: (value) => onUpdate({ height: value, ...fit(width, depth, value) }, { resizeAxis: "height" }),
      },
    ];
  }

  if (shape.kind === "thread") {
    return threadProperties(shape, onUpdate);
  }

  if (shape.kind === "sphere") {
    return [
      { id: "steps", label: t("prop.steps"), value: shape.steps ?? 24, min: 6, max: MAX_HIGH_RESOLUTION_STEPS, step: 1, onChange: (steps) => onUpdate({ steps: Math.round(steps) }) },
      { id: "length", label: t("prop.length"), value: depth, min: MIN_SHAPE_SIZE, max: 160, onChange: setDepth },
      { id: "width", label: t("prop.width"), value: width, min: MIN_SHAPE_SIZE, max: 160, onChange: setWidth },
      { id: "height", label: t("prop.height"), value: shape.height, min: MIN_SHAPE_SIZE, max: 160, onChange: setHeight },
    ];
  }

  if (shape.kind === "halfSphere") {
    return [
      { id: "steps", label: t("prop.steps"), value: shape.steps ?? 32, min: 6, max: MAX_HIGH_RESOLUTION_STEPS, step: 1, onChange: (steps) => onUpdate({ steps: Math.round(steps) }) },
      { id: "length", label: t("prop.length"), value: depth, min: MIN_SHAPE_SIZE, max: 160, onChange: setDepth },
      { id: "width", label: t("prop.width"), value: width, min: MIN_SHAPE_SIZE, max: 160, onChange: setWidth },
      { id: "height", label: t("prop.height"), value: shape.height, min: MIN_SHAPE_SIZE, max: 160, onChange: setHeight },
    ];
  }

  if (shape.kind === "cone") {
    return [
      { id: "topRadius", label: t("prop.topRadius"), value: shape.topRadius ?? 0, min: 0, max: 40, onChange: (topRadius) => onUpdate({ topRadius }) },
      { id: "baseRadius", label: t("prop.baseRadius"), value: shape.baseRadius ?? baseWidth / 2, min: MIN_SHAPE_SIZE, max: 80, onChange: setBaseRadius },
      { id: "length", label: t("prop.length"), value: depth, min: MIN_SHAPE_SIZE, max: 160, onChange: setDepth },
      { id: "width", label: t("prop.width"), value: width, min: MIN_SHAPE_SIZE, max: 160, onChange: setConeWidth },
      { id: "height", label: t("prop.height"), value: shape.height, min: MIN_SHAPE_SIZE, max: 160, onChange: setHeight },
      { id: "sides", label: t("prop.sides"), value: shape.sides ?? 96, min: 3, max: MAX_HIGH_RESOLUTION_SIDES, step: 1, onChange: (sides) => onUpdate({ sides: Math.round(sides) }) },
    ];
  }

  if (shape.kind === "pyramid") {
    // Null oben heisst Spitze. Alles darueber schneidet sie ab - das ist
    // dasselbe, was die Verjuengung bei den uebrigen Koerpern tut, nur kann
    // sie es hier nicht: die Spitze liegt auf der Achse, und ein Vielfaches
    // von null bleibt null.
    return [
      { id: "sides", label: t("prop.sides"), value: shape.sides ?? 4, min: 3, max: 24, step: 1, onChange: (sides) => onUpdate({ sides: Math.round(sides) }) },
      { id: "length", label: t("prop.length"), value: depth, min: MIN_SHAPE_SIZE, max: 160, onChange: setDepth },
      { id: "width", label: t("prop.width"), value: width, min: MIN_SHAPE_SIZE, max: 160, onChange: setWidth },
      { id: "height", label: t("prop.height"), value: shape.height, min: MIN_SHAPE_SIZE, max: 160, onChange: setHeight },
      {
        id: "topLength",
        label: t("prop.topLength"),
        value: normalizePyramidTop(shape.topDepth, depth),
        min: 0,
        max: 160,
        onChange: (topDepth) => onUpdate({ topDepth: normalizePyramidTop(topDepth, depth) }),
      },
      {
        id: "topWidth",
        label: t("prop.topWidth"),
        value: normalizePyramidTop(shape.topWidth, width),
        min: 0,
        max: 160,
        onChange: (topWidth) => onUpdate({ topWidth: normalizePyramidTop(topWidth, width) }),
      },
    ];
  }

  if (shape.kind === "roundRoof") {
    return [
      { id: "sides", label: t("prop.sides"), value: shape.sides ?? 64, min: 4, max: MAX_HIGH_RESOLUTION_SIDES, step: 1, onChange: (sides) => onUpdate({ sides: Math.round(sides) }) },
      { id: "length", label: t("prop.length"), value: depth, min: MIN_SHAPE_SIZE, max: 160, onChange: setDepth },
      { id: "width", label: t("prop.width"), value: width, min: MIN_SHAPE_SIZE, max: 160, onChange: setWidth },
      { id: "height", label: t("prop.height"), value: shape.height, min: MIN_SHAPE_SIZE, max: 160, onChange: setHeight },
    ];
  }

  if (shape.kind === "tube" || shape.kind === "ring") {
    return [
      { id: "thickness", label: t("prop.thickness"), value: shape.bevel ?? 4, min: 0.5, max: 20, onChange: (bevel) => onUpdate({ bevel }) },
      // Gleich unter der Wand: Wer eine Buchse fuer eine Welle braucht, kennt
      // diesen Durchmesser, nicht die Wand. Er setzt die Wand.
      {
        id: "innerDiameter",
        label: t("prop.innerDiameter"),
        value: tubeInnerDiameter(shape.bevel ?? 4, width, depth),
        min: 0,
        max: maxTubeInnerDiameter(width),
        step: 0.1,
        onChange: (inner) => {
          const bevel = tubeWallForInnerDiameter(inner, width, depth);
          if (bevel !== null) onUpdate({ bevel });
        },
      },
      { id: "length", label: t("prop.length"), value: depth, min: MIN_SHAPE_SIZE, max: 160, onChange: setDepth },
      { id: "width", label: t("prop.width"), value: width, min: MIN_SHAPE_SIZE, max: 160, onChange: setWidth },
      { id: "height", label: t("prop.height"), value: shape.height, min: MIN_SHAPE_SIZE, max: 160, onChange: setHeight },
    ];
  }

  /*
   * Die drei Bohrformen.
   *
   * Sie tragen alle den Seitenregler: Mit wenigen Seiten wird aus der Bohrung
   * ein Vielkant - ein Sechskant fuer eine Mutter, ein Achtkant als
   * Verdrehsicherung -, mit vielen bleibt sie rund.
   */
  if (shape.kind === "counterbore" || shape.kind === "countersink") {
    const headDiameter = normalizeBoreHeadDiameter(shape.boreHeadDiameter, width);
    const properties: ShapePropertyConfig[] = [
      {
        id: "boreHeadDiameter",
        label: t("prop.boreHeadDiameter"),
        value: headDiameter,
        min: width * 1.05,
        max: width * 6,
        step: 0.1,
        onChange: (value) => onUpdate({ boreHeadDiameter: normalizeBoreHeadDiameter(value, width) }),
      },
    ];
    if (shape.kind === "counterbore") {
      properties.push({
        id: "boreHeadDepth",
        label: t("prop.boreHeadDepth"),
        value: normalizeBoreHeadDepth(shape.boreHeadDepth, shape.height),
        min: shape.height * 0.02,
        max: shape.height * 0.95,
        step: 0.1,
        onChange: (value) => onUpdate({ boreHeadDepth: normalizeBoreHeadDepth(value, shape.height) }),
      });
    } else {
      properties.push({
        id: "boreHeadAngle",
        label: t("prop.boreHeadAngle"),
        value: normalizeCountersinkAngle(shape.boreHeadAngle),
        min: MIN_COUNTERSINK_ANGLE,
        max: MAX_COUNTERSINK_ANGLE,
        step: 1,
        onChange: (value) => onUpdate({ boreHeadAngle: normalizeCountersinkAngle(value) }),
      });
    }
    properties.push(
      {
        id: "sides",
        label: t("prop.sides"),
        value: normalizeBoreSides(shape.sides),
        min: MIN_BORE_SIDES,
        max: MAX_BORE_SIDES,
        step: 1,
        onChange: (value) => onUpdate({ sides: normalizeBoreSides(value) }),
      },
      // Breite heisst hier Schaftdurchmesser: Der Kopf folgt ihm, damit er
      // nicht ploetzlich schmaler als der Schaft ist.
      {
        id: "width",
        label: t("prop.boreShaft"),
        value: width,
        min: MIN_SHAPE_SIZE,
        max: 160,
        onChange: (value) => onUpdate({
          width: value,
          depth: value,
          size: resizedShapeSize(value, value),
          boreHeadDiameter: normalizeBoreHeadDiameter(shape.boreHeadDiameter, value),
        }, { resizeAxis: "width" }),
      },
      {
        id: "height",
        label: t("prop.boreDepth"),
        value: shape.height,
        min: MIN_SHAPE_SIZE,
        max: 160,
        onChange: (value) => onUpdate({
          height: value,
          ...(shape.kind === "counterbore" ? { boreHeadDepth: normalizeBoreHeadDepth(shape.boreHeadDepth, value) } : {}),
        }, { resizeAxis: "height" }),
      },
    );
    return properties;
  }

  if (shape.kind === "teardrop") {
    const tipAngle = normalizeTeardropTipAngle(shape.boreTipAngle);
    return [
      {
        id: "boreTipAngle",
        label: t("prop.boreTipAngle"),
        value: tipAngle,
        min: MIN_TEARDROP_TIP_ANGLE,
        max: MAX_TEARDROP_TIP_ANGLE,
        step: 1,
        onChange: (value) => {
          const next = normalizeTeardropTipAngle(value);
          // Die Tiefe haengt am Winkel: eine spitzere Spitze steht hoeher.
          onUpdate({ boreTipAngle: next, depth: teardropDepthFor(width, next) });
        },
      },
      {
        id: "sides",
        label: t("prop.sides"),
        value: normalizeBoreSides(shape.sides),
        min: MIN_BORE_SIDES,
        max: MAX_BORE_SIDES,
        step: 1,
        onChange: (value) => onUpdate({ sides: normalizeBoreSides(value) }),
      },
      {
        id: "width",
        label: t("prop.boreHole"),
        value: width,
        min: MIN_SHAPE_SIZE,
        max: 160,
        onChange: (value) => onUpdate({
          width: value,
          depth: teardropDepthFor(value, tipAngle),
          size: resizedShapeSize(value, value),
        }, { resizeAxis: "width" }),
      },
      {
        id: "height",
        label: t("prop.boreLength"),
        value: shape.height,
        min: MIN_SHAPE_SIZE,
        max: 300,
        onChange: setHeight,
      },
    ];
  }

  if (shape.kind === "gear" && normalizeGearProfile(shape.gearProfile) !== "simple") {
    /*
     * Ein Evolventenrad wird nach Modul und Zaehnezahl eingestellt, wie bei
     * jedem Zahnradrechner - seine Groesse folgt daraus (Aussendurchmesser =
     * Modul x (Zaehne + 2)) und nicht umgekehrt. Darum gibt es hier keine
     * Breite und keine Tiefe: Wer daran zieht, aendert das Modul, und das
     * steht als eigene Zahl da.
     *
     * Zahngroesse und Zahnbreite entfallen ebenso - die gehoeren zu den
     * geraden Zaehnen, die ihre Form nicht aus dem Modul nehmen.
     */
    const profile = normalizeGearProfile(shape.gearProfile);
    const round = profile === "round";
    // Beide Zahnformen folgen dem Modul; nur der Kopf steht bei den runden
    // niedriger, also gehoert zu ihnen ein anderer Aussendurchmesser.
    const measures = round ? roundGearMeasures(width, shape) : involuteGearMeasures(width, shape);
    const teeth = measures.teeth;
    const centerHoleLimits = gearCenterHoleLimits(width, depth, normalizeGearToothSize(shape.toothSize, width, depth));
    const resized = (module: number, nextTeeth: number, nextProfile = profile) => {
      const diameter = involuteGearDiameter(module, nextTeeth, nextProfile);
      return {
        teeth: nextTeeth,
        width: diameter,
        depth: diameter,
        size: diameter,
        // Das Spiel haengt am Modul (hoechstens ein halbes) und rueckt mit.
        gearBacklash: normalizeGearBacklash(shape.gearBacklash, module),
        centerHoleSize: normalizeGearCenterHoleSize(shape.centerHoleSize, diameter, diameter, normalizeGearToothSize(shape.toothSize, diameter, diameter)),
      };
    };
    return [
      {
        type: "select",
        id: "gearProfile",
        label: t("inspector.gearProfile"),
        value: profile,
        options: [
          { value: "involute", label: t("gear.profileInvolute") },
          { value: "round", label: t("gear.profileRound") },
          { value: "simple", label: t("gear.profileSimple") },
        ],
        /*
         * Beim Umstellen bleibt das Modul und die Groesse rueckt mit: Runde
         * Zaehne stehen niedriger, ihr Aussendurchmesser ist Modul x
         * (Zaehne + 1,2) statt (Zaehne + 2). Wer nur die Zahnform tauschte,
         * haette sonst ein anderes Modul - und damit ein Rad, das zu keinem
         * anderen mehr passt.
         */
        onChange: (value) => {
          const next = normalizeGearProfile(value);
          if (next === "simple") {
            onUpdate({ gearProfile: next });
            return;
          }
          onUpdate({ gearProfile: next, ...resized(measures.module, teeth, next) }, { resizeAxis: "width" });
        },
      },
      {
        id: "module",
        label: t("prop.gearModule"),
        value: measures.module,
        min: MIN_GEAR_MODULE,
        max: MAX_GEAR_MODULE,
        step: 0.1,
        onChange: (value) => onUpdate(resized(normalizeGearModule(value), teeth), { resizeAxis: "width" }),
      },
      {
        id: "teeth",
        label: t("inspector.teeth"),
        value: teeth,
        min: MIN_GEAR_TEETH,
        max: MAX_GEAR_TEETH,
        step: 1,
        onChange: (value) => onUpdate(resized(measures.module, normalizeGearTeeth(value)), { resizeAxis: "width" }),
      },
      ...(round ? [] : [{
        id: "pressureAngle",
        label: t("prop.gearPressureAngle"),
        value: normalizeGearPressureAngle(shape.gearPressureAngle),
        min: MIN_GEAR_PRESSURE_ANGLE,
        max: MAX_GEAR_PRESSURE_ANGLE,
        step: 0.5,
        onChange: (gearPressureAngle: number) => onUpdate({ gearPressureAngle }),
      }]),
      {
        id: "backlash",
        label: t("prop.gearBacklash"),
        value: normalizeGearBacklash(shape.gearBacklash, measures.module),
        min: 0,
        max: Math.min(MAX_GEAR_BACKLASH, measures.module * 0.5),
        step: 0.05,
        onChange: (gearBacklash) => onUpdate({ gearBacklash }),
      },
      {
        id: "centerHole",
        label: t("prop.centerHole"),
        value: normalizeGearCenterHoleSize(shape.centerHoleSize, width, depth, normalizeGearToothSize(shape.toothSize, width, depth)),
        min: centerHoleLimits.min,
        max: centerHoleLimits.max,
        step: 0.1,
        onChange: (centerHoleSize) => onUpdate({ centerHoleSize }),
      },
      { id: "height", label: t("prop.height"), value: shape.height, min: MIN_SHAPE_SIZE, max: 160, onChange: setHeight },
    ];
  }

  if (shape.kind === "gear") {
    const setGearWidth = (value: number) => {
      const toothSize = normalizeGearToothSize(shape.toothSize, value, depth);
      const toothWidth = normalizeGearToothWidth(shape.toothWidth, value, depth, shape.teeth);
      const centerHoleSize = normalizeGearCenterHoleSize(shape.centerHoleSize, value, depth, toothSize);
      onUpdate({ width: value, size: resizedShapeSize(value, depth), toothSize, toothWidth, centerHoleSize }, { resizeAxis: "width" });
    };
    const setGearDepth = (value: number) => {
      const toothSize = normalizeGearToothSize(shape.toothSize, width, value);
      const toothWidth = normalizeGearToothWidth(shape.toothWidth, width, value, shape.teeth);
      const centerHoleSize = normalizeGearCenterHoleSize(shape.centerHoleSize, width, value, toothSize);
      onUpdate({ depth: value, size: resizedShapeSize(width, value), toothSize, toothWidth, centerHoleSize }, { resizeAxis: "depth" });
    };
    const teeth = shape.teeth ?? DEFAULT_GEAR_TEETH;
    const toothPitch = gearToothPitch(width, depth, teeth);
    const toothSize = normalizeGearToothSize(shape.toothSize ?? DEFAULT_GEAR_TOOTH_SIZE, width, depth);
    const centerHoleLimits = gearCenterHoleLimits(width, depth, toothSize);
    const properties: ShapePropertyConfig[] = [
      {
        type: "select",
        id: "gearProfile",
        label: t("inspector.gearProfile"),
        value: "simple",
        options: [
          { value: "involute", label: t("gear.profileInvolute") },
          { value: "simple", label: t("gear.profileSimple") },
        ],
        onChange: (value) => onUpdate({ gearProfile: normalizeGearProfile(value) }),
      },
      {
        id: "teeth",
        label: t("inspector.teeth"),
        value: teeth,
        min: 6,
        max: 64,
        step: 1,
        onChange: (value) => {
          const nextTeeth = Math.round(value);
          onUpdate({
            teeth: nextTeeth,
            toothWidth: normalizeGearToothWidth(shape.toothWidth, width, depth, nextTeeth),
          });
        },
      },
      {
        id: "toothSize",
        label: t("prop.toothSize"),
        value: toothSize,
        min: 0.2,
        max: Math.max(0.2, Math.min(width, depth) * 0.22),
        step: 0.1,
        onChange: (nextToothSize) => onUpdate({
          toothSize: nextToothSize,
          centerHoleSize: normalizeGearCenterHoleSize(shape.centerHoleSize, width, depth, nextToothSize),
        }),
      },
      {
        id: "toothWidth",
        label: t("prop.toothWidth"),
        value: normalizeGearToothWidth(shape.toothWidth, width, depth, teeth),
        min: toothPitch * 0.12,
        max: toothPitch * 0.82,
        step: 0.1,
        onChange: (toothWidth) => onUpdate({ toothWidth }),
      },
    ];
    if (normalizeGearType(shape.gearType) === "helical") {
      properties.push({
        id: "helixAngle",
        label: t("prop.helixAngle"),
        value: normalizeGearHelixAngle(shape.helixAngle ?? DEFAULT_GEAR_HELIX_ANGLE),
        min: MIN_GEAR_HELIX_ANGLE,
        max: MAX_GEAR_HELIX_ANGLE,
        step: 1,
        onChange: (helixAngle) => onUpdate({ helixAngle }),
      });
      properties.push({
        id: "quality",
        label: t("prop.quality"),
        value: normalizeGearHelixQuality(shape.helixQuality ?? DEFAULT_GEAR_HELIX_QUALITY),
        min: MIN_GEAR_HELIX_QUALITY,
        max: MAX_GEAR_HELIX_QUALITY,
        step: 1,
        onChange: (helixQuality) => onUpdate({ helixQuality: Math.round(helixQuality) }),
      });
    }
    properties.push(
      {
        id: "centerHole",
        label: t("prop.centerHole"),
        value: normalizeGearCenterHoleSize(shape.centerHoleSize, width, depth, toothSize),
        min: centerHoleLimits.min,
        max: centerHoleLimits.max,
        step: 0.1,
        onChange: (centerHoleSize) => onUpdate({ centerHoleSize }),
      },
      { id: "length", label: t("prop.length"), value: depth, min: MIN_SHAPE_SIZE, max: 160, onChange: setGearDepth },
      { id: "width", label: t("prop.width"), value: width, min: MIN_SHAPE_SIZE, max: 160, onChange: setGearWidth },
      { id: "height", label: t("prop.height"), value: shape.height, min: MIN_SHAPE_SIZE, max: 160, onChange: setHeight },
    );
    return properties;
  }

  if (shape.kind === "honeycomb") {
    /*
     * Ein Lueftungsgitter aus Sechsecken: Wabengroesse, Stegbreite und die
     * Breite des geschlossenen Rahmens aussen herum. Alles drei in
     * Millimetern - so, wie man es beim Drucken auch misst.
     */
    return [
      {
        id: "honeycombCellSize",
        label: t("prop.honeycombCellSize"),
        value: shape.honeycombCellSize ?? DEFAULT_HONEYCOMB_CELL_SIZE,
        min: 3,
        max: 25,
        step: 0.5,
        onChange: (value) => onUpdate({ honeycombCellSize: normalizeHoneycombCellSize(value) }),
      },
      {
        id: "honeycombWallThickness",
        label: t("prop.honeycombWallThickness"),
        value: shape.honeycombWallThickness ?? DEFAULT_HONEYCOMB_WALL_THICKNESS,
        min: 0.8,
        max: 5,
        step: 0.1,
        onChange: (value) => onUpdate({ honeycombWallThickness: normalizeHoneycombWallThickness(value) }),
      },
      {
        id: "honeycombFrameWidth",
        label: t("prop.honeycombFrameWidth"),
        value: shape.honeycombFrameWidth ?? DEFAULT_HONEYCOMB_FRAME_WIDTH,
        min: 0,
        max: 15,
        step: 0.5,
        onChange: (value) => onUpdate({ honeycombFrameWidth: normalizeHoneycombFrameWidth(value) }),
      },
      { id: "length", label: t("prop.length"), value: depth, min: MIN_SHAPE_SIZE, max: 200, onChange: setDepth },
      { id: "width", label: t("prop.width"), value: width, min: MIN_SHAPE_SIZE, max: 200, onChange: setWidth },
      { id: "height", label: t("prop.height"), value: shape.height, min: MIN_SHAPE_SIZE, max: 160, onChange: setHeight },
    ];
  }

  if (shape.kind === "roundedBox") {
    /*
     * Zwei getrennte Rundungen: die vier aufrechten Kanten und die Kanten an
     * Deckel und Boden. Beide bleiben in Millimetern stehen, wenn das Objekt
     * groesser oder kleiner gezogen wird - nur die geraden Stuecke dazwischen
     * werden laenger. Genau darum geht es bei dieser Form.
     */
    const maxCornerFillet = Math.max(1, Math.min(width, depth) / 2);
    const maxTopBottomFillet = Math.max(1, shape.height / 2);
    return [
      {
        id: "cornerFillet",
        label: t("prop.cornerFillet"),
        value: shape.cornerFillet ?? DEFAULT_ROUNDED_BOX_CORNER_FILLET,
        min: 0,
        max: maxCornerFillet,
        step: 0.1,
        onChange: (value) => onUpdate({ cornerFillet: normalizeCornerFillet(value, Math.min(width, depth) / 2) }),
      },
      {
        id: "topBottomFillet",
        label: t("prop.topBottomFillet"),
        value: shape.topBottomFillet ?? DEFAULT_ROUNDED_BOX_TOP_BOTTOM_FILLET,
        min: 0,
        max: maxTopBottomFillet,
        step: 0.1,
        onChange: (value) => onUpdate({ topBottomFillet: normalizeTopBottomFillet(value, shape.height / 2) }),
      },
      {
        id: "roundedBoxQuality",
        label: t("prop.quality"),
        value: shape.roundedBoxQuality ?? DEFAULT_ROUNDED_BOX_QUALITY,
        min: MIN_ROUNDED_BOX_QUALITY,
        max: MAX_ROUNDED_BOX_QUALITY,
        step: 1,
        onChange: (value) => onUpdate({ roundedBoxQuality: normalizeRoundedBoxQuality(value) }),
      },
    ];
  }

  if (shape.kind === "loft") {
    const settings = loftSettings(shape);
    const topWidth = shape.loftTopWidth ?? width;
    const topDepth = shape.loftTopDepth ?? depth;
    // Top is an independent end (like cone's Top Radius) -- its size never touches the shape's
    // own width/depth. Bottom's size *is* the shape's generic width/depth, so the on-canvas
    // resize gizmo (which always drags width/depth/height) keeps working for it unmodified.
    //
    // With that axis linked, editing the top drives the whole group: the factor
    // comes from the top's own before/after, and setAxis then carries the near
    // end and any other linked axis by the same amount (axisPatch takes the far
    // end along, so the typed value lands where the user put it).
    const setLoftTop = (axis: "width" | "depth", value: number) => {
      const current = axis === "width" ? topWidth : topDepth;
      if (!resizeAxisIsLinked(axis, linkedAxes)) {
        onUpdate({ [axis === "width" ? "loftTopWidth" : "loftTopDepth"]: value }, { resizeAxis: axis });
        return;
      }
      const factor = value / Math.max(MIN_SHAPE_SIZE, current);
      setAxis(axis, (axis === "width" ? width : depth) * factor);
    };
    const properties: ShapePropertyConfig[] = [
      { type: "select", id: "topShape", label: t("prop.topShape"), value: settings.topShape, options: loftShapeOptions(), onChange: (value) => onUpdate({ loftTopShape: value as LoftProfileShape }) },
    ];
    if (!isPolygonLoftShape(settings.topShape)) {
      properties.push({ id: "topLength", label: t("prop.topLength"), value: topDepth, min: MIN_SHAPE_SIZE, max: 160, onChange: (value) => setLoftTop("depth", value) });
    }
    properties.push(
      { id: "topWidth", label: t("prop.topWidth"), value: topWidth, min: MIN_SHAPE_SIZE, max: 160, onChange: (value) => setLoftTop("width", value) },
      { id: "topRotation", label: t("prop.topRotation"), value: settings.topRotation, min: 0, max: 359, step: 1, onChange: (value) => onUpdate({ loftTopRotation: value }) },
      { type: "select", id: "bottomShape", label: t("prop.bottomShape"), value: settings.bottomShape, options: loftShapeOptions(), onChange: (value) => onUpdate({ loftBottomShape: value as LoftProfileShape }) },
    );
    if (!isPolygonLoftShape(settings.bottomShape)) {
      properties.push({ id: "bottomLength", label: t("prop.bottomLength"), value: depth, min: MIN_SHAPE_SIZE, max: 160, onChange: setDepth });
    }
    properties.push(
      { id: "bottomWidth", label: t("prop.bottomWidth"), value: width, min: MIN_SHAPE_SIZE, max: 160, onChange: setWidth },
      { id: "bottomRotation", label: t("prop.bottomRotation"), value: settings.bottomRotation, min: 0, max: 359, step: 1, onChange: (value) => onUpdate({ loftBottomRotation: value }) },
      { id: "segments", label: t("prop.segments"), value: settings.segments, min: MIN_LOFT_SEGMENTS, max: MAX_LOFT_SEGMENTS, step: 1, onChange: (value) => onUpdate({ loftSegments: Math.round(value) }) },
      { id: "layers", label: t("prop.layers"), value: settings.layers, min: MIN_LOFT_LAYERS, max: MAX_LOFT_LAYERS, step: 1, onChange: (value) => onUpdate({ loftLayers: Math.round(value) }) },
      { id: "height", label: t("prop.height"), value: shape.height, min: MIN_SHAPE_SIZE, max: 160, onChange: setHeight },
    );
    return properties;
  }

  if (shape.kind === "text") {
    return [
      {
        type: "text",
        id: "text",
        label: t("shape.text"),
        value: shape.text ?? "TEXT",
        onChange: (text) => {
          const nextText = text.slice(0, 24) || " ";
          const nextWidth = clamp(Math.max(Math.min(46, textWidthMax), nextText.length * 19), MIN_SHAPE_SIZE, textWidthMax);
          onUpdate({ text: nextText, width: nextWidth, size: nextWidth });
        },
      },
      { type: "select", id: "font", label: t("prop.font"), value: shape.font ?? "Multilanguage", options: TEXT_FONT_OPTIONS, onChange: (font) => onUpdate({ font }) },
      { id: "height", label: t("prop.height"), value: shape.height, min: MIN_SHAPE_SIZE, max: 40, onChange: setHeight },
      { id: "bevel", label: t("prop.bevel"), value: shape.bevel ?? 0, min: 0, max: 8, onChange: (bevel) => onUpdate({ bevel }) },
      { id: "segments", label: t("prop.segments"), value: shape.segments ?? 0, min: 0, max: 24, step: 1, onChange: (segments) => onUpdate({ segments: Math.round(segments) }) },
    ];
  }

  return [
    { id: "length", label: t("prop.length"), value: depth, min: MIN_SHAPE_SIZE, max: 160, onChange: setDepth },
    { id: "width", label: t("prop.width"), value: width, min: MIN_SHAPE_SIZE, max: 160, onChange: setWidth },
    { id: "height", label: t("prop.height"), value: shape.height, min: MIN_SHAPE_SIZE, max: 160, onChange: setHeight },
  ];
}

function getShapeProperties(
  shape: WorkplaneShape,
  onUpdate: ShapeInspectorUpdate,
  workspace: WorkplaneWorkspaceSettings,
  linkedAxes: LinkedResizeAxes,
): ShapePropertyConfig[] {
  const customLimit = workspace.shapeCustomizations[shape.kind]?.maxDimension;
  const properties = getShapePropertiesWithAppLimits(shape, onUpdate, customLimit ?? 260, linkedAxes, customLimit ?? 160);
  if (customLimit === undefined) return properties;
  return properties.map((property) => {
    if (property.type === "text" || property.type === "select") return property;
    if (["length", "width", "height", "threadLength"].includes(property.id)) return { ...property, max: customLimit };
    if (["topRadius", "baseRadius"].includes(property.id)) return { ...property, max: customLimit / 2 };
    return property;
  });
}

export function ShapeInspector({
  shape,
  referencePoint,
  snap,
  snapOpen,
  workspace,
  onUpdate,
  onSnapChange,
  onSnapOpenChange,
  onEditSketch,
  canSeparateParts = false,
  onSeparateParts,
  surfaceTexture,
  onInteractionActiveChange,
  onSnapGridAwayChange,
  linkedAxes = NO_LINKED_RESIZE_AXES,
  onLinkedAxesChange,
  regionShape = null,
  resizeRegion = null,
  onResizeRegionChange,
  onRegionTaper,
}: {
  shape: WorkplaneShape;
  referencePoint: { x: number; y: number; z: number };
  snap: GridSize;
  snapOpen: boolean;
  workspace: WorkplaneWorkspaceSettings;
  onUpdate: ShapeInspectorUpdate;
  linkedAxes?: LinkedResizeAxes;
  onLinkedAxesChange?: (next: LinkedResizeAxes) => void;
  // While set, the viewport handles resize this box inside the shape rather
  // than the shape; the inspector is where the box itself is placed.
  /**
   * Der Koerper, in dessen Netz der Kasten des Teilbereichs lebt. `shape`
   * traegt die Urform darin und beschreibt nach einer Drehung einen ganz
   * anderen Rahmen; fuer den Kasten zaehlt nur dieser hier.
   */
  regionShape?: WorkplaneShape | null;
  resizeRegion?: ResizeRegion | null;
  onResizeRegionChange?: (region: ResizeRegion) => void;
  /** Die Verjuengung auf den Teilbereich legen - sie wird sofort ins Netz gerechnet. */
  onRegionTaper?: (taper: RegionTaper) => void;
  onSnapChange: Dispatch<SetStateAction<GridSize>>;
  onSnapOpenChange: Dispatch<SetStateAction<boolean>>;
  onEditSketch?: () => void;
  canSeparateParts?: boolean;
  onSeparateParts?: () => void;
  /** Die Karte der Oberflaechenstruktur; nur fuer einen einzelnen Koerper gegeben. */
  surfaceTexture?: SurfaceTextureCardProps;
  onInteractionActiveChange?: (active: boolean) => void;
  /**
   * Meldet, dass der Fangregler hier gerade nicht zu erreichen ist - dann
   * zeigt ihn die Arbeitsebene, so wie bei nichts Ausgewaehltem.
   */
  onSnapGridAwayChange?: (away: boolean) => void;
}) {
  // Redraws the panel when the language changes: every label below comes from
  // t(), which reads a module-level store that React does not watch by itself.
  useLanguage();
  const solidColor = shape.color;
  const locked = Boolean(shape.locked);
  // "Length" is this UI's name for the depth axis.
  // A loft names its two ends explicitly, but both sit on the same two axes -
  // one width axis, one depth axis - so both rows show and toggle the same
  // link. Only this list gets toggles; the taper rows share these labels but
  // are built separately and are not link-aware.
  const axisForProperty: Record<string, ResizeAxis> = {
    width: "width",
    length: "depth",
    height: "height",
    topWidth: "width",
    bottomWidth: "width",
    topLength: "depth",
    bottomLength: "depth",
  };
  const withLinkToggles = (list: ShapePropertyConfig[]) => list.map((property) => {
    const axis = property.type === "text" || property.type === "select" ? undefined : axisForProperty[property.id];
    if (!axis || !onLinkedAxesChange) return property;
    return {
      ...property,
      link: {
        axis,
        linked: linkedAxes[axis],
        active: resizeAxisIsLinked(axis, linkedAxes),
        onToggle: () => onLinkedAxesChange({ ...linkedAxes, [axis]: !linkedAxes[axis] }),
      },
    };
  });
  const properties = withLinkToggles(getShapeProperties(shape, onUpdate, workspace, linkedAxes));
  /**
   * Eine Rechnung merken oder vergessen. Sie geht denselben Weg wie jede
   * andere Aenderung der Form - damit faellt sie mit in die Datei, und ein
   * Rueckgaengig nimmt Wert und Rechnung zusammen.
   */
  const rememberFormula = (key: string, formula: string | null) => {
    const patch = measurementFormulasPatch(shape.measurementFormulas, key, formula);
    if (patch === null) return;
    onUpdate({ measurementFormulas: patch });
  };
  const gearType = shape.kind === "gear" ? normalizeGearType(shape.gearType) : null;
  const primaryProperties = shape.kind === "gear"
    ? properties.filter((property) => ["gearProfile", "centerHole", "length", "width", "height"].includes(property.id))
    : properties;
  const gearTeethProperties = shape.kind === "gear"
    ? properties.filter((property) => ["module", "teeth", "toothSize", "toothWidth", "pressureAngle", "backlash"].includes(property.id))
    : [];
  const gearHelixProperties = shape.kind === "gear"
    ? properties.filter((property) => ["helixAngle", "quality"].includes(property.id))
    : [];
  const taper = shapeTaperDimensions(shape);
  const taperDimensionMax = workspace.shapeCustomizations[shape.kind]?.maxDimension ?? 480;
  /*
   * Drall und Versatz gelten an denselben Koerpern wie die Verjuengung - ein
   * Zahnprofil, eine Gewindewendel, eine Federwindung und die Teilung eines
   * Lineals haben ihr eigenes "oben", mit dem sich das hier schlagen wuerde.
   */
  const supportsDeform = shapeSupportsExtrudeDeform(shape.kind) && shape.kind !== "reference";
  const twistProperties: ShapePropertyConfig[] = supportsDeform ? [
    {
      id: "extrudeTwist",
      label: t("prop.twist"),
      value: shape.extrudeTwist ?? 0,
      min: -720,
      max: 720,
      step: 1,
      onChange: (extrudeTwist) => onUpdate({ extrudeTwist }),
    },
    {
      id: "extrudeTopOffsetX",
      label: t("prop.widthOffset"),
      value: shape.extrudeTopOffsetX ?? 0,
      min: -80,
      max: 80,
      step: 0.5,
      onChange: (extrudeTopOffsetX) => onUpdate({ extrudeTopOffsetX }),
    },
    {
      id: "extrudeTopOffsetZ",
      label: t("prop.lengthOffset"),
      value: shape.extrudeTopOffsetZ ?? 0,
      min: -80,
      max: 80,
      step: 0.5,
      onChange: (extrudeTopOffsetZ) => onUpdate({ extrudeTopOffsetZ }),
    },
  ] : [];
  /*
   * Die Deckflaeche wird ueber ihre vier Kanten eingestellt, nicht ueber
   * Breite und Tiefe: Wer eine Seite schraeg stellen will, meint diese eine
   * Seite und nicht die Groesse der ganzen Flaeche. Dahinter stehen dieselben
   * Felder wie vorher - Groesse und Versatz -, nur anders angesehen.
   */
  const edges = shapeTopFaceEdges(shape);
  /*
   * Der Weg des Reglers richtet sich nach dem Koerper selbst: von der
   * Mittellinie aus bis zur doppelten eigenen Breite beziehungsweise Tiefe.
   * Ein fester, weiter Bereich waere hier unbrauchbar - bei einem Kasten von
   * zwanzig Millimetern sprangen schon ein paar Bildpunkte Mausweg um
   * Dutzende Millimeter, und die Deckflaeche flog zur Seite davon.
   */
  const edgeBoundX = Math.max(1, shapeWidth(shape));
  const edgeBoundZ = Math.max(1, shapeDepth(shape));
  const sideHeights = shapeSideHeights(shape);
  const taperProperties: ShapePropertyConfig[] = shape.kind === "gear" ? [] : [
    /*
     * Breite und Laenge oben fassen die Deckflaeche als Ganzes an: Sie
     * aendern ihre Groesse und lassen sie sitzen, wo sie sitzt, also wandern
     * beide Kanten gleich weit. Wer eine einzelne Seite meint, nimmt die vier
     * Kanten darunter. Beide Wege beschreiben dieselben Felder.
     */
    {
      id: "topLength",
      label: t("prop.topLength"),
      value: taper.topDepth,
      min: MIN_SHAPE_SIZE,
      max: taperDimensionMax,
      onChange: (taperTopDepth) => onUpdate({ taperTopDepth, taperTopWidth: taper.topWidth, taperTopScale: undefined }),
    },
    {
      id: "topWidth",
      label: t("prop.topWidth"),
      value: taper.topWidth,
      min: MIN_SHAPE_SIZE,
      max: taperDimensionMax,
      onChange: (taperTopWidth) => onUpdate({ taperTopWidth, taperTopDepth: taper.topDepth, taperTopScale: undefined }),
    },
    {
      id: "sideLeft",
      label: t("prop.sideLeft"),
      value: edges.left,
      min: -edgeBoundX,
      max: edgeBoundX,
      step: 0.1,
      onChange: (left) => onUpdate(shapeTopFaceEdgePatch(shape, { left })),
    },
    {
      id: "sideRight",
      label: t("prop.sideRight"),
      value: edges.right,
      min: -edgeBoundX,
      max: edgeBoundX,
      step: 0.1,
      onChange: (right) => onUpdate(shapeTopFaceEdgePatch(shape, { right })),
    },
    {
      id: "sideFront",
      label: t("prop.sideFront"),
      value: edges.front,
      min: -edgeBoundZ,
      max: edgeBoundZ,
      step: 0.1,
      onChange: (front) => onUpdate(shapeTopFaceEdgePatch(shape, { front })),
    },
    {
      id: "sideBack",
      label: t("prop.sideBack"),
      value: edges.back,
      min: -edgeBoundZ,
      max: edgeBoundZ,
      step: 0.1,
      onChange: (back) => onUpdate(shapeTopFaceEdgePatch(shape, { back })),
    },
    {
      id: "bottomLength",
      label: t("prop.bottomLength"),
      value: taper.bottomDepth,
      min: MIN_SHAPE_SIZE,
      max: taperDimensionMax,
      onChange: (taperBottomDepth) => onUpdate({ taperBottomDepth, taperBottomWidth: taper.bottomWidth, taperBottomScale: undefined }),
    },
    {
      id: "bottomWidth",
      label: t("prop.bottomWidth"),
      value: taper.bottomWidth,
      min: MIN_SHAPE_SIZE,
      max: taperDimensionMax,
      onChange: (taperBottomWidth) => onUpdate({ taperBottomWidth, taperBottomDepth: taper.bottomDepth, taperBottomScale: undefined }),
    },
  ];
  /*
   * Die Hoehe an den vier Seiten - damit wird aus dem Koerper ein Keil oder
   * eine schiefe Ebene. Abgesenkt wird nur: Die Hoehe des Koerpers bleibt
   * seine Hoehe, und die Seiten liegen darunter.
   */
  const sideHeightProperties: ShapePropertyConfig[] = shape.kind === "gear" ? [] : ([
    ["heightLeft", "left", sideHeights.left],
    ["heightRight", "right", sideHeights.right],
    ["heightFront", "front", sideHeights.front],
    ["heightBack", "back", sideHeights.back],
  ] as const).map(([id, side, value]) => ({
    id,
    label: t(`prop.${id}` as Parameters<typeof t>[0]),
    value,
    min: 0.1,
    max: Math.max(0.1, shape.height),
    step: 0.1,
    onChange: (next: number) => onUpdate(shapeSideHeightPatch(shape, { [side]: next })),
  }));
  const isSketchRevolve = shape.sketchOperation === "revolve" || Boolean(shape.sketchRevolve);
  // Absolute position on the workplane: X = shape.x, Z = shape.z (centers),
  /*
   * Die Buchstaben stehen in `axisLabels.ts`: Y laeuft nach hinten, **Z nach
   * oben** - wie im Scheibenschneider und wie im Teilen-Werkzeug. Die Felder
   * heissen weiter nach den Szenenachsen (`z` ist die Tiefe, `elevation` die
   * Hoehe); umbenannt wird nur, was man liest.
   *
   * Der Reglerbereich folgt der Arbeitsflaeche; das Zahlenfeld nimmt jeden
   * Wert (allowsAboveSliderMax), auch einen negativen.
   */
  const positionBound = Math.max(200, (workspace.width ?? 200), (workspace.depth ?? 200));
  const positionProperties: ShapePropertyConfig[] = [
    { id: "x", label: sceneAxisLetter("x"), value: shape.x ?? 0, min: -positionBound, max: positionBound, step: 0.1, onChange: (x) => onUpdate({ x }) },
    { id: "z", label: sceneAxisLetter("z"), value: shape.z ?? 0, min: -positionBound, max: positionBound, step: 0.1, onChange: (z) => onUpdate({ z }) },
    { id: "y", label: sceneAxisLetter("y"), value: shape.elevation ?? 0, min: -positionBound, max: positionBound, step: 0.1, onChange: (elevation) => onUpdate({ elevation }) },
  ];
  // Cross/marker size for the reference point only. Dedicated fields so they
  // never interfere with the width/height/depth used by real geometry.
  const crossProperties: ShapePropertyConfig[] = shape.kind === "reference"
    ? [
        { id: "crossSize", label: t("prop.crossSize"), value: shape.crossArm ?? 20, min: 1, max: 100, step: 0.5, onChange: (crossArm) => onUpdate({ crossArm }) },
        { id: "markerSize", label: t("prop.markerSize"), value: shape.markerRadius ?? 1, min: 0.1, max: 20, step: 0.1, onChange: (markerRadius) => onUpdate({ markerRadius }) },
      ]
    : [];
  // Offset to the reference point, shown below the absolute position for every
  // shape except the reference point itself.
  const isReference = shape.kind === "reference";
  const deltaToReference = isReference
    ? null
    : {
        dx: (shape.x ?? 0) - referencePoint.x,
        dy: (shape.elevation ?? 0) - referencePoint.y,
        dz: (shape.z ?? 0) - referencePoint.z,
      };
  const deltaDistance = deltaToReference
    ? Math.hypot(deltaToReference.dx, deltaToReference.dy, deltaToReference.dz)
    : 0;
  const inspectorRef = useRef<HTMLElement>(null);
  const [propertiesOpen, setPropertiesOpen] = useState(true);
  const [positionOpen, setPositionOpen] = useState(true);
  const [crossOpen, setCrossOpen] = useState(true);
  const [taperOpen, setTaperOpen] = useState(false);
  const [twistOpen, setTwistOpen] = useState(false);
  const [sideHeightOpen, setSideHeightOpen] = useState(false);
  /*
   * Die Verjuengung des Teilbereichs wird nirgends abgelegt - sie wird
   * gerechnet und ist dann Teil des Netzes. Bis zum Knopfdruck steht sie
   * also hier, und sie faengt bei dem Kasten an, der gerade dasteht.
   */
  const regionKey = resizeRegion ? Object.values(resizeRegion).join(",") : "";
  const [pendingRegionTaper, setPendingRegionTaper] = useState<RegionTaper>(
    () => untouchedRegionTaper(resizeRegion ?? { minX: 0, maxX: 1, minY: 0, maxY: 1, minZ: 0, maxZ: 1 }),
  );
  const lastRegionKey = useRef(regionKey);
  if (lastRegionKey.current !== regionKey) {
    lastRegionKey.current = regionKey;
    if (resizeRegion) setPendingRegionTaper(untouchedRegionTaper(resizeRegion));
  }
  const [gearTeethOpen, setGearTeethOpen] = useState(true);
  const [gearHelixOpen, setGearHelixOpen] = useState(true);
  const [colorOpen, setColorOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const customColorInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => onInteractionActiveChange?.(false), [onInteractionActiveChange]);
  useEffect(() => {
    const input = customColorInputRef.current;
    if (!colorOpen || !input) {
      return;
    }

    // React's color-input onChange follows the native input event and fires for
    // every movement in the picker. Commit only the native change event, which
    // fires after the user finishes choosing, so dragging stays responsive.
    const commitCustomColor = () => {
      onUpdate({ color: input.value, hole: false });
    };
    input.addEventListener("change", commitCustomColor);
    return () => input.removeEventListener("change", commitCustomColor);
  }, [colorOpen, onUpdate]);
  /*
   * Eingeklappt steckt der Fangregler mit allem anderen weg - er gehoert aber
   * zur Arbeitsebene und nicht zum Koerper. Also sagen wir es nach draussen,
   * und dort erscheint er wieder. Beim Abbau zurueck auf false, sonst bliebe
   * er doppelt stehen, wenn die Auswahl wechselt.
   */
  useEffect(() => {
    onSnapGridAwayChange?.(minimized);
    return () => onSnapGridAwayChange?.(false);
  }, [minimized, onSnapGridAwayChange]);
  useLayoutEffect(() => {
    inspectorRef.current?.scrollTo({ top: 0, left: 0 });
  }, [isSketchRevolve, shape.id]);

  return (
    <aside ref={inspectorRef} className={`shape-inspector ${isSketchRevolve ? "sketch-revolve-inspector" : ""} ${shape.kind === "gear" ? "gear-inspector" : ""} ${minimized ? "minimized" : ""}`} aria-label={t("inspector.shapeSettings", { name: shape.name })} onPointerDown={(event) => event.stopPropagation()}>
      <div className="shape-inspector-header">
        <button
          className="inspector-header-icon"
          aria-label={minimized ? t("inspector.expand") : t("inspector.minimize")}
          aria-expanded={!minimized}
          onClick={() => setMinimized((current) => !current)}
        >
          {minimized ? <ChevronDown size={26} strokeWidth={2.8} /> : <ChevronUp size={26} strokeWidth={2.8} />}
        </button>
        <strong>{shape.name}</strong>
        <div className="inspector-header-actions">
          <button className={locked ? "inspector-header-icon active" : "inspector-header-icon"} aria-label={locked ? t("inspector.unlockShape") : t("inspector.lockShape")} onClick={() => onUpdate({ locked: !locked })}>
            {locked ? <LockKeyhole size={31} strokeWidth={2.4} /> : <LockKeyholeOpen size={31} strokeWidth={2.4} />}
          </button>
          <button className={shape.hidden ? "inspector-header-icon active" : "inspector-header-icon"} aria-label={shape.hidden ? t("inspector.showShape") : t("inspector.hideShape")} onClick={() => onUpdate({ hidden: !shape.hidden })}>
            <ToolbarHideSelectedIcon />
          </button>
        </div>
      </div>

      {!minimized ? (
        <>
      <div className="shape-state-card" role="group" aria-label={t("inspector.shapeMode")}>
        <button
          className={!shape.hole ? "active solid-choice" : "solid-choice"}
          onClick={() => {
            const wasHole = Boolean(shape.hole);
            onUpdate({ hole: false, color: solidColor });
            setColorOpen((open) => (wasHole ? false : !open));
          }}
          disabled={locked}
          aria-pressed={!shape.hole}
          aria-expanded={colorOpen}
        >
          <span className="large-solid-swatch" style={{ "--swatch": solidColor } as CSSProperties} />
          <span>{t("inspector.solid")}</span>
        </button>
        <button
          className={shape.hole ? "active hole-choice" : "hole-choice"}
          onClick={() => {
            onUpdate({ hole: true });
            setColorOpen(false);
          }}
          disabled={locked}
          aria-pressed={shape.hole}
        >
          <span className="large-hole-swatch" />
          <span>{t("inspector.hole")}</span>
        </button>
      </div>

      <div className="shape-opacity-row">
        <ShapePropertyRows
          properties={[{
            id: "opacity",
            label: t("sketch.imageOpacity"),
            value: Math.round((shape.opacity ?? 1) * 100),
            min: 5,
            max: 100,
            step: 1,
            onChange: (value) => onUpdate({ opacity: normalizeShapeOpacity(value / 100) }),
          }]}
          workspace={workspace}
          // A hole is already drawn see-through to read as a cutter, so its own
          // appearance wins and the slider would do nothing.
          disabled={locked || Boolean(shape.hole)}
          onInteractionActiveChange={onInteractionActiveChange}
        />
      </div>

      {colorOpen ? (
        <div className="color-card" aria-label={t("inspector.shapeColor")}>
          <div className="color-card-header">
            <span>{t("inspector.color")}</span>
            <span className="color-value">{solidColor.toUpperCase()}</span>
          </div>
          <div className="color-grid">
            {SOLID_COLORS.map((color) => (
              <button
                key={color}
                className={solidColor.toLowerCase() === color.toLowerCase() && !shape.hole ? "selected" : ""}
                type="button"
                style={{ "--shape-swatch": color } as CSSProperties}
                title={color.toUpperCase()}
                aria-label={`Set color ${color}`}
                disabled={locked}
                onClick={() => {
                  onUpdate({ color, hole: false });
                  setColorOpen(false);
                }}
              />
            ))}
            <label className={locked ? "custom-color disabled" : "custom-color"} title={t("inspector.customColor")}>
              <input
                key={`${shape.id}-${solidColor}`}
                ref={customColorInputRef}
                type="color"
                defaultValue={solidColor}
                disabled={locked}
                onFocus={() => onInteractionActiveChange?.(true)}
                onBlur={() => onInteractionActiveChange?.(false)}
              />
              <span>{t("inspector.custom")}</span>
            </label>
          </div>
        </div>
      ) : null}

      {shape.sketchProfile && onEditSketch ? (
        <button className="edit-sketch-button" type="button" disabled={locked} onClick={onEditSketch}>{t("inspector.editSketch")}</button>
      ) : null}

      {canSeparateParts && onSeparateParts ? (
        <button className="inspector-action-button" type="button" disabled={locked} onClick={onSeparateParts}>
          <Split size={17} strokeWidth={2.5} />
          <span>{t("inspector.separateParts")}</span>
        </button>
      ) : null}

      {resizeRegion && onResizeRegionChange ? (
        <div className="property-card region-card">
          <div className="property-card-header region-card-header">
            <span>{t("inspector.region")}</span>
          </div>
          <p className="region-card-hint">{t("inspector.regionHint")}</p>
          <div className="property-list">
            <ShapePropertyRows
              properties={regionBoundProperties(regionShape ?? shape, resizeRegion, onResizeRegionChange)}
              workspace={workspace}
              disabled={locked}
              onInteractionActiveChange={onInteractionActiveChange}
            />
          </div>
          {onRegionTaper ? (
            <>
              {/* Dieselbe Verjuengung wie am ganzen Koerper, nur auf den
                  Kasten bezogen. Sie wird gerechnet, wenn der Knopf gedrueckt
                  wird, und nicht waehrend des Schiebens: Der Teilbereich
                  arbeitet am Netz, und jeder Zwischenschritt waere ein
                  weiterer Umbau auf dem vorigen. */}
              <div className="property-list">
                <ShapePropertyRows
                  properties={regionTaperProperties(pendingRegionTaper, setPendingRegionTaper)}
                  workspace={workspace}
                  disabled={locked}
                  onInteractionActiveChange={onInteractionActiveChange}
                />
              </div>
              <div className="region-card-actions">
                <button
                  type="button"
                  className="region-taper-apply"
                  disabled={locked || regionTaperIsUntouched(pendingRegionTaper)}
                  onClick={() => onRegionTaper(pendingRegionTaper)}
                >
                  {t("inspector.applyRegionTaper")}
                </button>
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      {primaryProperties.length > 0 || gearType ? (
      <div className={`property-card ${propertiesOpen ? "" : "collapsed"}`}>
        <button
          className="property-card-header"
          type="button"
          aria-expanded={propertiesOpen}
          aria-controls={`properties-${shape.id}`}
          onClick={() => setPropertiesOpen((open) => !open)}
        >
          <span>{t("sketch.imageProperties")}</span>
          <ChevronUp className={propertiesOpen ? "" : "collapsed"} size={25} strokeWidth={2.8} />
        </button>
        {propertiesOpen ? (
          <div className="property-list" id={`properties-${shape.id}`}>
            {gearType ? (
              <GearTypeSelector
                value={gearType}
                disabled={locked}
                onChange={(gearType) => onUpdate({ gearType })}
              />
            ) : null}
            {/* With a region active the handles no longer size the shape, and
                neither should these fields - a whole-shape scale would drag the
                box along in a way the user did not ask for. */}
            <ShapePropertyRows
              properties={primaryProperties}
              workspace={workspace}
              disabled={locked || Boolean(resizeRegion)}
              formulas={shape.measurementFormulas}
              onFormulaChange={rememberFormula}
              onInteractionActiveChange={onInteractionActiveChange}
            />
          </div>
        ) : null}
      </div>
      ) : null}

      <div className={`property-card ${positionOpen ? "" : "collapsed"}`}>
        <button
          className="property-card-header"
          type="button"
          aria-expanded={positionOpen}
          aria-controls={`position-${shape.id}`}
          onClick={() => setPositionOpen((open) => !open)}
        >
          <span>{t("inspector.position")}</span>
          <ChevronUp className={positionOpen ? "" : "collapsed"} size={25} strokeWidth={2.8} />
        </button>
        {positionOpen ? (
          <div className="property-list" id={`position-${shape.id}`}>
            <ShapePropertyRows properties={positionProperties} workspace={workspace} disabled={locked} onInteractionActiveChange={onInteractionActiveChange} />
            {deltaToReference ? (
              <div className="reference-delta" role="group" aria-label={t("inspector.offsetToReference")}>
                <div className="reference-delta-header">Δ to reference</div>
                <div className="reference-delta-row">
                  <span>ΔX</span><span>{formatReferenceDelta(deltaToReference.dx, workspace)}</span>
                </div>
                <div className="reference-delta-row">
                  <span>ΔY</span><span>{formatReferenceDelta(deltaToReference.dy, workspace)}</span>
                </div>
                <div className="reference-delta-row">
                  <span>ΔZ</span><span>{formatReferenceDelta(deltaToReference.dz, workspace)}</span>
                </div>
                <div className="reference-delta-row reference-delta-distance">
                  <span>{t("edge.distance")}</span><span>{formatReferenceDelta(deltaDistance, workspace)}</span>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {crossProperties.length > 0 ? (
        <div className={`property-card ${crossOpen ? "" : "collapsed"}`}>
          <button
            className="property-card-header"
            type="button"
            aria-expanded={crossOpen}
            aria-controls={`cross-${shape.id}`}
            onClick={() => setCrossOpen((open) => !open)}
          >
            <span>{t("inspector.marker")}</span>
            <ChevronUp className={crossOpen ? "" : "collapsed"} size={25} strokeWidth={2.8} />
          </button>
          {crossOpen ? (
            <div className="property-list" id={`cross-${shape.id}`}>
              <ShapePropertyRows properties={crossProperties} workspace={workspace} disabled={locked} onInteractionActiveChange={onInteractionActiveChange} />
            </div>
          ) : null}
        </div>
      ) : null}
      {shape.kind !== "gear" && shape.kind !== "reference" ? (
        <div className={`property-card ${taperOpen ? "" : "collapsed"}`}>
          <button
            className="property-card-header"
            type="button"
            aria-expanded={taperOpen}
            aria-controls={`taper-${shape.id}`}
            onClick={() => setTaperOpen((open) => !open)}
          >
            <span>{t("inspector.taper")}</span>
            <ChevronUp className={taperOpen ? "" : "collapsed"} size={25} strokeWidth={2.8} />
          </button>
          {taperOpen ? (
            <div className="property-list" id={`taper-${shape.id}`}>
              <ShapePropertyRows properties={taperProperties} workspace={workspace} disabled={locked} onInteractionActiveChange={onInteractionActiveChange} />
            </div>
          ) : null}
        </div>
      ) : null}
      {shape.kind !== "gear" && shape.kind !== "reference" ? (
        <div className={`property-card ${sideHeightOpen ? "" : "collapsed"}`}>
          <button
            className="property-card-header"
            type="button"
            aria-expanded={sideHeightOpen}
            aria-controls={`side-height-${shape.id}`}
            onClick={() => setSideHeightOpen((open) => !open)}
          >
            <span>{t("inspector.sideHeights")}</span>
            <ChevronUp className={sideHeightOpen ? "" : "collapsed"} size={25} strokeWidth={2.8} />
          </button>
          {sideHeightOpen ? (
            <div className="property-list" id={`side-height-${shape.id}`}>
              <ShapePropertyRows properties={sideHeightProperties} workspace={workspace} disabled={locked} onInteractionActiveChange={onInteractionActiveChange} />
            </div>
          ) : null}
        </div>
      ) : null}
      {supportsDeform ? (
        <div className={`property-card ${twistOpen ? "" : "collapsed"}`}>
          <button
            className="property-card-header"
            type="button"
            aria-expanded={twistOpen}
            aria-controls={`twist-${shape.id}`}
            onClick={() => setTwistOpen((open) => !open)}
          >
            <span>{t("inspector.twist")}</span>
            <ChevronUp className={twistOpen ? "" : "collapsed"} size={25} strokeWidth={2.8} />
          </button>
          {twistOpen ? (
            <div className="property-list" id={`twist-${shape.id}`}>
              <ShapePropertyRows properties={twistProperties} workspace={workspace} disabled={locked} onInteractionActiveChange={onInteractionActiveChange} />
            </div>
          ) : null}
        </div>
      ) : null}
      {shape.kind === "gear" ? (
        <div className={`property-card ${gearTeethOpen ? "" : "collapsed"}`}>
          <button
            className="property-card-header"
            type="button"
            aria-expanded={gearTeethOpen}
            aria-controls={`gear-teeth-${shape.id}`}
            onClick={() => setGearTeethOpen((open) => !open)}
          >
            <span>{t("inspector.teeth")}</span>
            <ChevronUp className={gearTeethOpen ? "" : "collapsed"} size={25} strokeWidth={2.8} />
          </button>
          {gearTeethOpen ? (
            <div className="property-list" id={`gear-teeth-${shape.id}`}>
              <ShapePropertyRows properties={gearTeethProperties} workspace={workspace} disabled={locked} onInteractionActiveChange={onInteractionActiveChange} />
            </div>
          ) : null}
        </div>
      ) : null}
      {gearType === "helical" ? (
        <div className={`property-card ${gearHelixOpen ? "" : "collapsed"}`}>
          <button
            className="property-card-header"
            type="button"
            aria-expanded={gearHelixOpen}
            aria-controls={`gear-helix-${shape.id}`}
            onClick={() => setGearHelixOpen((open) => !open)}
          >
            <span>{t("inspector.helix")}</span>
            <ChevronUp className={gearHelixOpen ? "" : "collapsed"} size={25} strokeWidth={2.8} />
          </button>
          {gearHelixOpen ? (
            <div className="property-list" id={`gear-helix-${shape.id}`}>
              <ShapePropertyRows properties={gearHelixProperties} workspace={workspace} disabled={locked} onInteractionActiveChange={onInteractionActiveChange} />
            </div>
          ) : null}
        </div>
      ) : null}
      {/* Ein Schritt, den man nimmt: unter den Massen, nicht davor. */}
      {surfaceTexture ? (
        <SurfaceTextureCard
          key={`surface-${shape.id}`}
          shape={shape}
          workspace={workspace}
          disabled={locked}
          card={surfaceTexture}
          onInteractionActiveChange={onInteractionActiveChange}
        />
      ) : null}

      {offersSurfaceTextureMask(shape) ? (
        <div className="property-card">
          <div className="property-list surface-texture-body">
            <SelectProperty
              type="select"
              id="surfaceTextureMask"
              label={t("inspector.surfaceMask")}
              value={shape.surfaceTextureMask ?? "none"}
              options={(["none", ...SURFACE_TEXTURE_MASK_MODES] as const).map((value) => ({ value, label: t(SURFACE_TEXTURE_LABELS.mask[value]) }))}
              disabled={locked}
              // Eine Maske ist eine Hilfe, durch die man hindurchschaut: Sie wird dabei durchsichtig.
              onChange={(value) => onUpdate(value === "none"
                ? { surfaceTextureMask: undefined }
                : { surfaceTextureMask: value as SurfaceTextureMaskMode, opacity: Math.min(shape.opacity ?? 1, 0.4) })}
            />
            {shape.surfaceTextureMask ? <p className="surface-texture-hint">{t("inspector.surfaceMaskHint")}</p> : null}
          </div>
        </div>
      ) : null}
      <div className="inspector-snap-dock">
        <SnapGridControl snap={snap} snapOpen={snapOpen} customGrids={workspace.customSnapGrids} onSnapChange={onSnapChange} onSnapOpenChange={onSnapOpenChange} />
      </div>
        </>
      ) : null}
    </aside>
  );
}

/**
 * The six bounds of a resize region as rows, in the shape's display frame:
 * width and length run from the centre, height from the underside. Each
 * bound is kept on its own side of the opposite one so the box never
 * collapses or flips.
 */
/**
 * `shape` muss hier der Koerper sein, **in dessen Netz der Kasten lebt** - nicht
 * der mit seiner Urform darin, den die Eigenschaftsleiste sonst bekommt. Die
 * Begruendung steht bei `regionSliderBounds`.
 */
function regionBoundProperties(shape: WorkplaneShape, region: ResizeRegion, onChange: (region: ResizeRegion) => void): ShapePropertyConfig[] {
  const rows = regionSliderBounds(shape).map((row) => ({
    ...row,
    id: row.axis,
    label: t(`prop.${row.axis}` as MessageKey),
  }));
  return rows.flatMap(({ id, label, lo, hi, min, max }) => [
    {
      id: `${id}From`,
      label: t("inspector.rangeFrom", { label }),
      value: region[lo],
      min,
      max,
      step: 0.1,
      onChange: (value: number) => onChange({ ...region, [lo]: Math.min(value, region[hi] - MIN_REGION_SIZE) }),
    },
    {
      id: `${id}To`,
      label: t("inspector.rangeTo", { label }),
      value: region[hi],
      min,
      max,
      step: 0.1,
      onChange: (value: number) => onChange({ ...region, [hi]: Math.max(value, region[lo] + MIN_REGION_SIZE) }),
    },
  ]);
}

/**
 * Die Verjuengung des Teilbereichs: vier Deckkanten des Kastens und vier
 * Hoehen an seinen Seiten - dieselben acht Werte wie am ganzen Koerper, nur
 * auf den Kasten bezogen. Die Hoehen stehen in Millimetern, abgelegt sind sie
 * als Anteil.
 */
function regionTaperProperties(
  taper: RegionTaper,
  onChange: (next: RegionTaper) => void,
): ShapePropertyConfig[] {
  // Die Masse beziehen sich auf den Kasten, den die Verjuengung mitbringt -
  // denselben, gegen den sie am Ende gerechnet wird.
  const width = Math.max(MIN_REGION_SIZE, taper.box.maxX - taper.box.minX);
  const depth = Math.max(MIN_REGION_SIZE, taper.box.maxZ - taper.box.minZ);
  const height = Math.max(MIN_REGION_SIZE, taper.box.maxY - taper.box.minY);
  const edgeRows = ([
    ["sideLeft", "left", width],
    ["sideRight", "right", width],
    ["sideFront", "front", depth],
    ["sideBack", "back", depth],
  ] as const).map(([id, side, bound]) => ({
    id,
    label: t(`prop.${id}` as MessageKey),
    value: taper.edges[side],
    min: -bound,
    max: bound,
    step: 0.1,
    onChange: (value: number) => onChange({ ...taper, edges: { ...taper.edges, [side]: value } }),
  }));
  const heightRows = ([
    ["heightLeft", "left"],
    ["heightRight", "right"],
    ["heightFront", "front"],
    ["heightBack", "back"],
  ] as const).map(([id, side]) => ({
    id,
    label: t(`prop.${id}` as MessageKey),
    value: taper.heights[side] * height,
    min: 0,
    max: height,
    step: 0.1,
    onChange: (value: number) => onChange({
      ...taper,
      heights: { ...taper.heights, [side]: Math.min(1, Math.max(0, value / height)) },
    }),
  }));
  return [...edgeRows, ...heightRows];
}

function ShapePropertyRows({
  properties,
  workspace,
  disabled,
  formulas,
  onFormulaChange,
  onInteractionActiveChange,
}: {
  properties: ShapePropertyConfig[];
  workspace: WorkplaneWorkspaceSettings;
  disabled?: boolean;
  /** Die gemerkten Rechnungen der Form, nach Feldnamen. */
  formulas?: Readonly<Record<string, string>>;
  onFormulaChange?: (key: string, formula: string | null) => void;
  onInteractionActiveChange?: (active: boolean) => void;
}) {
  return properties.map((property) => {
    if (property.type === "text") {
      return <TextProperty key={property.id} {...property} disabled={disabled} onInteractionActiveChange={onInteractionActiveChange} />;
    }
    if (property.type === "select") {
      return <SelectProperty key={property.id} {...property} disabled={disabled} />;
    }
    return (
      <RangeProperty
        key={property.id}
        {...property}
        workspace={workspace}
        disabled={disabled}
        formula={formulas?.[property.id]}
        onFormulaChange={onFormulaChange ? (formula) => onFormulaChange(property.id, formula) : undefined}
        onInteractionActiveChange={onInteractionActiveChange}
      />
    );
  });
}

/**
 * Wie ein Fangschritt im Menue heisst: ein eigenes Rastermass mit seinem
 * Namen, alles andere wie bisher.
 */
export function snapGridOptionLabel(size: GridSize, customGrids: ReadonlyArray<CustomSnapGrid> = []) {
  return customSnapGridLabel(size, customGrids) ?? measurementOptionLabel(size);
}

export function SnapGridControl({
  snap,
  snapOpen,
  customGrids = [],
  onSnapChange,
  onSnapOpenChange,
}: {
  snap: GridSize;
  snapOpen: boolean;
  customGrids?: ReadonlyArray<CustomSnapGrid>;
  onSnapChange: Dispatch<SetStateAction<GridSize>>;
  onSnapOpenChange: Dispatch<SetStateAction<boolean>>;
}) {
  return (
    <div className="snap-row">
      <span>{t("inspector.snapGrid")}</span>
      <button className="snap-select" onClick={() => onSnapOpenChange((value) => !value)}>
        {snapGridOptionLabel(snap, customGrids)}
        <ChevronDown size={12} fill="currentColor" />
      </button>
      {snapOpen ? (
        <div className="snap-menu">
          {snapGridOptions(customGrids).map((size) => (
            <button
              key={size}
              className={size === snap ? "selected" : ""}
              onClick={() => {
                onSnapChange(size);
                onSnapOpenChange(false);
              }}
            >
              {snapGridOptionLabel(size, customGrids)}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function RangeProperty({
  id,
  label,
  value,
  min,
  max,
  step = 0.01,
  link,
  workspace,
  disabled,
  formula,
  onChange,
  onFormulaChange,
  onInteractionActiveChange,
}: RangePropertyConfig & {
  workspace: WorkplaneWorkspaceSettings;
  disabled?: boolean;
  /** Die gemerkte Rechnung dieses Feldes, falls es eine gibt. */
  formula?: string;
  onFormulaChange?: (formula: string | null) => void;
  onInteractionActiveChange?: (active: boolean) => void;
}) {
  const allowsAboveSliderMax = ["length", "width", "height", "diameter", "pitch", "threadLength", "clearance", "segments", "x", "y", "z"].includes(id)
    || id.endsWith("Length") || id.endsWith("Width");
  /*
   * Eine Lage nimmt jede Zahl, nach beiden Seiten - der Regler reicht nur
   * so weit wie die Platte. Vorher kappte das Feld nach unten am Regler und
   * zeigte einen Koerper, der tiefer lag, auf dessen Rand.
   */
  const freePosition = id === "x" || id === "y" || id === "z";
  const isLength = propertyUsesLengthUnit(id);
  const accuracy = workspace.accuracy;
  const actualValue = freePosition && Number.isFinite(value) ? value : Math.max(min, Number.isFinite(value) ? value : min);
  const controlValue = isLength ? millimetersToDisplay(actualValue, workspace) : actualValue;
  const controlMin = isLength ? millimetersToDisplay(min, workspace) : min;
  const controlMax = isLength ? millimetersToDisplay(max, workspace) : max;
  const controlStep = isLength ? displayStepFromMillimeters(step, workspace) : step;
  const sliderValue = clamp(controlValue, controlMin, controlMax);
  const position = ((sliderValue - controlMin) / Math.max(Number.EPSILON, controlMax - controlMin)) * 100;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(formatPropertyNumber(controlValue, accuracy, controlStep));
  const unit = isLength ? lengthDisplayUnit(workspace).label : null;
  const toModelValue = (nextValue: number) => isLength ? displayToMillimeters(nextValue, workspace) : nextValue;
  /**
   * Was im Feld steht, wenn man hineinklickt: die gemerkte Rechnung, solange
   * sie den gezeigten Wert ergibt - sonst die Zahl. Gerechnet wird in der
   * Anzeigeeinheit, und darin ist auch die Rechnung aufgeschrieben.
   */
  const openingDraft = () => formulaForValue(formula, controlValue) ?? formatPropertyNumber(controlValue, accuracy, controlStep);
  const commitDraft = () => {
    const next = parseMeasurementInput(draft);
    const finiteNext = Number.isFinite(next) ? next : controlValue;
    const nextModelValue = toModelValue(finiteNext);
    const stored = freePosition
      ? clamp(nextModelValue, -POSITION_TYPED_LIMIT, POSITION_TYPED_LIMIT)
      : allowsAboveSliderMax ? Math.max(min, nextModelValue) : clamp(nextModelValue, min, max);
    onChange(stored);
    /*
     * Gemerkt wird die Rechnung gegen den Wert, der wirklich stehen bleibt -
     * nicht gegen das Ergebnis der Rechnung. Hat eine Grenze gekappt, ist die
     * Rechnung nicht mehr wahr und wird vergessen.
     */
    onFormulaChange?.(nextMeasurementFormula(draft, isLength ? millimetersToDisplay(stored, workspace) : stored));
    setEditing(false);
    onInteractionActiveChange?.(false);
  };
  const handleSliderChange = (nextValue: number) => {
    const next = clamp(Number.isFinite(nextValue) ? nextValue : controlMin, controlMin, controlMax);
    onChange(clamp(toModelValue(next), min, max));
    setDraft(formatPropertyNumber(next, accuracy, controlStep));
    // Der Regler setzt eine Zahl; eine Rechnung dazu waere nicht mehr wahr.
    onFormulaChange?.(null);
  };
  return (
    <label className="range-property" style={{ "--slider-pos": `${position}%` } as CSSProperties}>
      <span className="range-property-header">
        <span className="range-property-name">
          {label}
          {link ? (
            <button
              type="button"
              className={`axis-link${link.linked ? " on" : ""}${link.active ? " active" : ""}`}
              disabled={disabled}
              title={link.active
                ? t("inspector.linkPaired")
                : link.linked
                  ? t("inspector.linkAlone")
                  : t("inspector.linkHint")}
              aria-pressed={link.linked}
              onClick={(event) => {
                event.preventDefault();
                link.onToggle();
              }}
            >
              {link.linked ? <Link2 size={15} strokeWidth={2.4} /> : <Unlink2 size={15} strokeWidth={2.2} />}
            </button>
          ) : null}
        </span>
        <span className="range-value-control">
          <input
            type="text"
            value={editing ? draft : formatPropertyNumber(controlValue, accuracy, controlStep)}
            disabled={disabled}
            inputMode="decimal"
            onFocus={(event) => {
              onInteractionActiveChange?.(true);
              setDraft(openingDraft());
              setEditing(true);
              selectWholeValue(event.currentTarget);
            }}
            onChange={(event) => setDraft(event.currentTarget.value)}
            onBlur={commitDraft}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur();
              } else if (event.key === "Escape") {
                setDraft(openingDraft());
                setEditing(false);
              }
            }}
          />
          {unit ? <span className="range-value-unit">{unit}</span> : null}
        </span>
      </span>
      <div className="range-control">
        <input
          type="range"
          min={controlMin}
          max={controlMax}
          step={controlStep}
          value={sliderValue}
          disabled={disabled}
          onFocus={() => onInteractionActiveChange?.(true)}
          onBlur={() => onInteractionActiveChange?.(false)}
          onPointerDown={() => onInteractionActiveChange?.(true)}
          onPointerUp={() => onInteractionActiveChange?.(false)}
          onPointerCancel={() => onInteractionActiveChange?.(false)}
          onChange={(event) => handleSliderChange(Number(event.currentTarget.value))}
        />
      </div>
    </label>
  );
}

function TextProperty({ label, value, disabled, onChange, onInteractionActiveChange }: TextPropertyConfig & { disabled?: boolean; onInteractionActiveChange?: (active: boolean) => void }) {
  return (
    <label className="text-property">
      <span>{label}</span>
      <input
        type="text"
        value={value}
        disabled={disabled}
        maxLength={24}
        spellCheck={false}
        onFocus={() => onInteractionActiveChange?.(true)}
        onBlur={() => onInteractionActiveChange?.(false)}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </label>
  );
}

function SelectProperty({ label, value, options, disabled, onChange }: SelectPropertyConfig & { disabled?: boolean }) {
  const entries: SelectPropertyOption[] = options.map((option) => (
    typeof option === "string" ? { value: option, label: option } : option
  ));
  // Consecutive entries under the same heading become one block; entries
  // without a heading stand on their own.
  const blocks: Array<{ group?: string; items: SelectPropertyOption[] }> = [];
  entries.forEach((option) => {
    const last = blocks[blocks.length - 1];
    if (last && last.group === option.group) last.items.push(option);
    else blocks.push({ group: option.group, items: [option] });
  });
  return (
    <label className="select-property">
      <span>{label}</span>
      <select value={value} disabled={disabled} onChange={(event) => onChange(event.currentTarget.value)}>
        {blocks.map((block) => (
          block.group ? (
            <optgroup key={block.group} label={block.group}>
              {block.items.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </optgroup>
          ) : (
            <Fragment key={block.items[0].value}>
              {block.items.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </Fragment>
          )
        ))}
      </select>
    </label>
  );
}

/** Was die Karte der Oberflaechenstruktur vom Editor bekommt. */
export type SurfaceTextureCardProps = {
  onApply: (settings: SurfaceTextureSettings) => Promise<void> | void;
  /** Nimmt die Struktur ab; da, solange der Koerper den darunter behaelt. */
  onRemove?: () => void;
  /** Auf oder zu, wie der Editor es haelt, damit der Knopf in der Werkzeugleiste dasselbe zeigt. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function ToggleProperty({ label, value, disabled, onChange }: { label: string; value: boolean; disabled?: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="check-property">
      <input type="checkbox" checked={value} disabled={disabled} onChange={(event) => onChange(event.currentTarget.checked)} />
      <span>{label}</span>
    </label>
  );
}

/** Eine Auswahl mit einer Zeile darunter, die die gewaehlte Moeglichkeit erklaert. */
function HintedSelect({ hint, ...props }: SelectPropertyConfig & { disabled?: boolean; hint?: string }) {
  return (
    <>
      <SelectProperty {...props} />
      {hint ? <p className="surface-texture-hint">{hint}</p> : null}
    </>
  );
}

/** Die Formen einer Noppe, die halbe Kugel zuerst. */
const BUMP_SHAPES = ["dome", "pointed", "round", "flat"] as const;

/** Wie Abstand und Breite heissen, wo sie etwas anderes meinen als bei einer Rille. */
const SURFACE_SPACING_LABEL: Partial<Record<SurfaceTexturePattern, MessageKey>> = {
  cells: "inspector.surfaceSpacingCells",
  bricks: "inspector.surfaceSpacingBricks",
  knit: "inspector.surfaceSpacingKnit",
  rope: "inspector.surfaceSpacingRope",
  weave: "inspector.surfaceSpacingWeave",
  carbon: "inspector.surfaceSpacingCarbon",
  bark: "inspector.surfaceSpacingBark",
  grain: "inspector.surfaceSpacingGrain",
  image: "inspector.surfaceSpacingImage",
};
const SURFACE_COVERAGE_LABEL: Partial<Record<SurfaceTexturePattern, MessageKey>> = {
  cells: "inspector.surfaceCoverageCells",
  knit: "inspector.surfaceCoverageKnit",
  rope: "inspector.surfaceCoverageRope",
  weave: "inspector.surfaceCoverageWeave",
  carbon: "inspector.surfaceCoverageCarbon",
};

/**
 * Die Einstellungen, wenn ein anderes Muster gewaehlt wird. Ein Muster mit
 * eigenen Startwerten bekommt sie, und wer es verlaesst, gibt dem naechsten
 * die einfachen Vorgaben zurueck - die 5 mm einer Masche werden so nicht zum
 * Abstand einer Raendelung. Noppen beginnen als halbe Kugeln.
 */
function surfaceSettingsForPattern(current: SurfaceTextureSettings, pattern: SurfaceTexturePattern): Partial<SurfaceTextureSettings> {
  const leaving = current.pattern === "bumps" ? null : SURFACE_TEXTURE_STARTERS[current.pattern];
  // Eine Rinde bringt Groesse und Tiefe mit: Wer sie verlaesst, gibt auch die zurueck.
  const leavingKeys = [...Object.keys(leaving ?? {}), ...(current.pattern === "bark" ? ["spacing", "depth"] : [])];
  const reset = Object.fromEntries(leavingKeys.map((key) => [key, SURFACE_TEXTURE_DEFAULTS[key as keyof SurfaceTextureSettings]]));
  const starter = pattern === "bumps" ? (current.profile === "pointed" ? { profile: "dome" as const } : {}) : SURFACE_TEXTURE_STARTERS[pattern] ?? {};
  const tile = pattern === "image" ? { spacing: surfaceTextureImageTile(current.image), tileHeight: 0 } : {};
  const own = pattern === "bark" ? { spacing: BARK_STARTS[current.barkType].spacing, depth: BARK_STARTS[current.barkType].depth } : pattern === "wood" ? { ringWidth: WOOD_RINGS[current.woodType] } : {};
  return { ...reset, ...starter, ...tile, ...own, pattern };
}

/** Eine Bilddatei als eigenes Bild fuer die Struktur: klein gezeichnet (SURFACE_TEXTURE_OWN_IMAGE_SIZE) und grau. */
async function surfaceImageFromFile(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const picture = new Image();
    picture.src = url;
    await picture.decode();
    // Eine Zeichnung ohne eigene Groesse (ein SVG) wird so gross gezeichnet, wie das Bild sein darf.
    const width = picture.naturalWidth || SURFACE_TEXTURE_OWN_IMAGE_SIZE, height = picture.naturalHeight || SURFACE_TEXTURE_OWN_IMAGE_SIZE;
    const scale = Math.min(1, SURFACE_TEXTURE_OWN_IMAGE_SIZE / Math.max(width, height));
    const w = Math.max(2, Math.round(width * scale)), h = Math.max(2, Math.round(height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("no canvas");
    context.drawImage(picture, 0, 0, w, h);
    return surfaceTextureOwnImage(context.getImageData(0, 0, w, h).data, w, h);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Eine Oberflaechenstruktur auf diesem Koerper: das Muster, wohin es kommt,
 * und der Knopf. Zugeklappt, bis man sie braucht. Die Karte behaelt ihre
 * Einstellungen ueber ein Zuruecknehmen hinweg, damit der naechste Versuch
 * vom letzten ausgeht. Nach layerling 1.121.1, ohne das Waehlen einzelner
 * Flaechen per Klick.
 */
function SurfaceTextureCard({
  shape,
  workspace,
  disabled,
  card,
  onInteractionActiveChange,
}: {
  shape: WorkplaneShape;
  workspace: WorkplaneWorkspaceSettings;
  disabled: boolean;
  card: SurfaceTextureCardProps;
  onInteractionActiveChange?: (active: boolean) => void;
}) {
  const { open, onOpenChange: setOpen, onApply, onRemove } = card;
  // Geoeffnet, waehrend die Karte zu sehen ist (aus der Werkzeugleiste), kommt sie ins Bild.
  const cardRef = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(open);
  useEffect(() => {
    if (open && !wasOpen.current) cardRef.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
    wasOpen.current = open;
  }, [open]);
  const [moreOpen, setMoreOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [settings, setSettings] = useState(() => normalizeSurfaceTexture(shape.surfaceTexture ?? {}));
  const set = (patch: Partial<SurfaceTextureSettings>) => setSettings((current) => normalizeSurfaceTexture({ ...current, ...patch }));
  const applied = shape.surfaceTexture;
  // Eine anderswo gemachte oder geaenderte Struktur (vom Assistenten, durch Wiederholen, in einem wieder
  // geoeffneten Projekt) zeigt ihre eigenen Einstellungen; eine abgenommene laesst die Karte, wie sie war.
  const appliedKey = applied
    ? JSON.stringify({ ...applied, masks: applied.masks.length, textOutline: applied.textOutline.length, imageOwn: applied.imageOwn ? applied.imageOwn.data.length : 0 })
    : "";
  const [shownKey, setShownKey] = useState(appliedKey);
  if (appliedKey !== shownKey) {
    setShownKey(appliedKey);
    if (applied) setSettings(normalizeSurfaceTexture(applied));
  }
  // Eine Struktur mit dem Koerper darunter zeigt ihre Einstellungen zum Aendern; eine ohne sagt nur, was sie ist.
  const changeable = Boolean(applied && onRemove && surfaceTextureEntry(shape));
  const off = disabled || busy;
  const options = <T extends string>(values: readonly T[], label: (value: T) => string) => values.map((value) => ({ value, label: label(value) }));
  const range = (id: string, label: string, value: number, [min, max]: readonly [number, number], step: number, onChange: (value: number) => void) => (
    <RangeProperty
      id={id}
      label={label}
      value={value}
      min={min}
      max={max}
      step={step}
      workspace={workspace}
      disabled={off}
      onChange={onChange}
      onInteractionActiveChange={onInteractionActiveChange}
    />
  );
  const select = <T extends string>(id: string, label: string, value: T, values: readonly T[], labelOf: (value: T) => string, onChange: (value: T) => void, hint?: string) => (
    <HintedSelect type="select" id={id} label={label} value={value} options={options(values, labelOf)} hint={hint} disabled={off} onChange={(next) => onChange(next as T)} />
  );
  const hint = (text: string) => <p className="surface-texture-hint">{text}</p>;
  const L = SURFACE_TEXTURE_LABELS;
  const striped = settings.pattern === "grooves" || settings.pattern === "knurl";
  const cracks = settings.pattern === "cracks";
  const carbon = settings.pattern === "carbon";
  const bricks = settings.pattern === "bricks";
  const bark = settings.pattern === "bark";
  const wood = settings.pattern === "wood";
  const endRings = settings.topFree === 0 && settings.bottomFree === 0;
  // Rillen, Seil und Strick koennen oben in Ringen liegen (siehe SurfaceTextureSettings.capStyle).
  const ringPattern = settings.pattern === "grooves" || settings.pattern === "rope" || settings.pattern === "knit";
  // Ueber den Rand laufen oder umschlagen geht nur mit denen: bei den anderen zeigt die Wahl "automatisch".
  const capEdgeShown = !ringPattern && (settings.capEdge === "over" || settings.capEdge === "fold") ? "auto" : settings.capEdge;
  const grain = settings.pattern === "grain";
  const image = settings.pattern === "image";
  const text = settings.pattern === "text";
  const imageInput = useRef<HTMLInputElement>(null);
  const [imageError, setImageError] = useState("");
  const loadImage = async (file: File | undefined) => {
    if (!file) return;
    try {
      const imageOwn = await surfaceImageFromFile(file);
      setImageError("");
      set({ image: "own", imageOwn, tileHeight: 0 });
    } catch (error) {
      setImageError(t("status.surfaceImageFailed", { error: error instanceof Error ? error.message : String(error) }));
    }
  };
  const percent = (id: string, label: string, value: number, onChange: (value: number) => void) => range(id, label, Math.round(value * 100), [0, 100], 1, (share) => onChange(share / 100));
  const apply = async () => {
    setBusy(true);
    try {
      await onApply(settings);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={`property-card ${open ? "" : "collapsed"}`} ref={cardRef}>
      <button
        className="property-card-header"
        type="button"
        aria-expanded={open}
        aria-controls={`surface-texture-${shape.id}`}
        onClick={() => setOpen(!open)}
      >
        <span>{t("inspector.surfaceTexture")}</span>
        <ChevronUp className={open ? "" : "collapsed"} size={25} strokeWidth={2.8} />
      </button>
      {open ? (
        <div className="property-list surface-texture-body" id={`surface-texture-${shape.id}`}>
          {applied && !changeable ? (
            hint(t("inspector.surfaceApplied", { pattern: surfacePatternLabel(applied.pattern) }))
          ) : (
            <>
              {select("surfacePattern", t("inspector.surfacePattern"), settings.pattern, SURFACE_TEXTURE_PATTERNS, (value) => t(L.pattern[value]), (value) => set(surfaceSettingsForPattern(settings, value)))}
              {cracks ? (
                <>
                  {select("surfaceCrackStyle", t("inspector.surfaceCrackStyle"), settings.crackStyle, SURFACE_TEXTURE_CRACK_STYLES, (value) => t(L.crackStyle[value]), (crackStyle) => set({ crackStyle }))}
                  {select("surfaceCrackStart", t("inspector.surfaceCrackStart"), settings.crackStart, SURFACE_TEXTURE_CRACK_STARTS, (value) => t(L.crackStart[value]), (crackStart) => set({ crackStart }))}
                  {range("surfaceCrackCount", t("inspector.surfaceCrackCount"), settings.crackCount, [1, SURFACE_TEXTURE_LIMITS.crackCount[1]], 1, (crackCount) => set({ crackCount }))}
                  {range("surfaceCrackLength", t("inspector.surfaceCrackLength"), settings.crackLength, [SURFACE_TEXTURE_LIMITS.crackLength[0], 150], 1, (crackLength) => set({ crackLength }))}
                  {range("surfaceCrackWidth", t("inspector.surfaceCrackWidth"), settings.crackWidth, SURFACE_TEXTURE_LIMITS.crackWidth, 0.1, (crackWidth) => set({ crackWidth }))}
                </>
              ) : text ? (
                <>
                  <label className="text-property">
                    <span>{t("inspector.surfaceTextContent")}</span>
                    <input
                      type="text"
                      value={settings.textContent}
                      maxLength={200}
                      disabled={off}
                      spellCheck={false}
                      onFocus={() => onInteractionActiveChange?.(true)}
                      onBlur={() => onInteractionActiveChange?.(false)}
                      onChange={(event) => set({ textContent: event.currentTarget.value })}
                    />
                  </label>
                  {select("surfaceTextFont", t("prop.font"), settings.textFont, SURFACE_TEXT_FONTS, (value) => value, (textFont) => set({ textFont }))}
                  <ToggleProperty label={t("inspector.surfaceTextVertical")} value={settings.textVertical} disabled={off} onChange={(textVertical) => set({ textVertical })} />
                  {range("surfaceTextSize", t("inspector.surfaceTextSize"), settings.textSize, [SURFACE_TEXTURE_LIMITS.textSize[0], 60], 0.5, (textSize) => set({ textSize }))}
                  {range("surfaceTextAround", t("inspector.surfaceTextAround"), settings.textAround, SURFACE_TEXTURE_LIMITS.textAround, 1, (textAround) => set({ textAround }))}
                  {range("surfaceTextHeight", t("inspector.surfaceTextHeight"), settings.textHeight, SURFACE_TEXTURE_LIMITS.textHeight, 1, (textHeight) => set({ textHeight }))}
                  {range("surfaceTextTurn", t("inspector.surfaceTextTurn"), settings.textTurn, SURFACE_TEXTURE_LIMITS.textTurn, 1, (textTurn) => set({ textTurn }))}
                  {hint(t("inspector.surfaceTextHint"))}
                </>
              ) : (
                <>
                  {image ? (
                    <>
                      {select(
                        "surfaceImage",
                        t("inspector.surfaceImage"),
                        settings.image,
                        // Das eigene Bild steht zur Wahl, sobald eines geladen ist.
                        SURFACE_TEXTURE_IMAGES.filter((value) => value !== "own" || settings.imageOwn),
                        (value) => t(L.image[value]),
                        (next) => set({ image: next, spacing: surfaceTextureImageTile(next), tileHeight: 0 }),
                      )}
                      <input
                        ref={imageInput}
                        type="file"
                        accept="image/*"
                        hidden
                        onChange={(event) => {
                          void loadImage(event.target.files?.[0]);
                          event.target.value = "";
                        }}
                      />
                      <button className="inspector-action-button" type="button" disabled={off} onClick={() => imageInput.current?.click()}>
                        <ImageUp size={17} strokeWidth={2.5} />
                        <span>{t("inspector.surfaceImageLoad")}</span>
                      </button>
                      {imageError ? hint(imageError) : null}
                    </>
                  ) : null}
                  {carbon ? select("surfaceCarbonWeave", t("inspector.surfaceCarbonWeave"), settings.carbonWeave, SURFACE_TEXTURE_CARBON_WEAVES, (value) => t(L.carbonWeave[value]), (carbonWeave) => set({ carbonWeave }), t(L.carbonWeaveHint[settings.carbonWeave])) : null}
                  {bricks ? select("surfaceBrickBond", t("inspector.surfaceBrickBond"), settings.brickBond, SURFACE_TEXTURE_BRICK_BONDS, (value) => t(L.brickBond[value]), (brickBond) => set({ brickBond }), t(L.brickBondHint[settings.brickBond])) : null}
                  {bark
                    ? select("surfaceBarkType", t("inspector.surfaceBarkType"), settings.barkType, SURFACE_TEXTURE_BARK_TYPES, (value) => t(L.barkType[value]), (barkType) => set({ barkType, spacing: BARK_STARTS[barkType].spacing, depth: BARK_STARTS[barkType].depth }), t(L.barkTypeHint[settings.barkType]))
                    : null}
                  {wood ? (
                    <>
                      {select("surfaceWoodType", t("inspector.surfaceWoodType"), settings.woodType, SURFACE_TEXTURE_WOOD_TYPES, (value) => t(L.woodType[value]), (woodType) => set({ woodType, ringWidth: WOOD_RINGS[woodType] }))}
                      {select("surfaceWoodCut", t("inspector.surfaceWoodCut"), settings.woodCut, SURFACE_TEXTURE_WOOD_CUTS, (value) => t(L.woodCut[value]), (woodCut) => set({ woodCut }), t(L.woodCutHint[settings.woodCut]))}
                    </>
                  ) : (
                    range(
                      "surfaceSpacing",
                      t(SURFACE_SPACING_LABEL[settings.pattern] ?? "inspector.surfaceSpacing"),
                      settings.spacing,
                      [SURFACE_TEXTURE_LIMITS.spacing[0], image ? SURFACE_TEXTURE_LIMITS.spacing[1] : 50],
                      0.1,
                      (spacing) => set({ spacing }),
                    )
                  )}
                  {bark || wood ? (
                    <>
                      <ToggleProperty
                        label={t("inspector.surfaceEndRings")}
                        value={endRings}
                        disabled={off}
                        onChange={(on) => set({ topFree: on ? 0 : SURFACE_TEXTURE_DEFAULTS.topFree, bottomFree: on ? 0 : SURFACE_TEXTURE_DEFAULTS.bottomFree })}
                      />
                      {wood || endRings ? range("surfaceRingWidth", t("inspector.surfaceRingWidth"), settings.ringWidth, [SURFACE_TEXTURE_LIMITS.ringWidth[0], 10], 0.1, (ringWidth) => set({ ringWidth })) : null}
                    </>
                  ) : null}
                  {image ? (
                    <>
                      {range("surfaceTileHeight", t("inspector.surfaceTileHeight"), settings.tileHeight, SURFACE_TEXTURE_LIMITS.tileHeight, 0.5, (tileHeight) => set({ tileHeight }))}
                      {select("surfaceImageTiling", t("inspector.surfaceImageTiling"), settings.imageTiling, SURFACE_TEXTURE_TILINGS, (value) => t(L.tiling[value]), (imageTiling) => set({ imageTiling }))}
                      <ToggleProperty label={t("inspector.surfaceImageInvert")} value={settings.imageInvert} disabled={off} onChange={(imageInvert) => set({ imageInvert })} />
                      {hint(t("inspector.surfaceImageHint"))}
                    </>
                  ) : null}
                  {carbon ? (
                    <>
                      {range("surfaceCarbonCross", t("inspector.surfaceCarbonCross"), settings.carbonCross, [SURFACE_TEXTURE_LIMITS.carbonCross[0], 10], 0.1, (carbonCross) => set({ carbonCross }))}
                      {hint(t("inspector.surfaceCarbonHint"))}
                    </>
                  ) : null}
                  {bricks ? (
                    <>
                      {range("surfaceBrickHeight", t("inspector.surfaceBrickHeight"), settings.brickHeight, [SURFACE_TEXTURE_LIMITS.brickHeight[0], 30], 0.1, (brickHeight) => set({ brickHeight }))}
                      {range("surfaceBrickJoint", t("inspector.surfaceBrickJoint"), settings.brickJoint, [SURFACE_TEXTURE_LIMITS.brickJoint[0], 5], 0.05, (brickJoint) => set({ brickJoint }))}
                      {hint(t("inspector.surfaceBrickHint"))}
                    </>
                  ) : null}
                  {settings.pattern === "cells" || grain ? (
                    <>
                      {range("surfaceSeed", t("inspector.surfaceSeed"), settings.seed, [1, 999], 1, (seed) => set({ seed }))}
                      {hint(t("inspector.surfaceSeedHint"))}
                    </>
                  ) : null}
                </>
              )}
              {settings.pattern === "bumps" ? select("surfaceBumpShape", t("inspector.surfaceBumpShape"), settings.profile, BUMP_SHAPES, (value) => t(L.bumpShape[value]), (profile) => set({ profile })) : null}
              {range("surfaceDepth", t("inspector.surfaceDepth"), settings.depth, SURFACE_TEXTURE_LIMITS.depth, 0.05, (depth) => set({ depth }))}
              {select("surfaceDirection", t("inspector.surfaceDirection"), settings.direction, SURFACE_TEXTURE_DIRECTIONS, (value) => t(L.direction[value]), (direction) => set({ direction }))}
              {cracks ? (
                <>
                  {/* Das Gold: ein eigenes Teil in der Kerbe, fuer ein zweites Filament. */}
                  <ToggleProperty label={t("inspector.surfaceCrackGold")} value={settings.crackGold} disabled={off} onChange={(crackGold) => set({ crackGold, ...(crackGold ? { direction: "inward" as const } : {}) })} />
                  {settings.crackGold ? range("surfaceCrackRecess", t("inspector.surfaceCrackRecess"), settings.crackRecess, SURFACE_TEXTURE_LIMITS.crackRecess, 0.05, (crackRecess) => set({ crackRecess })) : null}
                  {settings.crackGold ? hint(t("inspector.surfaceCrackGoldHint")) : null}
                </>
              ) : text ? null : grain ? (
                hint(t("inspector.surfaceGrainHint"))
              ) : wood ? (
                hint(t("inspector.surfaceWoodHint"))
              ) : (
                select("surfaceProjection", t("inspector.surfaceProjection"), settings.projection, SURFACE_TEXTURE_PROJECTIONS, (value) => t(L.projection[value]), (projection) => set({ projection }), t(L.projectionHint[settings.projection]))
              )}
              {/* Die Markroehre eines Bretts laeuft an seiner laengsten Seite: Nur ein Stamm fragt nach seiner Achse. */}
              {!grain && !(wood && settings.woodCut !== "log") && (cracks || text || wood || settings.projection !== "allRound")
                ? select("surfaceAxis", t("inspector.surfaceAxis"), settings.axis, SURFACE_TEXTURE_AXES, (value) => value.toUpperCase(), (axis) => set({ axis }))
                : null}
              <button className="surface-texture-more" type="button" aria-expanded={moreOpen} onClick={() => setMoreOpen((current) => !current)}>
                <ChevronDown className={moreOpen ? "open" : ""} size={15} strokeWidth={2.6} />
                <span>{t(moreOpen ? "inspector.surfaceLess" : "inspector.surfaceMore")}</span>
              </button>
              {moreOpen ? (
                <>
                  {cracks ? (
                    <>
                      {percent("surfaceCrackBranch", t("inspector.surfaceCrackBranch"), settings.crackBranch, (crackBranch) => set({ crackBranch }))}
                      {percent("surfaceCrackJag", t("inspector.surfaceCrackJag"), settings.crackJag, (crackJag) => set({ crackJag }))}
                      {percent("surfaceCrackRough", t("inspector.surfaceCrackRough"), settings.crackRough, (crackRough) => set({ crackRough }))}
                      {range("surfaceCrackSeed", t("inspector.surfaceCrackSeed"), settings.crackSeed, [0, 999], 1, (crackSeed) => set({ crackSeed }))}
                      {hint(t("inspector.surfaceCrackSeedHint"))}
                    </>
                  ) : bark || wood ? (
                    <>
                      {wood ? range("surfaceWoodKnots", t("inspector.surfaceWoodKnots"), settings.woodKnots, SURFACE_TEXTURE_LIMITS.woodKnots, 1, (woodKnots) => set({ woodKnots })) : null}
                      {wood ? percent("surfaceWoodWobble", t("inspector.surfaceWoodWobble"), settings.woodWobble, (woodWobble) => set({ woodWobble })) : null}
                      {range("surfaceSeed", t("inspector.surfaceSeed"), settings.seed, [1, 999], 1, (seed) => set({ seed }))}
                      {hint(t(wood ? "inspector.surfaceWoodSeedHint" : "inspector.surfaceBarkSeedHint"))}
                    </>
                  ) : text || grain ? null : image ? (
                    <>
                      {range("surfaceImageTurn", t("inspector.surfaceImageTurn"), settings.imageTurn, SURFACE_TEXTURE_LIMITS.imageTurn, 1, (imageTurn) => set({ imageTurn }))}
                      {range("surfaceImageBlur", t("inspector.surfaceImageBlur"), settings.imageBlur, SURFACE_TEXTURE_LIMITS.imageBlur, 1, (imageBlur) => set({ imageBlur }))}
                    </>
                  ) : bricks ? (
                    <>
                      {percent("surfaceBrickVary", t("inspector.surfaceBrickVary"), settings.brickVary, (brickVary) => set({ brickVary }))}
                      {settings.brickVary > 0 ? (
                        <>
                          {range("surfaceSeed", t("inspector.surfaceSeed"), settings.seed, [1, 999], 1, (seed) => set({ seed }))}
                          {hint(t("inspector.surfaceBrickVaryHint"))}
                        </>
                      ) : null}
                    </>
                  ) : (
                    range(
                      "surfaceCoverage",
                      t(SURFACE_COVERAGE_LABEL[settings.pattern] ?? "inspector.surfaceCoverage"),
                      Math.round(settings.width * 100),
                      [SURFACE_TEXTURE_LIMITS.width[0] * 100, 100],
                      1,
                      (share) => set({ width: share / 100 }),
                    )
                  )}
                  {text ? null : (
                    <>
                      {settings.pattern === "bumps" || grain || image || bark || wood
                        ? null
                        : select("surfaceProfile", t("inspector.surfaceProfile"), settings.profile, SURFACE_TEXTURE_PROFILES, (value) => t(L.profile[value]), (profile) => set({ profile }))}
                      {striped ? range("surfaceAngle", t("inspector.surfaceAngle"), settings.angle, SURFACE_TEXTURE_LIMITS.angle, 1, (angle) => set({ angle })) : null}
                      {/* Oben und unten: Rillen, Seil und Strick in Reihen oder Ringen. */}
                      {ringPattern && settings.projection !== "allRound" && settings.projection !== "flat"
                        ? select("surfaceCapStyle", t("inspector.surfaceCapStyle"), settings.capStyle, SURFACE_TEXTURE_CAP_STYLES, (value) => t(L.capStyle[value]), (capStyle) => set({ capStyle }), t("inspector.surfaceCapStyleHint"))
                        : null}
                      {/* Wo die Seite auf eine gemusterte Ober- oder Unterseite trifft. */}
                      {settings.projection !== "allRound" && settings.projection !== "flat" && !grain && !cracks && !wood
                        ? select(
                          "surfaceCapEdge",
                          t("inspector.surfaceCapEdge"),
                          capEdgeShown,
                          SURFACE_TEXTURE_CAP_EDGES.filter((value) => ringPattern || (value !== "over" && value !== "fold")),
                          (value) => t(L.capEdge[value]),
                          (capEdge) => set({ capEdge }),
                          t(L.capEdgeHint[capEdgeShown]),
                        )
                        : null}
                      {grain || cracks || bricks || wood || bark ? null : (
                        <>
                          {range("surfaceFaceTurn", t("inspector.surfaceFaceTurn"), settings.faceTurn, SURFACE_TEXTURE_LIMITS.faceTurn, 1, (faceTurn) => set({ faceTurn }))}
                          {hint(t("inspector.surfaceFaceTurnHint"))}
                        </>
                      )}
                      <ToggleProperty label={t("inspector.surfaceOutside")} value={settings.outside} disabled={off} onChange={(outside) => set({ outside })} />
                      <ToggleProperty label={t("inspector.surfaceInside")} value={settings.inside} disabled={off} onChange={(inside) => set({ inside })} />
                      {range("surfaceBottomFree", t("inspector.surfaceBottomFree"), settings.bottomFree, SURFACE_TEXTURE_LIMITS.bottomFree, 1, (bottomFree) => set({ bottomFree }))}
                      {range("surfaceTopFree", t("inspector.surfaceTopFree"), settings.topFree, SURFACE_TEXTURE_LIMITS.topFree, 1, (topFree) => set({ topFree }))}
                      {range("surfaceZoneFrom", t("inspector.surfaceZoneFrom"), settings.zoneFrom, SURFACE_TEXTURE_LIMITS.zoneFrom, 1, (zoneFrom) => set({ zoneFrom }))}
                      {range("surfaceZoneTo", t("inspector.surfaceZoneTo"), settings.zoneTo, SURFACE_TEXTURE_LIMITS.zoneTo, 1, (zoneTo) => set({ zoneTo }))}
                      <ToggleProperty label={t("inspector.surfaceKeepEdges")} value={settings.keepEdges} disabled={off} onChange={(keepEdges) => set({ keepEdges })} />
                    </>
                  )}
                  {range("surfaceFade", t("inspector.surfaceFade"), settings.fade, SURFACE_TEXTURE_LIMITS.fade, 0.1, (fade) => set({ fade }))}
                  {hint(t("inspector.surfaceFadeHint"))}
                  {select("surfaceDetail", t("inspector.surfaceDetail"), settings.detail, SURFACE_TEXTURE_DETAILS, (value) => t(L.detail[value]), (detail) => set({ detail }))}
                  {hint(t("inspector.surfaceMaskTip"))}
                </>
              ) : null}
              {hint(applied ? t("inspector.surfaceChangeHint", { pattern: surfacePatternLabel(applied.pattern) }) : t("inspector.surfaceHint"))}
              <button className="inspector-action-button" type="button" disabled={off} onClick={apply}>
                <Waves size={17} strokeWidth={2.5} />
                <span>{t(busy ? "inspector.surfaceWorking" : applied ? "inspector.surfaceChange" : "inspector.surfaceApply")}</span>
              </button>
              {applied ? (
                <button className="inspector-action-button" type="button" disabled={off} onClick={onRemove}>
                  <Eraser size={17} strokeWidth={2.5} />
                  <span>{t("inspector.surfaceRemove")}</span>
                </button>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

function GearTypePreview({ type }: { type: GearType }) {
  return <img src={`assets/sketchforge/gear-types/${type}.png`} alt="" aria-hidden="true" />;
}

function GearTypeSelector({ value, disabled, onChange }: { value: GearType; disabled?: boolean; onChange: (value: GearType) => void }) {
  return (
    <div className="gear-type-property" role="group" aria-label={t("inspector.gearType")}>
      <span>{t("inspector.gearType")}</span>
      <div className="gear-type-options">
        {GEAR_TYPE_OPTIONS.map((option) => (
          <button
            key={option.value}
            className={value === option.value ? "selected" : ""}
            type="button"
            disabled={disabled}
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
          >
            <GearTypePreview type={option.value} />
            <span>{t(option.label)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
