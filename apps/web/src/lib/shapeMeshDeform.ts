import {
  shapeDepth,
  shapeExtrudeDeformAt,
  shapeHasExtrudeDeform,
  shapeHasSideHeights,
  shapeSideHeightScaleAtShare,
  shapeTaperScaleAt,
  shapeWidth,
} from "@/lib/workplaneShapes";
import type { WorkplaneShape } from "@/types/sketchforge";

/** Der Raum, in dem die Punkte liegen, die verformt werden sollen. */
export type ShapeDeformBox = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
};

export type ShapeDeformPoint = { x: number; y: number; z: number };

/**
 * Einen Punkt eines Koerpernetzes verformen: Verjuengung, abgesenkte Seiten,
 * Drall und Versatz der Deckflaeche - alles in einem Durchgang.
 *
 * Der Kasten sagt, in welchem Massstab die Punkte stehen. Das ist keine
 * Kleinigkeit: Viele Grundkoerper liegen als Einheitsnetz vor und werden erst
 * am Objekt auf ihre Masse gezogen - ein Quader ist dann ein Wuerfel der
 * Kantenlaenge eins. Verhaeltnisse wie die Verjuengung ueberstehen das
 * unbeschadet, ein Mass in Millimetern nicht: Ein Versatz von drei schoebe die
 * Deckflaeche eines Einheitswuerfels um drei Kantenlaengen weit weg. Deshalb
 * wird jedes Mass erst in den Massstab des Kastens gebracht.
 */
export function deformShapePoint(shape: WorkplaneShape, box: ShapeDeformBox, point: ShapeDeformPoint): ShapeDeformPoint {
  const height = Math.max(1e-6, box.maxY - box.minY);
  const localWidth = Math.max(1e-6, box.maxX - box.minX);
  const localDepth = Math.max(1e-6, box.maxZ - box.minZ);
  const centreX = (box.minX + box.maxX) / 2;
  const centreZ = (box.minZ + box.maxZ) / 2;
  const toLocalX = localWidth / Math.max(1e-6, shapeWidth(shape));
  const toLocalZ = localDepth / Math.max(1e-6, shapeDepth(shape));

  const normalizedHeight = (point.y - box.minY) / height;
  const widthScale = shapeTaperScaleAt(shape, normalizedHeight, "width");
  const depthScale = shapeTaperScaleAt(shape, normalizedHeight, "depth");

  // Die Hoehe an dieser Stelle richtet sich nach der Grundflaeche, also nach
  // dem Punkt vor der Verjuengung - sonst wanderte der Keil mit, waehrend die
  // Seiten sich neigen.
  const y = shapeHasSideHeights(shape)
    ? box.minY + (point.y - box.minY) * shapeSideHeightScaleAtShare(
      shape,
      (point.x - box.minX) / localWidth,
      (point.z - box.minZ) / localDepth,
    )
    : point.y;

  let x = centreX + (point.x - centreX) * widthScale;
  let z = centreZ + (point.z - centreZ) * depthScale;
  if (shapeHasExtrudeDeform(shape)) {
    const deform = shapeExtrudeDeformAt(shape, normalizedHeight);
    const cos = Math.cos(deform.twistRadians);
    const sin = Math.sin(deform.twistRadians);
    const relativeX = x - centreX;
    const relativeZ = z - centreZ;
    x = centreX + relativeX * cos - relativeZ * sin + deform.offsetX * toLocalX;
    z = centreZ + relativeX * sin + relativeZ * cos + deform.offsetZ * toLocalZ;
  }
  return { x, y, z };
}
