import type { OcctKernel, ShapeHandle } from "occt-wasm";
import { cadSketchRegions, type OrderedCadSketchPath } from "@/lib/sketchCadProfile";
import { segmentArcGeometry } from "@/lib/sketchArcs";
import type { SketchProfile } from "@/types/sketchforge";

/**
 * cadSketchRevolve.ts
 *
 * Ein gedrehter Umriss als genauer Koerper, gebaut wie eine Hochziehung: der
 * Kern dreht die Flaeche um die Achse, statt dass wir ein Netz aus Scheiben
 * zusammensetzen.
 *
 * Der Unterschied ist nicht nur Genauigkeit. Ein Netz ist fuer den CAD-Kern
 * ein Haufen Dreiecke; Aushoehlen, Verrunden und Fasen scheitern daran oder
 * geben Unsinn. Ein gedrehter Becher liess sich darum nicht aushoehlen,
 * selbst bei 0,2 mm Wand. Als genauer Koerper geht es.
 *
 * Steht hier und nicht im Arbeiter, damit die Durchlaufpruefungen ihn gegen
 * den echten Kern laufen lassen koennen. Nach Layerling 1.48.0 (#167), mit
 * zwei Unterschieden bei uns: Boegen werden als Boegen gebaut (wie in unserer
 * Hochziehung), und der volle Querschnitt bleibt beim Netz - siehe
 * `shapeFromRevolvedSketchProfile`.
 */

/** So weit darf ein Punkt rechts der Achse stehen und noch als auf ihr gelten. */
const AXIS_TOLERANCE = 1e-6;

/**
 * Liegt der Umriss ganz links der Achse (x <= 0), so wie die Skizzenansicht
 * ihn zeichnet?
 *
 * Nur dann kann der Kern ihn drehen. Ein Umriss, der die Achse ueberquert,
 * geht ans Netz - das schneidet ihn an der Achse ab (siehe
 * `clipClosedPathToRevolveSide`), was der Kern nicht tut.
 */
export function revolveProfileFitsAxis(profile: SketchProfile) {
  return profile.points.length > 0 && profile.points.every((point) =>
    point.x <= AXIS_TOLERANCE
    && (!point.handleIn || point.handleIn.x <= AXIS_TOLERANCE)
    && (!point.handleOut || point.handleOut.x <= AXIS_TOLERANCE));
}

export type CadSketchPointMap = (point: { x: number; z: number }) => { x: number; y: number; z: number };

/**
 * Ein geschlossener Zug als Draht im Kern.
 *
 * `map` legt fest, wo die Skizzenebene im Raum liegt: flach bei der
 * Hochziehung, aufgestellt beim Drehen. Der Rest ist fuer beide gleich - und
 * steht deshalb nur einmal hier, nicht noch einmal im Arbeiter.
 */
export function cadSketchPathWire(cad: OcctKernel, path: OrderedCadSketchPath, map: CadSketchPointMap) {
  const edges = path.steps.map(({ segment, from, to }) => {
    // Ein Bogen wird als Bogen gebaut, nicht als Kurve, die einem aehnlich
    // sieht: Der Kern legt ihn durch Anfang, Scheitel und Ende.
    const arc = segmentArcGeometry(segment, from, to);
    if (arc) {
      return cad.makeArcEdge(map(from), map(arc.apex), map(to));
    }
    const forward = segment.startId === from.id;
    const first = forward ? from.handleOut : from.handleIn;
    const second = forward ? to.handleIn : to.handleOut;
    if (segment.kind !== "line" && first && second) {
      return cad.makeBezierEdge([map(from), map(first), map(second), map(to)]);
    }
    return cad.makeLineEdge(map(from), map(to));
  });
  return cad.makeWire(edges);
}

/** Die Skizzenebene flach hingelegt: so zieht die Hochziehung sie hoch. */
export const FLAT_SKETCH_POINT_MAP: CadSketchPointMap = (point) => ({ x: point.x, y: 0, z: point.z });

/**
 * Die Skizzenebene aufgestellt: der Abstand von der Achse laeuft ueber x, die
 * Hoehe ueber y. Die Skizze zeichnet ihr x links der Achse und ihr z nach
 * unten, also kippen beide - dieselbe Zuordnung, die auch das Netz benutzt.
 */
function sectionPointMap(maxZ: number): CadSketchPointMap {
  return (point) => ({ x: Math.max(0, -point.x), y: maxZ - point.z, z: 0 });
}

/**
 * Der genaue Drehkoerper eines Umrisses um die senkrechte Achse, von
 * `startAngle` Grad ueber `sweepAngle` hinweg (ein negativer Ueberstrich geht
 * andersherum, wie beim Netz).
 *
 * Wirft, wenn der Umriss nicht ganz links der Achse liegt oder keinen
 * geschlossenen Zug hat - der Aufrufer faellt dann auf das Netz zurueck.
 */
export function buildRevolvedSketchSolid(cad: OcctKernel, profile: SketchProfile, startAngle: number, sweepAngle: number): ShapeHandle {
  if (!revolveProfileFitsAxis(profile)) throw new Error("status.revolveProfileCrossesAxis");
  const regions = cadSketchRegions(profile);
  if (regions.length === 0) throw new Error("status.cadNoClosedProfile");
  const maxZ = Math.max(...profile.points.flatMap((point) => [point.z, point.handleIn?.z ?? point.z, point.handleOut?.z ?? point.z]));
  const map = sectionPointMap(maxZ);
  const sweep = Math.abs(sweepAngle);
  const angle = Math.min(2 * Math.PI, (sweep * Math.PI) / 180);
  const rotation = sweepAngle < 0 ? startAngle + sweepAngle : startAngle;
  const axis = { point: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 1, z: 0 } };
  const solids: ShapeHandle[] = regions.map((region) => {
    let face = cad.makeFace(cadSketchPathWire(cad, region.outer, map));
    if (region.holes.length > 0) face = cad.addHolesInFace(face, region.holes.map((hole) => cadSketchPathWire(cad, hole, map)));
    let solid = cad.revolve(face, axis, angle);
    if (Math.abs(rotation) > 1e-8) solid = cad.rotate(solid, axis, (rotation * Math.PI) / 180);
    return solid;
  });
  const result = solids.length === 1 ? solids[0] : cad.makeCompound(solids);
  if (!cad.isValid(result)) throw new Error("status.cadInvalidTopology");
  return result;
}
