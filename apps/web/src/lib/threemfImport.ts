import { unzipSync } from "fflate";
import { importedShapeFromTriangleSoup } from "@/lib/stlImport";
import {
  parseThreemfTransform,
  threemfTrianglePositions,
  type ThreemfComponent,
  type ThreemfMesh,
  type ThreemfModel,
  type ThreemfObject,
} from "@/lib/threemfModel";
import type { WorkplaneShape } from "@/types/sketchforge";

/**
 * 3MF einlesen: das Hausformat von PrusaSlicer, OrcaSlicer, Bambu Studio und
 * Cura. Damit kommt ein Modell direkt aus dem Slicer zurueck, ohne den Umweg
 * ueber STL.
 *
 * Hier steht nur das Aufmachen der Datei: ZIP auspacken, XML zerlegen, die
 * Felder auslesen. Das braucht den Browser (DOMParser). Die Rechnung darueber
 * - Lagen verketten, Baugruppen aufloesen, auf unsere Ausrichtung drehen -
 * liegt in `threemfModel.ts` und ist von dort aus geprueft.
 */

/** Der Pfad, den die Norm vorschreibt. Manche Werkzeuge schreiben ihn anders. */
const MODEL_PATH = "3d/3dmodel.model";

function attribute(element: Element, name: string) {
  return element.getAttribute(name) ?? undefined;
}

function readMesh(objectElement: Element): ThreemfMesh | undefined {
  const meshElement = objectElement.querySelector("mesh");
  if (!meshElement) return undefined;

  const vertices: number[] = [];
  meshElement.querySelectorAll("vertices > vertex").forEach((vertex) => {
    vertices.push(Number(vertex.getAttribute("x")), Number(vertex.getAttribute("y")), Number(vertex.getAttribute("z")));
  });

  const triangles: number[] = [];
  meshElement.querySelectorAll("triangles > triangle").forEach((triangle) => {
    triangles.push(
      Number(triangle.getAttribute("v1")),
      Number(triangle.getAttribute("v2")),
      Number(triangle.getAttribute("v3")),
    );
  });

  return { vertices, triangles };
}

function readComponents(objectElement: Element): ThreemfComponent[] {
  const components: ThreemfComponent[] = [];
  objectElement.querySelectorAll("components > component").forEach((component) => {
    const objectId = component.getAttribute("objectid");
    if (!objectId) return;
    components.push({ objectId, transform: parseThreemfTransform(component.getAttribute("transform")) });
  });
  return components;
}

/** Liest das Modell aus der zerlegten XML-Datei in die Form, auf der gerechnet wird. */
export function threemfModelFromDocument(document: Document): ThreemfModel {
  const objects: ThreemfObject[] = [];
  document.querySelectorAll("resources > object").forEach((element) => {
    const id = element.getAttribute("id");
    if (!id) return;
    objects.push({
      id,
      type: attribute(element, "type"),
      mesh: readMesh(element),
      components: readComponents(element),
    });
  });

  const build = Array.from(document.querySelectorAll("build > item"))
    .map((item) => ({
      objectId: item.getAttribute("objectid") ?? "",
      transform: parseThreemfTransform(item.getAttribute("transform")),
    }))
    .filter((item) => item.objectId);

  return { objects, build };
}

/** Sucht die Modelldatei im Archiv - auch, wenn sie anders geschrieben steht. */
export function threemfModelEntry(names: readonly string[]) {
  return (
    names.find((name) => name.toLowerCase() === MODEL_PATH)
    ?? names.find((name) => name.toLowerCase().endsWith(".model"))
    ?? null
  );
}

export function importedShapeFrom3mf(fileName: string, buffer: ArrayBuffer): WorkplaneShape {
  let archive: ReturnType<typeof unzipSync>;
  try {
    archive = unzipSync(new Uint8Array(buffer));
  } catch {
    throw new Error("3MF file could not be unpacked - is it damaged?");
  }

  const entry = threemfModelEntry(Object.keys(archive));
  if (!entry) {
    throw new Error("3MF file contains no 3D/3dmodel.model");
  }

  const xml = new TextDecoder("utf-8").decode(archive[entry]);
  const document = new DOMParser().parseFromString(xml, "application/xml");
  const failure = document.querySelector("parsererror");
  if (failure) {
    throw new Error(`3MF file is not readable XML: ${failure.textContent?.slice(0, 120) ?? ""}`);
  }

  const positions = threemfTrianglePositions(threemfModelFromDocument(document));
  if (!positions.length) {
    throw new Error("3MF file contains no readable geometry");
  }
  // Ohne Normalen: die rechnet importedShapeFromTriangleSoup aus den Dreiecken.
  return importedShapeFromTriangleSoup(fileName, positions, undefined, "3mf");
}
