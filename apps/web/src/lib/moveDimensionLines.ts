export type MoveDimensionAxis = "x" | "z";

export type MoveDimensionScreenPoint = {
  x: number;
  y: number;
};

export type MoveDimensionLine = {
  axis: MoveDimensionAxis;
  value: number;
  label: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  labelX: number;
  labelY: number;
};

export type MoveDimensionGuide = {
  axis: MoveDimensionAxis;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export type MoveDimensionOverlayData = {
  width: number;
  height: number;
  lines: MoveDimensionLine[];
  guides: MoveDimensionGuide[];
};

type MoveDimensionWorldPoint = {
  x: number;
  y: number;
  z: number;
};

type CreateMoveDimensionOverlayOptions = {
  /** Der Punkt, an dem die Bemassung ansetzt, in Weltkoordinaten. */
  origin: MoveDimensionWorldPoint;
  /**
   * Die beiden Achsen, an denen gemessen wird. Ohne Angabe sind es die
   * Weltachsen - auf einer gekippten Arbeitsflaeche sind es deren eigene, und
   * dann liegen die Masslinien in der Flaeche statt daneben.
   */
  xAxis?: MoveDimensionWorldPoint;
  zAxis?: MoveDimensionWorldPoint;
  deltaX: number;
  deltaZ: number;
  accuracy: number;
  width: number;
  height: number;
  project: (point: MoveDimensionWorldPoint) => MoveDimensionScreenPoint;
};

const WORLD_X_AXIS: MoveDimensionWorldPoint = { x: 1, y: 0, z: 0 };
const WORLD_Z_AXIS: MoveDimensionWorldPoint = { x: 0, y: 0, z: 1 };

/** Ein Punkt, um `distance` laengs `axis` von `origin` entfernt. */
export function pointAlongAxis(
  origin: MoveDimensionWorldPoint,
  axis: MoveDimensionWorldPoint,
  distance: number,
): MoveDimensionWorldPoint {
  return {
    x: origin.x + axis.x * distance,
    y: origin.y + axis.y * distance,
    z: origin.z + axis.z * distance,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function formatMoveDimension(value: number, accuracy: number) {
  const zeroThreshold = 0.5 * 10 ** -accuracy;
  const normalized = Math.abs(value) < zeroThreshold ? 0 : value;
  return normalized.toFixed(accuracy);
}

export function dimensionLabelPosition(
  origin: MoveDimensionScreenPoint,
  endpoint: MoveDimensionScreenPoint,
  otherEndpoint: MoveDimensionScreenPoint,
  hasOtherDimension: boolean,
  width: number,
  height: number,
) {
  const midpoint = {
    x: (origin.x + endpoint.x) / 2,
    y: (origin.y + endpoint.y) / 2,
  };
  const dx = endpoint.x - origin.x;
  const dy = endpoint.y - origin.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const normal = { x: -dy / length, y: dx / length };
  const towardOther = (otherEndpoint.x - midpoint.x) * normal.x + (otherEndpoint.y - midpoint.y) * normal.y;
  const side = hasOtherDimension && Math.abs(towardOther) > 0.5
    ? towardOther >= 0 ? -1 : 1
    : 1;
  const offset = 30;

  return {
    x: clamp(midpoint.x + normal.x * offset * side, 48, Math.max(48, width - 48)),
    y: clamp(midpoint.y + normal.y * offset * side, 24, Math.max(24, height - 24)),
  };
}

export function dimensionLineStart(origin: MoveDimensionScreenPoint, endpoint: MoveDimensionScreenPoint) {
  const dx = endpoint.x - origin.x;
  const dy = endpoint.y - origin.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const overrun = 12;
  return {
    x: origin.x - (dx / length) * overrun,
    y: origin.y - (dy / length) * overrun,
  };
}

export function createMoveDimensionOverlay({
  origin: originWorld,
  xAxis = WORLD_X_AXIS,
  zAxis = WORLD_Z_AXIS,
  deltaX,
  deltaZ,
  accuracy,
  width,
  height,
  project,
}: CreateMoveDimensionOverlayOptions): MoveDimensionOverlayData | null {
  const zeroThreshold = 0.5 * 10 ** -accuracy;
  if (Math.abs(deltaX) < zeroThreshold && Math.abs(deltaZ) < zeroThreshold) {
    return null;
  }

  const safeScreenPoint = (point: MoveDimensionScreenPoint) => ({
    x: Number.isFinite(point.x) ? point.x : width / 2,
    y: Number.isFinite(point.y) ? point.y : height / 2,
  });
  const xEndpointWorld = pointAlongAxis(originWorld, xAxis, deltaX);
  const origin = safeScreenPoint(project(originWorld));
  const xEndpoint = safeScreenPoint(project(xEndpointWorld));
  const zEndpoint = safeScreenPoint(project(pointAlongAxis(originWorld, zAxis, deltaZ)));
  const currentAnchor = safeScreenPoint(project(pointAlongAxis(xEndpointWorld, zAxis, deltaZ)));
  const lines: MoveDimensionLine[] = [];
  const guides: MoveDimensionGuide[] = [];
  const hasXDimension = Math.abs(deltaX) >= zeroThreshold;
  const hasZDimension = Math.abs(deltaZ) >= zeroThreshold;

  if (hasXDimension) {
    const label = dimensionLabelPosition(origin, xEndpoint, zEndpoint, hasZDimension, width, height);
    const start = dimensionLineStart(origin, xEndpoint);
    lines.push({
      axis: "x",
      value: deltaX,
      label: formatMoveDimension(deltaX, accuracy),
      x1: start.x,
      y1: start.y,
      x2: xEndpoint.x,
      y2: xEndpoint.y,
      labelX: label.x,
      labelY: label.y,
    });
    if (Math.hypot(currentAnchor.x - xEndpoint.x, currentAnchor.y - xEndpoint.y) >= 1) {
      guides.push({
        axis: "x",
        x1: xEndpoint.x,
        y1: xEndpoint.y,
        x2: currentAnchor.x,
        y2: currentAnchor.y,
      });
    }
  }

  if (hasZDimension) {
    const label = dimensionLabelPosition(origin, zEndpoint, xEndpoint, hasXDimension, width, height);
    const start = dimensionLineStart(origin, zEndpoint);
    lines.push({
      axis: "z",
      value: deltaZ,
      label: formatMoveDimension(deltaZ, accuracy),
      x1: start.x,
      y1: start.y,
      x2: zEndpoint.x,
      y2: zEndpoint.y,
      labelX: label.x,
      labelY: label.y,
    });
    if (Math.hypot(currentAnchor.x - zEndpoint.x, currentAnchor.y - zEndpoint.y) >= 1) {
      guides.push({
        axis: "z",
        x1: zEndpoint.x,
        y1: zEndpoint.y,
        x2: currentAnchor.x,
        y2: currentAnchor.y,
      });
    }
  }

  return lines.length > 0 ? { width, height, lines, guides } : null;
}
