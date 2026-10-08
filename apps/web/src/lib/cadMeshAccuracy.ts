import type { Mesh, OcctKernel, ShapeHandle } from "occt-wasm";
import type { CadModifierDeflection } from "@/lib/cadModifierTypes";

/**
 * cadMeshAccuracy.ts
 *
 * Haelt das Netz einer Kantenbearbeitung innerhalb seiner eigenen Grenze.
 *
 * Die lineare Abweichung ist eine Zusage: So weit darf eine Dreieckskante
 * hoechstens von der wahren Flaeche abliegen (die Sehnenhoehe). OpenCascade
 * haelt sie nicht ueberall ein. An einer Verrundung um eine runde Kante -
 * einem Torus - folgen die Reihen dem **Winkel**, und ein einzelnes Dreieck
 * spannt dann fast den ganzen Viertelbogen. Gemessen an einer Verrundung von
 * 0,5 mm um einen Zylinder von 60 mm, bei unserer Sehnengrenze von 0,025 mm:
 *
 *   Winkel 0,16 (unsere Standardguete)   0,1236 mm ab     5.912 Dreiecke
 *   Winkel 0,10                          0,0084 mm ab     8.564 Dreiecke
 *   Winkel 0,05                          0,0021 mm ab    32.756 Dreiecke
 *
 * Das Fuenffache der zugesagten Grenze, und sichtbar: ein Saegezahn entlang
 * der Naht, im Editor und in der Scheibendatei. Darum wird nachgesehen und
 * bei Bedarf noch einmal vernetzt.
 *
 * Nach Layerling 1.45.0. Dort loest ein zweiter Umstand dasselbe Problem mit
 * aus - ein kleiner Halbmesser bekommt dort absichtlich einen **groberen**
 * Winkel, damit ein feiner Schriftzug nicht in 240.000 Dreiecke faellt. Diese
 * Lockerung haben wir nicht uebernommen: Unser Fehler steht auch ohne sie da,
 * und sie ist oben genau die Ursache, gegen die diese Datei hilft. Wir
 * ziehen den Winkel also nur an, nie nach.
 */

/**
 * Flaechenarten, deren Netz nicht nachgemessen wird.
 *
 * Oben gemessen: Verrundungen und Fasen an Kaesten, Zylindern, Kegeln,
 * Schriftzeichen, Mondsichel und Herz bleiben auf diesen Arten innerhalb der
 * Sehnengrenze. Eine Kugel und eine B-Spline-Flaeche tun es nicht immer, sind
 * aber zu langsam zum Abtasten, um sie bei jeder Vorschau zu pruefen - und
 * eine B-Spline wird von einem engeren Winkel ohnehin kaum besser.
 *
 * Der Torus steht bewusst NICHT darauf: Er ist der Fall, um den es geht.
 * Alles, was hier nicht steht, wird geprueft.
 */
export const UNCHECKED_SURFACE_TYPES: ReadonlySet<string> = new Set(["plane", "cylinder", "cone", "sphere", "bspline", "extrusion"]);

/**
 * Geprueft wird der Schwerpunkt eines Dreiecks, gegen diesen Anteil der
 * Sehnengrenze.
 *
 * Der Schwerpunkt liegt naeher an der Flaeche als die Mitte einer
 * Dreieckskante, aber nicht viel: ueber 87 Torusverrundungen (drei Gueten,
 * Zylinderhalbmesser 0,6 bis 20 mm, Verrundungen 0,05 bis 0,8 mm) lag der
 * schlechteste Schwerpunkt nie unter 0,86 des schlechtesten Punktes
 * ueberhaupt. Bei 0,75 faellt also jedes Netz auf, dessen Kanten abliegen -
 * zum Preis eines Viertels der Abtastungen.
 */
const CENTROID_SHARE = 0.75;

/**
 * Die Winkelgrenzen, die der Reihe nach versucht werden, wenn das Netz von
 * seiner Flaeche abliegt. Jeder Schritt kostet Dreiecke (siehe die Zahlen
 * oben), darum wird der naechste nur fuer ein Netz getan, das nach dem
 * vorigen noch abliegt.
 */
const TIGHTER_ANGLES = [0.1, 0.05];

/** Ein engerer Winkel wird nicht genommen, wenn der Koerper darueber kaeme. */
export const MAX_REFINED_TRIANGLES = 400_000;

type TessellateOptions = { linearDeflection: number; angularDeflection: number };

function optionsFor(deflection: CadModifierDeflection): TessellateOptions {
  return { linearDeflection: deflection.linear, angularDeflection: deflection.angular };
}

function releaseAll(cad: OcctKernel, handles: ShapeHandle[]) {
  handles.forEach((handle) => {
    try {
      cad.release(handle);
    } catch {
      // Eine gescheiterte Topologie-Rechnung macht Zwischengriffe ungueltig.
    }
  });
}

/**
 * Liegt das Netz, das `cad.tessellate` mit `options` eben auf `shape` gelegt
 * hat, von einer seiner nachzumessenden Flaechen ab? Geprueft wird jeder
 * Dreiecksschwerpunkt gegen seine eigene Flaeche.
 */
export function cadMeshStraysFromFaces(cad: OcctKernel, shape: ShapeHandle, options: TessellateOptions): boolean {
  const limit = options.linearDeflection * CENTROID_SHARE;
  const faces = cad.getSubShapes(shape, "face");
  try {
    for (const face of faces) {
      if (UNCHECKED_SURFACE_TYPES.has(cad.surfaceType(face))) continue;
      // Die Flaeche traegt das Netz, das die ganze Form eben bekommen hat.
      const { positions, indices, triangleCount } = cad.tessellate(face, options);
      for (let triangle = 0; triangle < triangleCount; triangle += 1) {
        const a = indices[triangle * 3] * 3;
        const b = indices[triangle * 3 + 1] * 3;
        const c = indices[triangle * 3 + 2] * 3;
        const x = (positions[a] + positions[b] + positions[c]) / 3;
        const y = (positions[a + 1] + positions[b + 1] + positions[c + 1]) / 3;
        const z = (positions[a + 2] + positions[b + 2] + positions[c + 2]) / 3;
        const projected = cad.projectPointOnFace(face, { x, y, z });
        if (Math.hypot(projected.x - x, projected.y - y, projected.z - z) > limit) return true;
      }
    }
    return false;
  } finally {
    releaseAll(cad, faces);
  }
}

export type MeshedCadBody = { components: ShapeHandle[]; result: ShapeHandle; deflection: CadModifierDeflection; mesh: Mesh };

/**
 * Frische Abschriften der Teile, mit `deflection` vernetzt.
 *
 * Die Abschrift ist nicht Umstaendlichkeit, sondern notwendig: OpenCascade
 * **behaelt** ein Netz, das eine Form schon hat. Dieselbe Form noch einmal
 * mit einem engeren Winkel zu vernetzen gibt Dreieck fuer Dreieck dasselbe
 * Netz zurueck. Eine Abschrift hat keins.
 */
function meshCopies(cad: OcctKernel, components: ShapeHandle[], deflection: CadModifierDeflection): MeshedCadBody {
  const fresh: ShapeHandle[] = [];
  let freshResult: ShapeHandle | null = null;
  try {
    components.forEach((component) => fresh.push(cad.copy(component)));
    freshResult = fresh.length === 1 ? fresh[0] : cad.makeCompound(fresh);
    const mesh = cad.tessellate(freshResult, optionsFor(deflection));
    return { components: fresh, result: freshResult, deflection, mesh };
  } catch (error) {
    if (freshResult !== null && fresh.length > 1) releaseAll(cad, [freshResult]);
    releaseAll(cad, fresh);
    throw error;
  }
}

function releaseMeshed(cad: OcctKernel, body: MeshedCadBody) {
  if (body.components.length > 1) releaseAll(cad, [body.result]);
  releaseAll(cad, body.components);
}

/**
 * Vernetzt einen bearbeiteten Koerper mit `deflection` - und zieht den Winkel
 * an, solange das Netz von einer nachgemessenen Flaeche abliegt und der
 * Koerper unter MAX_REFINED_TRIANGLES bleibt.
 *
 * Die uebergebenen Teile werden freigegeben, wenn sie ersetzt werden; was
 * zurueckkommt, gehoert dem Aufrufer.
 */
export function meshTreatedBody(
  cad: OcctKernel,
  components: ShapeHandle[],
  result: ShapeHandle,
  deflection: CadModifierDeflection,
): MeshedCadBody {
  const mesh = cad.tessellate(result, optionsFor(deflection));
  const kept: MeshedCadBody = { components, result, deflection, mesh };
  const angles = TIGHTER_ANGLES.filter((angular) => angular < deflection.angular);
  if (angles.length === 0) return kept;
  const straysWith = (body: { result: ShapeHandle }, options: CadModifierDeflection) => {
    try {
      return cadMeshStraysFromFaces(cad, body.result, optionsFor(options));
    } catch {
      // Eine Flaeche, die sich nicht nachmessen laesst, zaehlt als abliegend.
      return true;
    }
  };
  if (!straysWith(kept, deflection)) return kept;
  let current: MeshedCadBody | null = null;
  for (const angular of angles) {
    let next: MeshedCadBody;
    try {
      next = meshCopies(cad, components, { linear: deflection.linear, angular });
    } catch {
      // Die Bearbeitung selbst ist gelungen; dann lieber ihr Netz als ein
      // Fehlschlag.
      break;
    }
    if (current && next.mesh.triangleCount > MAX_REFINED_TRIANGLES) {
      releaseMeshed(cad, next);
      break;
    }
    if (current) releaseMeshed(cad, current);
    current = next;
    if (!straysWith(next, next.deflection)) break;
  }
  if (!current) return kept;
  if (components.length > 1) releaseAll(cad, [result]);
  releaseAll(cad, components);
  return current;
}
