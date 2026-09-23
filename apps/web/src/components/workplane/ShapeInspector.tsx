"use client";

import { ChevronDown, ChevronUp, Link2, LockKeyhole, LockKeyholeOpen, Split, Unlink2 } from "lucide-react";
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type Dispatch, type SetStateAction } from "react";
import { ToolbarHideSelectedIcon } from "@/components/icons";
import { t, type MessageKey } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
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
  normalizeGearHelixAngle,
  normalizeGearHelixQuality,
  normalizeGearCenterHoleSize,
  normalizeGearToothSize,
  normalizeGearToothWidth,
  normalizeGearType,
  gearToothPitch,
} from "@/lib/gearGeometry";
import { displayStepFromMillimeters, displayToMillimeters, formatMeasurementNumber, lengthDisplayUnit, measurementOptionLabel, millimetersToDisplay, parseMeasurementInput } from "@/lib/measurementUnits";
import { MIN_REGION_SIZE, type ResizeRegion } from "@/lib/regionResize";
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
import { linkedResizeValues, normalizeShapeOpacity, NO_LINKED_RESIZE_AXES, RESIZE_AXES, resizeAxisIsLinked, resizedShapeSize, shapeDepth, shapeHasTaper, shapeOverallFootprintDimensions, shapeSideHeightPatch, shapeSideHeights, shapeSupportsExtrudeDeform, shapeTaperDimensions, shapeTopFaceEdgePatch, shapeTopFaceEdges, shapeWidth, type LinkedResizeAxes, type ResizeAxis } from "@/lib/workplaneShapes";
import { normalizeSketchRevolveSettings } from "@/lib/sketchRevolve";
import { MAX_HIGH_RESOLUTION_SIDES, MAX_HIGH_RESOLUTION_STEPS } from "@/lib/workplaneSettings";
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
import type { GearType, GridSize, LoftProfileShape, MeasurementAccuracy, ThreadDrive, ThreadShapeParams, WorkplaneShape, WorkplaneWorkspaceSettings } from "@/types/sketchforge";

const GRID_SIZES: GridSize[] = ["Off", "0.1 mm", "0.25 mm", "0.5 mm", "1.0 mm", "2.0 mm", "5.0 mm", "Brick"];
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
  return ["radius", "length", "width", "height", "bevel", "topRadius", "baseRadius", "thickness", "toothSize", "toothWidth", "centerHole", "topLength", "topWidth", "bottomLength", "bottomWidth", "diameter", "pitch", "threadLength", "clearance", "headHeight", "chamfer", "headChamfer", "rimChamfer", "wire", "x", "y", "z", "crossSize", "markerSize"].includes(id);
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
      { id: "sides", label: t("prop.sides"), value: settings.sides, min: 3, max: MAX_HIGH_RESOLUTION_SIDES, step: 1, onChange: (sides) => updateRevolve({ sides }) },
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
      { id: "length", label: t("prop.length"), value: depth, min: MIN_SHAPE_SIZE, max: 160, onChange: setDepth },
      { id: "width", label: t("prop.width"), value: width, min: MIN_SHAPE_SIZE, max: 160, onChange: setWidth },
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
  onInteractionActiveChange,
  linkedAxes = NO_LINKED_RESIZE_AXES,
  onLinkedAxesChange,
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
  resizeRegion?: ResizeRegion | null;
  onResizeRegionChange?: (region: ResizeRegion) => void;
  /** Die Verjuengung auf den Teilbereich legen - sie wird sofort ins Netz gerechnet. */
  onRegionTaper?: (taper: RegionTaper) => void;
  onSnapChange: Dispatch<SetStateAction<GridSize>>;
  onSnapOpenChange: Dispatch<SetStateAction<boolean>>;
  onEditSketch?: () => void;
  canSeparateParts?: boolean;
  onSeparateParts?: () => void;
  onInteractionActiveChange?: (active: boolean) => void;
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
  const gearType = shape.kind === "gear" ? normalizeGearType(shape.gearType) : null;
  const primaryProperties = shape.kind === "gear"
    ? properties.filter((property) => ["centerHole", "length", "width", "height"].includes(property.id))
    : properties;
  const gearTeethProperties = shape.kind === "gear"
    ? properties.filter((property) => ["teeth", "toothSize", "toothWidth"].includes(property.id))
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
  // Y = elevation (underside height). Slider range follows the workspace size;
  // the number field accepts any value (allowsAboveSliderMax), incl. negative.
  const positionBound = Math.max(200, (workspace.width ?? 200), (workspace.depth ?? 200));
  const positionProperties: ShapePropertyConfig[] = [
    { id: "x", label: "X", value: shape.x ?? 0, min: -positionBound, max: positionBound, step: 0.1, onChange: (x) => onUpdate({ x }) },
    { id: "y", label: "Y", value: shape.elevation ?? 0, min: -positionBound, max: positionBound, step: 0.1, onChange: (elevation) => onUpdate({ elevation }) },
    { id: "z", label: "Z", value: shape.z ?? 0, min: -positionBound, max: positionBound, step: 0.1, onChange: (z) => onUpdate({ z }) },
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
              properties={regionBoundProperties(shape, resizeRegion, onResizeRegionChange)}
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
            <ShapePropertyRows properties={primaryProperties} workspace={workspace} disabled={locked || Boolean(resizeRegion)} onInteractionActiveChange={onInteractionActiveChange} />
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
      <div className="inspector-snap-dock">
        <SnapGridControl snap={snap} snapOpen={snapOpen} onSnapChange={onSnapChange} onSnapOpenChange={onSnapOpenChange} />
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
function regionBoundProperties(shape: WorkplaneShape, region: ResizeRegion, onChange: (region: ResizeRegion) => void): ShapePropertyConfig[] {
  const width = shapeWidth(shape);
  const depth = shapeDepth(shape);
  const rows: Array<{ id: string; label: string; lo: keyof ResizeRegion; hi: keyof ResizeRegion; min: number; max: number }> = [
    { id: "length", label: t("prop.length"), lo: "minZ", hi: "maxZ", min: -depth / 2, max: depth / 2 },
    { id: "width", label: t("prop.width"), lo: "minX", hi: "maxX", min: -width / 2, max: width / 2 },
    { id: "height", label: t("prop.height"), lo: "minY", hi: "maxY", min: 0, max: shape.height },
  ];
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
  onInteractionActiveChange,
}: {
  properties: ShapePropertyConfig[];
  workspace: WorkplaneWorkspaceSettings;
  disabled?: boolean;
  onInteractionActiveChange?: (active: boolean) => void;
}) {
  return properties.map((property) => {
    if (property.type === "text") {
      return <TextProperty key={property.id} {...property} disabled={disabled} onInteractionActiveChange={onInteractionActiveChange} />;
    }
    if (property.type === "select") {
      return <SelectProperty key={property.id} {...property} disabled={disabled} />;
    }
    return <RangeProperty key={property.id} {...property} workspace={workspace} disabled={disabled} onInteractionActiveChange={onInteractionActiveChange} />;
  });
}

export function SnapGridControl({
  snap,
  snapOpen,
  onSnapChange,
  onSnapOpenChange,
}: {
  snap: GridSize;
  snapOpen: boolean;
  onSnapChange: Dispatch<SetStateAction<GridSize>>;
  onSnapOpenChange: Dispatch<SetStateAction<boolean>>;
}) {
  return (
    <div className="snap-row">
      <span>{t("inspector.snapGrid")}</span>
      <button className="snap-select" onClick={() => onSnapOpenChange((value) => !value)}>
        {measurementOptionLabel(snap)}
        <ChevronDown size={12} fill="currentColor" />
      </button>
      {snapOpen ? (
        <div className="snap-menu">
          {GRID_SIZES.map((size) => (
            <button
              key={size}
              className={size === snap ? "selected" : ""}
              onClick={() => {
                onSnapChange(size);
                onSnapOpenChange(false);
              }}
            >
              {measurementOptionLabel(size)}
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
  onChange,
  onInteractionActiveChange,
}: RangePropertyConfig & { workspace: WorkplaneWorkspaceSettings; disabled?: boolean; onInteractionActiveChange?: (active: boolean) => void }) {
  const allowsAboveSliderMax = ["length", "width", "height", "diameter", "pitch", "threadLength", "clearance", "segments", "x", "y", "z"].includes(id)
    || id.endsWith("Length") || id.endsWith("Width");
  const isLength = propertyUsesLengthUnit(id);
  const accuracy = workspace.accuracy;
  const actualValue = Math.max(min, Number.isFinite(value) ? value : min);
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
  const commitDraft = () => {
    const next = parseMeasurementInput(draft);
    const finiteNext = Number.isFinite(next) ? next : controlValue;
    const nextModelValue = toModelValue(finiteNext);
    onChange(allowsAboveSliderMax ? Math.max(min, nextModelValue) : clamp(nextModelValue, min, max));
    setEditing(false);
    onInteractionActiveChange?.(false);
  };
  const handleSliderChange = (nextValue: number) => {
    const next = clamp(Number.isFinite(nextValue) ? nextValue : controlMin, controlMin, controlMax);
    onChange(clamp(toModelValue(next), min, max));
    setDraft(formatPropertyNumber(next, accuracy, controlStep));
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
              setDraft(formatPropertyNumber(controlValue, accuracy, controlStep));
              setEditing(true);
              selectWholeValue(event.currentTarget);
            }}
            onChange={(event) => setDraft(event.currentTarget.value)}
            onBlur={commitDraft}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur();
              } else if (event.key === "Escape") {
                setDraft(formatPropertyNumber(controlValue, accuracy, controlStep));
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
