import * as THREE from "three";
import { meshYawDegrees, type ShapeSides } from "@/lib/workplaneShapes";
import { MIN_REGION_SIZE, taperPositionsInRegion, type ResizeRegion } from "@/lib/regionResize";
import type { WorkplaneShape } from "@/types/sketchforge";

/**
 * Die Verjuengung eines Teilbereichs.
 *
 * `edges` sind die vier Kanten der Deckflaeche des Kastens, in mm von dessen
 * Mitte aus - genau wie am ganzen Koerper. `heights` ist der Anteil der
 * Kastenhoehe, den er an jeder Seite noch stehen laesst.
 *
 * Der Kasten selbst gehoert dazu, und zwar aus einem Grund: Die vier Kanten
 * sind Masse *in* ihm. Wurden sie an einem Kasten abgelesen und an einem
 * anderen aufgetragen, so bedeutet schon der unveraenderte Stand eine
 * Verschiebung - das Objekt verzerrt sich, ohne dass jemand etwas
 * eingestellt haette. Weil beides zusammengehoert, reist es zusammen.
 */
export type RegionTaper = {
  box: ResizeRegion;
  edges: ShapeSides;
  heights: ShapeSides;
};

/** Der Kasten, wie er ist: nichts verjuengt, nichts abgesenkt. */
export function untouchedRegionTaper(region: ResizeRegion): RegionTaper {
  const centreX = (region.minX + region.maxX) / 2;
  const centreZ = (region.minZ + region.maxZ) / 2;
  return {
    box: { ...region },
    edges: {
      left: region.minX - centreX,
      right: region.maxX - centreX,
      front: region.minZ - centreZ,
      back: region.maxZ - centreZ,
    },
    heights: { left: 1, right: 1, front: 1, back: 1 },
  };
}

export function regionTaperIsUntouched(taper: RegionTaper) {
  const plain = untouchedRegionTaper(taper.box);
  return (["left", "right", "front", "back"] as const).every((side) =>
    Math.abs(taper.edges[side] - plain.edges[side]) < 1e-6 && Math.abs(taper.heights[side] - 1) < 1e-9);
}

/**
 * Die Verjuengung auf den Kasten legen.
 *
 * Die Arbeit selbst - schneiden, Naehte suchen, Baender einziehen - macht
 * `taperPositionsInRegion` mit derselben Maschinerie, die auch den Kasten
 * aendert. Hier steht nur, wie die acht Werte dorthin gereicht werden.
 */
export function taperRegionPositions(positions: readonly number[], taper: RegionTaper): number[] {
  return taperPositionsInRegion(positions.slice() as number[], taper.box, taper.edges, taper.heights);
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
export function regionTaperedShape(shape: WorkplaneShape, taper: RegionTaper, displayPositions: number[]): RegionTaperResult | null {
  const mesh = shape.importedMesh;
  if (!mesh || displayPositions.length < 9) return null;
  if (regionTaperIsUntouched(taper)) return null;

  const region = taper.box;
  const positions = taperRegionPositions(displayPositions, taper);
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
      /*
       * Der parametrische Ursprung beschreibt diesen Koerper nicht mehr.
       * Er wird beim Umwandeln in ein Netz festgehalten, damit sich eine
       * Drehung spaeter wieder aufheben laesst - sobald aber das Netz selbst
       * umgebaut ist, wuerde ein Neubau daraus die ganze Arbeit am
       * Teilbereich stillschweigend wegwerfen, sobald jemand irgendeinen
       * Bauwert anfasst.
       */
      parametricSource: undefined,
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
