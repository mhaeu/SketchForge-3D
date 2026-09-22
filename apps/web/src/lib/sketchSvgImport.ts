import * as THREE from "three";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";
import { createLocalId } from "@/lib/localIds";
import { normalizeSvgUseReferences, pathIsVisible, subPathIsClosed, validateSvgSourcePreflight } from "@/lib/svgImport";
import type { SketchPoint, SketchProfile, SketchSegment } from "@/types/sketchforge";

/** Wie fein eine Kurve in Punkte zerlegt wird. */
const CURVE_SEGMENTS = 24;

/** Wie gross die eingelesene Zeichnung hoechstens auf die Skizzenflaeche kommt. */
export const SKETCH_SVG_MAX_SIZE = 80;

/** Punkte, die naeher beieinander liegen, sind derselbe Punkt. */
const MERGE_TOLERANCE = 1e-4;

export type SketchSvgGeometry = {
  points: SketchPoint[];
  segments: SketchSegment[];
  /** Wie viele Linienzuege die Zeichnung hergab. */
  contours: number;
};

function cleanContour(points: THREE.Vector2[]) {
  const cleaned: THREE.Vector2[] = [];
  points.forEach((point) => {
    const previous = cleaned[cleaned.length - 1];
    if (previous && previous.distanceTo(point) <= MERGE_TOLERANCE) return;
    cleaned.push(point);
  });
  return cleaned;
}

/**
 * Die Linienzuege einer SVG-Zeichnung, wie sie gezeichnet wurden - gefuellte
 * Flaechen ebenso wie offene Striche. Fuer die Skizze zaehlt der Umriss, nicht
 * die Fuellung: was hier herauskommt, sind Punkte und Strecken, die man danach
 * wie von Hand gezeichnete weiterbearbeiten kann.
 */
function contoursFromPaths(paths: readonly THREE.ShapePath[]) {
  const contours: Array<{ points: THREE.Vector2[]; closed: boolean }> = [];
  paths.filter(pathIsVisible).forEach((path) => {
    path.subPaths.forEach((subPath) => {
      const closed = subPathIsClosed(subPath);
      const points = cleanContour(subPath.getPoints(CURVE_SEGMENTS));
      // Ein geschlossener Zug traegt seinen Anfangspunkt am Ende noch einmal;
      // als Punkt der Skizze waere er einer zu viel.
      if (closed && points.length > 1 && points[0].distanceTo(points[points.length - 1]) <= MERGE_TOLERANCE) {
        points.pop();
      }
      if (points.length >= 2) contours.push({ points, closed });
    });
  });
  return contours;
}

/**
 * Wandelt eine SVG-Datei in Skizzengeometrie um: mittig auf der Zeichenebene
 * und auf `maxSize` gebracht, falls sie groesser ist. Verkleinert wird nur -
 * eine Zeichnung, die schon in Millimetern gedacht ist, behaelt ihr Mass.
 */
export function sketchGeometryFromPaths(paths: readonly THREE.ShapePath[], maxSize = SKETCH_SVG_MAX_SIZE): SketchSvgGeometry {
  const contours = contoursFromPaths(paths);
  if (!contours.length) {
    throw new Error("Diese SVG-Datei enthält keine sichtbaren Linien");
  }

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  contours.forEach(({ points }) => points.forEach((point) => {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }));
  const width = maxX - minX;
  const height = maxY - minY;
  const largest = Math.max(width, height);
  const scale = largest > maxSize && largest > 0 ? maxSize / largest : 1;
  const centreX = (minX + maxX) / 2;
  const centreY = (minY + maxY) / 2;

  const points: SketchPoint[] = [];
  const segments: SketchSegment[] = [];
  contours.forEach((contour) => {
    // Die Hochachse der Zeichenflaeche zeigt wie die der SVG-Datei nach unten,
    // also kommt die Zeichnung so an, wie sie gezeichnet wurde.
    const contourPoints = contour.points.map((point) => ({
      id: createLocalId("sketch-point"),
      x: Number(((point.x - centreX) * scale).toFixed(4)),
      z: Number(((point.y - centreY) * scale).toFixed(4)),
      mode: "corner" as const,
    }));
    points.push(...contourPoints);
    const lastIndex = contour.closed ? contourPoints.length : contourPoints.length - 1;
    for (let index = 0; index < lastIndex; index += 1) {
      segments.push({
        id: createLocalId("sketch-segment"),
        startId: contourPoints[index].id,
        endId: contourPoints[(index + 1) % contourPoints.length].id,
        kind: "line",
      });
    }
  });

  return { points, segments, contours: contours.length };
}

/** Haengt die eingelesene Zeichnung an eine bestehende Skizze an. */
export function sketchProfileWithSvg(profile: SketchProfile, geometry: SketchSvgGeometry): SketchProfile {
  return {
    ...profile,
    points: [...profile.points, ...geometry.points],
    segments: [...profile.segments, ...geometry.segments],
  };
}

/**
 * Dasselbe, ausgehend von der Datei. Das Zerlegen der XML-Datei braucht den
 * Browser (SVGLoader liest sie mit dem DOMParser), deshalb liegt es getrennt
 * von der Rechnung darueber - genau wie beim Import als Koerper.
 */
export function sketchGeometryFromSvg(source: string, maxSize = SKETCH_SVG_MAX_SIZE): SketchSvgGeometry {
  validateSvgSourcePreflight(source);
  const parsed = new SVGLoader().parse(normalizeSvgUseReferences(source));
  return sketchGeometryFromPaths(parsed.paths, maxSize);
}
