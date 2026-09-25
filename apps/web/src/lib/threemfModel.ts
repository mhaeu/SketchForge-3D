import { zUpToSketchForge } from "@/lib/meshCoordinates";

/**
 * Die Rechnung hinter dem 3MF-Import, getrennt vom Zerlegen der XML-Datei -
 * genau wie beim SVG-Import. Das Zerlegen braucht den Browser (DOMParser),
 * diese Datei nicht: Sie arbeitet auf dem fertig ausgelesenen Modell und
 * laesst sich damit vollstaendig pruefen.
 *
 * 3MF: https://github.com/3MFConsortium/spec_core
 * Eine 3MF-Datei ist ein ZIP-Archiv mit "3D/3dmodel.model" darin, einer
 * XML-Datei in Millimetern und mit Z nach oben - derselben Ausrichtung, die
 * auch STL und die Slicer verwenden.
 */

/**
 * Die Lage eines Bauteils, wie 3MF sie schreibt: zwoelf Zahlen, zeilenweise -
 * drei Zeilen Drehung und Streckung, danach eine Zeile Verschiebung. Die
 * vierte Spalte der Norm ist fest 0 0 0 1 und steht nicht in der Datei.
 */
export type ThreemfTransform = readonly number[];

export const THREEMF_IDENTITY: ThreemfTransform = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];

export type ThreemfMesh = {
  /** Die Eckpunkte am Stueck: x, y, z, x, y, z, ... noch in Z-nach-oben. */
  vertices: readonly number[];
  /** Je drei Zahlen ein Dreieck, als Nummern in `vertices`. */
  triangles: readonly number[];
};

export type ThreemfComponent = {
  objectId: string;
  transform: ThreemfTransform;
};

export type ThreemfObject = {
  id: string;
  /** "model", "support", "solidsupport", "surface" oder "other". */
  type?: string;
  mesh?: ThreemfMesh;
  components?: readonly ThreemfComponent[];
};

export type ThreemfBuildItem = {
  objectId: string;
  transform: ThreemfTransform;
};

export type ThreemfModel = {
  objects: readonly ThreemfObject[];
  build: readonly ThreemfBuildItem[];
};

/**
 * Tiefe, bis zu der ineinandergesteckte Bauteile verfolgt werden. Die Norm
 * setzt keine Grenze; sie haelt nur einen Ring an, der sich selbst enthaelt.
 * Genau das faengt der Zaehler ab, zusammen mit der Merkliste der Bauteile,
 * die auf diesem Weg schon geoeffnet wurden.
 */
export const THREEMF_MAX_COMPONENT_DEPTH = 32;

/** Liest das Feld "transform" - zwoelf Zahlen, sonst die unveraenderte Lage. */
export function parseThreemfTransform(value: string | null | undefined): ThreemfTransform {
  if (!value) return THREEMF_IDENTITY;
  const numbers = value.trim().split(/\s+/).map(Number);
  if (numbers.length !== 12 || numbers.some((entry) => !Number.isFinite(entry))) {
    return THREEMF_IDENTITY;
  }
  return numbers;
}

function isIdentity(transform: ThreemfTransform) {
  return transform === THREEMF_IDENTITY || THREEMF_IDENTITY.every((entry, i) => transform[i] === entry);
}

/** Legt einen Punkt in die Lage `transform`. */
export function applyThreemfTransform(
  transform: ThreemfTransform,
  x: number,
  y: number,
  z: number,
): [number, number, number] {
  return [
    transform[0] * x + transform[3] * y + transform[6] * z + transform[9],
    transform[1] * x + transform[4] * y + transform[7] * z + transform[10],
    transform[2] * x + transform[5] * y + transform[8] * z + transform[11],
  ];
}

/**
 * Zwei Lagen hintereinander: erst die innere, dann die aeussere. Ein Bauteil
 * traegt seine eigene Lage, und der Bauplatz stellt das Ganze noch einmal um -
 * beides muss sich zu einer einzigen Rechnung zusammenlegen lassen, sonst
 * stuende eine Baugruppe am falschen Fleck.
 */
export function combineThreemfTransforms(outer: ThreemfTransform, inner: ThreemfTransform): ThreemfTransform {
  if (isIdentity(outer)) return inner;
  if (isIdentity(inner)) return outer;
  // Die ersten drei Zeilen sind Richtungen, die vierte ist ein Punkt. Eine
  // Richtung darf die Verschiebung der aeusseren Lage nicht mitnehmen, sonst
  // stuende sie am Ende dreimal zu viel im Ergebnis.
  const direction = (row: number) => {
    const [x, y, z] = [inner[row * 3], inner[row * 3 + 1], inner[row * 3 + 2]];
    return [
      outer[0] * x + outer[3] * y + outer[6] * z,
      outer[1] * x + outer[4] * y + outer[7] * z,
      outer[2] * x + outer[5] * y + outer[8] * z,
    ];
  };
  return [
    ...direction(0),
    ...direction(1),
    ...direction(2),
    ...applyThreemfTransform(outer, inner[9], inner[10], inner[11]),
  ];
}

/**
 * Die Dreiecke eines einzelnen Netzes, in seiner Lage und schon gedreht auf
 * unsere Ausrichtung mit Y nach oben.
 */
function meshPositions(mesh: ThreemfMesh, transform: ThreemfTransform, into: number[]) {
  const { vertices, triangles } = mesh;
  const vertexCount = Math.floor(vertices.length / 3);
  const placed = isIdentity(transform);
  for (let i = 0; i < triangles.length; i += 3) {
    for (let corner = 0; corner < 3; corner += 1) {
      const index = triangles[i + corner];
      if (!Number.isInteger(index) || index < 0 || index >= vertexCount) {
        throw new Error("3MF triangle references a vertex that does not exist");
      }
      const at = index * 3;
      const [x, y, z] = placed
        ? [vertices[at], vertices[at + 1], vertices[at + 2]]
        : applyThreemfTransform(transform, vertices[at], vertices[at + 1], vertices[at + 2]);
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
        throw new Error("3MF contains a vertex that is not a number");
      }
      const [sx, sy, sz] = zUpToSketchForge([x, y, z]);
      into.push(sx, sy, sz);
    }
  }
}

/**
 * Alle Dreiecke der Datei, aufgeloest ueber den Bauplatz. Ein Eintrag zeigt
 * auf ein Objekt; das ist entweder selbst ein Netz oder eine Baugruppe aus
 * weiteren Objekten, die wiederum Baugruppen sein duerfen.
 *
 * Steht kein Bauplatz in der Datei, werden alle Netze genommen - manche
 * Werkzeuge schreiben nur die Objekte.
 */
export function threemfTrianglePositions(model: ThreemfModel): number[] {
  const byId = new Map(model.objects.map((object) => [object.id, object]));
  const positions: number[] = [];

  const collect = (objectId: string, transform: ThreemfTransform, open: readonly string[]) => {
    if (open.includes(objectId)) {
      throw new Error("3MF assembly contains itself");
    }
    if (open.length >= THREEMF_MAX_COMPONENT_DEPTH) {
      throw new Error("3MF assembly is nested too deeply");
    }
    const object = byId.get(objectId);
    if (!object) return;
    // Stuetzen und Hilfsflaechen sind kein Material.
    if (object.type && object.type !== "model") return;
    if (object.mesh) {
      meshPositions(object.mesh, transform, positions);
      return;
    }
    const nested = [...open, objectId];
    object.components?.forEach((component) => {
      collect(component.objectId, combineThreemfTransforms(transform, component.transform), nested);
    });
  };

  if (model.build.length) {
    model.build.forEach((item) => collect(item.objectId, item.transform, []));
  } else {
    model.objects.forEach((object) => {
      if (object.mesh && (!object.type || object.type === "model")) {
        meshPositions(object.mesh, THREEMF_IDENTITY, positions);
      }
    });
  }

  return positions;
}
