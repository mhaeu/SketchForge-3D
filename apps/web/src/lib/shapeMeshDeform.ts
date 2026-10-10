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

/**
 * Wie viel Drall eine Bandhoehe hoechstens tragen darf, in Grad.
 *
 * Ein Drall dreht die Deckflaeche gegen die Grundflaeche. Zwischen zwei
 * Hoehenlagen des Netzes laeuft die Kante aber geradlinig, und eine Gerade
 * zwischen zwei Punkten eines Kreisbogens liegt innerhalb davon: Der Koerper
 * wird in der Mitte eingeschnuert. Gemessen an einem Kasten 20 x 20 x 40 mit
 * 90 Grad Drall, dessen Netz nur zwei Hoehenlagen hat: Die Ecke sollte bei
 * halber Hoehe auf einem Halbmesser von 14,14 mm stehen, die gerade
 * Verbindung bringt sie auf 10,00 mm - 4,14 mm zu schmal, im Bild und in der
 * Druckdatei.
 *
 * Mit 7,5 Grad je Band bleibt der Fehler bei demselben Koerper unter 0,03 mm
 * (r * (1 - cos(3,75 Grad))). Derselbe Schritt, mit dem Layerling verdrehte
 * Koerper exakt baut.
 */
const TWIST_DEGREES_PER_BAND = 7.5;

/** Hoechstens so viele Baender - ein Drall von 720 Grad braucht 96. */
const MAX_TWIST_BANDS = 96;

/**
 * In wie viele Baender das Netz geschnitten werden muss, damit sein Drall
 * rund laeuft. 1 heisst: nichts zu tun.
 *
 * Nur der Drall braucht das. Verjuengung, abgesenkte Seiten und der Versatz
 * der Deckflaeche sind lineare Abbildungen - sie lassen Geraden gerade, also
 * bringt eine Unterteilung dort nichts.
 */
export function twistBandCount(shape: Pick<WorkplaneShape, "extrudeTwist">) {
  const twist = Math.abs(shape.extrudeTwist ?? 0);
  if (!(twist > 1e-6)) return 1;
  return Math.min(MAX_TWIST_BANDS, Math.max(1, Math.ceil(twist / TWIST_DEGREES_PER_BAND)));
}

/** Die Hoehen, an denen geschnitten wird - die Raender selbst nicht. */
export function twistBandPlanes(minY: number, maxY: number, bands: number): number[] {
  if (!(bands > 1) || !(maxY > minY)) return [];
  const planes: number[] = [];
  for (let band = 1; band < bands; band += 1) planes.push(minY + ((maxY - minY) * band) / bands);
  return planes;
}

type SoupPoint = { x: number; y: number; z: number };

/** Sutherland-Hodgman gegen eine waagerechte Ebene, fuer `keepAbove` oder darunter. */
function clipPolygonAtHeight(polygon: readonly SoupPoint[], height: number, keepAbove: boolean): SoupPoint[] {
  const inside = (point: SoupPoint) => (keepAbove ? point.y >= height : point.y <= height);
  const result: SoupPoint[] = [];
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index];
    const next = polygon[(index + 1) % polygon.length];
    const currentInside = inside(current);
    if (currentInside) result.push(current);
    if (currentInside !== inside(next)) {
      const span = next.y - current.y;
      // Die Kante kreuzt die Ebene; ohne Hoehenunterschied gaebe es keinen
      // Wechsel, also ist `span` hier nie null.
      const share = (height - current.y) / span;
      result.push({
        x: current.x + (next.x - current.x) * share,
        y: height,
        z: current.z + (next.z - current.z) * share,
      });
    }
  }
  return result;
}

function pushFan(target: number[], polygon: readonly SoupPoint[]) {
  for (let index = 1; index + 1 < polygon.length; index += 1) {
    const a = polygon[0];
    const b = polygon[index];
    const c = polygon[index + 1];
    target.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  }
}

/**
 * Jedes Dreieck an den gegebenen Hoehen durchschneiden.
 *
 * `positions` ist ein Dreieckshaufen (je neun Zahlen ein Dreieck), und
 * genauso kommt er zurueck. Die Umlaufrichtung bleibt erhalten, weil jedes
 * Bruchstueck als Faecher aus dem geschnittenen Vieleck entsteht und dieses
 * die Reihenfolge des Dreiecks behaelt.
 *
 * Ein Dreieck, das eine Ebene nur beruehrt, faellt beim Schneiden in ein
 * Dreieck und ein entartetes Vieleck; das entartete liefert keine Flaeche und
 * wird vom Faecher uebersprungen.
 */
export function subdivideTrianglesByHeight(positions: ArrayLike<number>, planes: readonly number[]): number[] {
  if (planes.length === 0) return Array.from(positions);
  let current: number[] = Array.from(positions);
  for (const height of planes) {
    const next: number[] = [];
    for (let offset = 0; offset + 8 < current.length; offset += 9) {
      const triangle: SoupPoint[] = [
        { x: current[offset], y: current[offset + 1], z: current[offset + 2] },
        { x: current[offset + 3], y: current[offset + 4], z: current[offset + 5] },
        { x: current[offset + 6], y: current[offset + 7], z: current[offset + 8] },
      ];
      const lowest = Math.min(triangle[0].y, triangle[1].y, triangle[2].y);
      const highest = Math.max(triangle[0].y, triangle[1].y, triangle[2].y);
      /*
       * Liegt die Ebene nicht echt dazwischen, bleibt das Dreieck, wie es
       * ist - und zwar Zahl fuer Zahl kopiert, nicht ueber ein
       * Zwischenstueck: Bei einem dichten eingelesenen Netz kreuzt die
       * grosse Mehrheit der Dreiecke keine Ebene, und dieser Zweig laeuft
       * dann Bandzahl mal ueber alles.
       */
      if (!(lowest < height && highest > height)) {
        for (let copy = 0; copy < 9; copy += 1) next.push(current[offset + copy]);
        continue;
      }
      pushFan(next, clipPolygonAtHeight(triangle, height, false));
      pushFan(next, clipPolygonAtHeight(triangle, height, true));
    }
    current = next;
  }
  return current;
}
