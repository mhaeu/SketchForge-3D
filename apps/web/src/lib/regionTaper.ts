import * as THREE from "three";
import { meshYawDegrees, type ShapeSides } from "@/lib/workplaneShapes";
import { MIN_REGION_SIZE, type ResizeRegion } from "@/lib/regionResize";
import type { WorkplaneShape } from "@/types/sketchforge";

/**
 * Die Verjuengung eines Teilbereichs.
 *
 * `edges` sind die vier Kanten der Deckflaeche des Kastens, in mm von dessen
 * Mitte aus - genau wie am ganzen Koerper. `heights` ist der Anteil der
 * Kastenhoehe, den er an jeder Seite noch stehen laesst.
 */
export type RegionTaper = {
  edges: ShapeSides;
  heights: ShapeSides;
};

/** Der Kasten, wie er ist: nichts verjuengt, nichts abgesenkt. */
export function untouchedRegionTaper(region: ResizeRegion): RegionTaper {
  const centreX = (region.minX + region.maxX) / 2;
  const centreZ = (region.minZ + region.maxZ) / 2;
  return {
    edges: {
      left: region.minX - centreX,
      right: region.maxX - centreX,
      front: region.minZ - centreZ,
      back: region.maxZ - centreZ,
    },
    heights: { left: 1, right: 1, front: 1, back: 1 },
  };
}

export function regionTaperIsUntouched(region: ResizeRegion, taper: RegionTaper) {
  const plain = untouchedRegionTaper(region);
  return (["left", "right", "front", "back"] as const).every((side) =>
    Math.abs(taper.edges[side] - plain.edges[side]) < 1e-6 && Math.abs(taper.heights[side] - 1) < 1e-9);
}

/**
 * Die Verjuengung auf die Scheibe zwischen `minY` und `maxY` legen.
 *
 * Gearbeitet wird ueber die Hoehe, nicht ueber den Grundriss: Unterhalb der
 * Scheibe bleibt alles stehen, in ihr waechst die Verjuengung von null auf
 * ihr volles Mass, und oberhalb faehrt das Material starr mit. Damit ist die
 * Abbildung ueberall stetig, das Netz bleibt dicht, und es muss nichts
 * geschnitten und keine Naht geschlossen werden.
 *
 * Das ist zugleich die Grenze: Es zaehlt die **Hoehe** des Kastens, nicht
 * seine Breite und Tiefe. Eine Verjuengung, die nur eine Ecke des Grundrisses
 * erfasst, liesse eine senkrechte Wand mitten im Koerper stehen - und die
 * muesste geschnitten und wieder zugenaeht werden.
 */
export function taperPositionsInSlice(positions: readonly number[], region: ResizeRegion, taper: RegionTaper): number[] {
  const centreX = (region.minX + region.maxX) / 2;
  const centreZ = (region.minZ + region.maxZ) / 2;
  const width = Math.max(MIN_REGION_SIZE, region.maxX - region.minX);
  const depth = Math.max(MIN_REGION_SIZE, region.maxZ - region.minZ);
  const height = Math.max(MIN_REGION_SIZE, region.maxY - region.minY);

  const topWidth = Math.max(0, taper.edges.right - taper.edges.left);
  const topDepth = Math.max(0, taper.edges.back - taper.edges.front);
  const scaleX = topWidth / width;
  const scaleZ = topDepth / depth;
  const shiftX = (taper.edges.left + taper.edges.right) / 2;
  const shiftZ = (taper.edges.front + taper.edges.back) / 2;

  const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
  const standingShare = (x: number, z: number) => {
    const u = clamp01((x - region.minX) / width);
    const v = clamp01((z - region.minZ) / depth);
    const alongWidth = taper.heights.left + (taper.heights.right - taper.heights.left) * u;
    const alongDepth = taper.heights.front + (taper.heights.back - taper.heights.front) * v;
    return Math.max(0, alongWidth + alongDepth - 1);
  };

  const out = positions.slice() as number[];
  for (let index = 0; index + 2 < out.length; index += 3) {
    const x = out[index];
    const y = out[index + 1];
    const z = out[index + 2];
    const t = clamp01((y - region.minY) / height);
    const scale = 1 + (scaleX - 1) * t;
    const scaleDepthAt = 1 + (scaleZ - 1) * t;
    out[index] = centreX + (x - centreX) * scale + shiftX * t;
    out[index + 2] = centreZ + (z - centreZ) * scaleDepthAt + shiftZ * t;
    // Die Hoehe richtet sich nach dem Grundriss, also nach dem Punkt vor der
    // Verjuengung - sonst wanderte der Keil, waehrend die Seiten sich neigen.
    const share = standingShare(x, z);
    out[index + 1] = y <= region.minY
      ? y
      : y >= region.maxY
        ? y - height * (1 - share)
        : region.minY + (y - region.minY) * share;
  }
  return out;
}

export type RegionTaperResult = {
  patch: Partial<WorkplaneShape>;
  /** Der Kasten, ausgedrueckt im Rahmen des geaenderten Koerpers. */
  region: ResizeRegion;
};

/**
 * Die Verjuengung auf das Netz legen und den Koerper um das Ergebnis herum
 * neu aufbauen - nach demselben Muster wie das Aendern des Kastens: Die
 * verformten Punkte werden das neue Grundnetz, Groesse und Lage folgen den
 * neuen Grenzen, und alles, was die alte Oberflaeche beschrieb, faellt weg.
 */
export function regionTaperedShape(shape: WorkplaneShape, region: ResizeRegion, taper: RegionTaper, displayPositions: number[]): RegionTaperResult | null {
  const mesh = shape.importedMesh;
  if (!mesh || displayPositions.length < 9) return null;
  if (regionTaperIsUntouched(region, taper)) return null;

  const positions = taperPositionsInSlice(displayPositions, region, taper);
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (let index = 0; index + 2 < positions.length; index += 3) {
    minX = Math.min(minX, positions[index]);
    maxX = Math.max(maxX, positions[index]);
    minY = Math.min(minY, positions[index + 1]);
    maxY = Math.max(maxY, positions[index + 1]);
    minZ = Math.min(minZ, positions[index + 2]);
    maxZ = Math.max(maxZ, positions[index + 2]);
  }
  if (![minX, minY, minZ, maxX, maxY, maxZ].every(Number.isFinite)) return null;

  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;
  for (let index = 0; index + 2 < positions.length; index += 3) {
    positions[index] -= centerX;
    positions[index + 1] -= minY;
    positions[index + 2] -= centerZ;
  }
  const width = Math.max(MIN_REGION_SIZE, maxX - minX);
  const height = Math.max(MIN_REGION_SIZE, maxY - minY);
  const depth = Math.max(MIN_REGION_SIZE, maxZ - minZ);

  const offset = new THREE.Vector3(centerX, minY + height / 2 - shape.height / 2, centerZ).applyEuler(
    new THREE.Euler(
      THREE.MathUtils.degToRad(shape.rotationX ?? 0),
      THREE.MathUtils.degToRad(meshYawDegrees(shape)),
      THREE.MathUtils.degToRad(shape.rotationZ ?? 0),
      "XYZ",
    ),
  );
  const elevation = (shape.elevation ?? 0) + shape.height / 2 + offset.y - height / 2;

  return {
    patch: {
      x: shape.x + offset.x,
      z: shape.z + offset.z,
      elevation,
      width,
      depth,
      height,
      size: Math.max(width, depth),
      importedMesh: {
        ...mesh,
        positions,
        normals: undefined,
        baseWidth: width,
        baseDepth: depth,
        baseHeight: height,
        triangleCount: Math.floor(positions.length / 9),
        brepStep: undefined,
      },
      edgeTreatments: undefined,
      edgeTreatmentHistory: undefined,
      edgeResizeMode: undefined,
      cadDisplayEdges: undefined,
      cadDisplayEdgesVersion: undefined,
      cadBrep: undefined,
      cadBrepFrame: undefined,
      cadPrimitiveFrame: undefined,
      threadParams: undefined,
    },
    /*
     * Der Kasten selbst aendert seine Form nicht - nur das Netz in ihm. Er
     * wird also bloss um das Zurechtruecken versetzt weitergereicht; wo er
     * dadurch ueber den Koerper hinausragt, holt ihn der Aufrufer mit
     * `clampRegionToShape` zurueck.
     */
    region: {
      minX: region.minX - centerX,
      maxX: region.maxX - centerX,
      minY: region.minY - minY,
      maxY: region.maxY - minY,
      minZ: region.minZ - centerZ,
      maxZ: region.maxZ - centerZ,
    },
  };
}
