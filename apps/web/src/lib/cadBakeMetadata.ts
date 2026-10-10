import * as THREE from "three";
import type { WorkplaneShape } from "@/types/sketchforge";
import type { CadModifierPrimitivePart } from "@/lib/cadModifierTypes";
import { cadTransformRequiresGeneralTransform } from "@/lib/cadModifierRuntime";
import { mirrorSign, preservesFeatureSize, resizedImportedCoordinates, shapeDepth, shapeHasShapeDeform, shapeWidth } from "@/lib/workplaneShapes";
import { knurlCorners, knurlSettings } from "@/lib/knurlGeometry";
import { gearOutlineCorners, normalizeGearCenterHoleSize, normalizeGearProfile, normalizeGearType } from "@/lib/gearGeometry";

export type BakedCadMetadataFrame = {
  centerX: number;
  minY: number;
  centerZ: number;
  width: number;
  depth: number;
  height: number;
  yawDegrees: number;
};

export function cadTransformToMatrix(transform: number[] | undefined) {
  if (!transform || transform.length !== 12 || !transform.every(Number.isFinite)) {
    return new THREE.Matrix4();
  }

  return new THREE.Matrix4().set(
    transform[0], transform[1], transform[2], transform[3],
    transform[4], transform[5], transform[6], transform[7],
    transform[8], transform[9], transform[10], transform[11],
    0, 0, 0, 1,
  );
}

export function cadTransformFromMatrix(matrix: THREE.Matrix4) {
  const elements = matrix.elements;
  return [
    elements[0], elements[4], elements[8], elements[12],
    elements[1], elements[5], elements[9], elements[13],
    elements[2], elements[6], elements[10], elements[14],
  ];
}

function isIdentityCadTransform(transform: number[]) {
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
  return transform.every((value, index) => Math.abs(value - identity[index]) < 1e-9);
}

function allFinitePositive(values: number[]) {
  return values.every((value) => Number.isFinite(value) && value > 0);
}

/**
 * Places a primitive built in the local frame (centred on x/z, base at y = 0)
 * into the world, reproducing the shape's own rotation and mirroring.
 */
function primitivePlacementTransform(shape: WorkplaneShape, height: number) {
  const centerY = height / 2;
  const matrix = new THREE.Matrix4()
    .makeTranslation(shape.x, (shape.elevation ?? 0) + centerY, shape.z)
    .multiply(new THREE.Matrix4().makeRotationFromEuler(
      new THREE.Euler(
        THREE.MathUtils.degToRad(shape.rotationX ?? 0),
        THREE.MathUtils.degToRad(shape.rotation ?? 0),
        THREE.MathUtils.degToRad(shape.rotationZ ?? 0),
        "XYZ",
      ),
    ))
    .multiply(new THREE.Matrix4().makeScale(mirrorSign(shape.mirrorX), mirrorSign(shape.mirrorY), mirrorSign(shape.mirrorZ)))
    .multiply(new THREE.Matrix4().makeTranslation(0, -centerY, 0));

  const transform = cadTransformFromMatrix(matrix);
  return isIdentityCadTransform(transform) ? undefined : transform;
}

export function cadModifierPrimitiveForAnalyticBox(shape: WorkplaneShape): CadModifierPrimitivePart | null {
  if (shape.kind !== "box" || shape.importedMesh || shape.groupedShapes?.length) {
    return null;
  }

  const width = shapeWidth(shape);
  const depth = shapeDepth(shape);
  const height = shape.height;
  if (!allFinitePositive([width, depth, height])) {
    return null;
  }

  return {
    kind: "box",
    width,
    depth,
    height,
    transform: primitivePlacementTransform(shape, height),
  };
}

// A shape whose footprint is not a circle has no analytic counterpart, and a
// low-sided "cylinder" is a prism the user can see - rebuilding either as a
// round solid would treat edges that are not on screen. Only the default
// tessellation (or finer) counts as intended-round.
const ROUND_SIDES_THRESHOLD = 96;

function isRoundFootprint(shape: WorkplaneShape) {
  const width = shapeWidth(shape);
  const depth = shapeDepth(shape);
  if (Math.abs(width - depth) > 0.0005) return false;
  return Math.round(shape.sides ?? ROUND_SIDES_THRESHOLD) >= ROUND_SIDES_THRESHOLD;
}

/**
 * Cylinder, cone, sphere and torus as analytic solids. Without this they reach the
 * CAD worker as tessellated meshes, i.e. as prisms whose rings of near-tangent
 * edges break OCCT's fillet builder - see CadModifierPrimitivePart.
 */
export function cadModifierPrimitiveForRoundShape(shape: WorkplaneShape): CadModifierPrimitivePart | null {
  if (shape.importedMesh || shape.groupedShapes?.length) return null;

  const width = shapeWidth(shape);
  const depth = shapeDepth(shape);
  const height = shape.height;
  if (!allFinitePositive([width, depth, height])) return null;

  if (shape.kind === "cylinder") {
    if (!isRoundFootprint(shape)) return null;
    return { kind: "cylinder", radius: width / 2, height, transform: primitivePlacementTransform(shape, height) };
  }

  if (shape.kind === "cone") {
    if (!isRoundFootprint(shape)) return null;
    const baseRadius = shape.baseRadius ?? width / 2;
    const topRadius = shape.topRadius ?? 0;
    if (!Number.isFinite(baseRadius) || baseRadius <= 0) return null;
    if (!Number.isFinite(topRadius) || topRadius < 0) return null;
    // A cone that tapers to nothing at both ends has no volume to build.
    if (baseRadius <= 0 && topRadius <= 0) return null;
    return { kind: "cone", baseRadius, topRadius, height, transform: primitivePlacementTransform(shape, height) };
  }

  if (shape.kind === "sphere") {
    // Only a true sphere; anything else is an ellipsoid, which OCCT has no
    // primitive for.
    if (Math.abs(width - depth) > 0.0005 || Math.abs(width - height) > 0.0005) return null;
    return { kind: "sphere", radius: height / 2, transform: primitivePlacementTransform(shape, height) };
  }

  if (shape.kind === "torus") {
    // Nur ein Kreisring: Ist die Grundflaeche kein Kreis, entsteht ein
    // elliptischer Ring, fuer den es keinen Grundkoerper gibt. Die beiden
    // Halbmesser werden genauso gelesen wie beim Bauen des Netzes - die Hoehe
    // ist die Dicke des Schlauchs, die Breite der Aussendurchmesser.
    if (!isRoundFootprint(shape)) return null;
    const minorRadius = height / 2;
    const majorRadius = Math.min(width, depth) / 2 - minorRadius;
    if (!Number.isFinite(minorRadius) || minorRadius <= 0) return null;
    if (!Number.isFinite(majorRadius) || majorRadius <= 0) return null;
    return { kind: "torus", majorRadius, minorRadius, transform: primitivePlacementTransform(shape, height) };
  }

  return null;
}

/**
 * Ein Stirnrad mit Evolventenzaehnen als hochgezogener Umriss - derselbe
 * Umriss, aus dem auch sein Netz gebaut wird.
 *
 * Nur das Stirnrad: Ein Schraegrad verdreht sich ueber die Hoehe und ein
 * Kegelrad verjuengt sich, und beides ist keine Hochziehung. Gerade Zaehne
 * bleiben ebenfalls aussen vor - sie sind nicht nach Modul gebaut, und ihr
 * alter Weg ueber das Netz funktioniert weiter.
 */
function involuteGearProfilePart(shape: WorkplaneShape): CadModifierPrimitivePart | null {
  if (normalizeGearProfile(shape.gearProfile) !== "involute") return null;
  if (normalizeGearType(shape.gearType) !== "spur") return null;
  const width = shapeWidth(shape);
  const depth = shapeDepth(shape);
  if (!allFinitePositive([width, depth, shape.height])) return null;
  // Rund muss es sein: Ein ungleich gezogenes Rad ist kein Zahnrad mehr, und
  // sein Umriss waere eine Ellipse mit Zaehnen.
  if (Math.abs(width - depth) > 0.0005) return null;
  const loop: number[] = [];
  gearOutlineCorners(width, depth, shape).forEach(({ angle, radiusX, radiusZ }) => {
    loop.push(Math.cos(angle) * radiusX, Math.sin(angle) * radiusZ);
  });
  const bore = normalizeGearCenterHoleSize(shape.centerHoleSize, width, depth, shape.toothSize);
  return {
    kind: "profileExtrusion",
    loop,
    bore: bore > 0 ? bore : undefined,
    height: shape.height,
    transform: primitivePlacementTransform(shape, shape.height),
  };
}

/**
 * Formen, deren Grundflaeche ein Vieleck ist, als hochgezogener Umriss.
 *
 * Bis jetzt genau eine: die Raendelung mit geraden Rillen. Ihr Umriss ist der
 * Ring aus Graten und Rillengruenden, aus dem auch ihr Netz gebaut wird -
 * dieselben Ecken, also derselbe Koerper, nur exakt. Darauf wirken Verrunden,
 * Fasen und Aushoehlen.
 *
 * Die gekreuzte Raendelung bleibt ein Netz: Ihre Rillen laufen auf Schrauben-
 * linien, und was zwei gegeneinander verdrehte Scharen gemeinsam haben, ist
 * kein hochgezogener Umriss. (Layerling hat es versucht - der Kern braucht
 * dort 43 s fuer 30 Rillen.)
 */
export function cadModifierPrimitiveForProfileShape(shape: WorkplaneShape): CadModifierPrimitivePart | null {
  if (shape.importedMesh || shape.groupedShapes?.length) return null;
  if (shape.kind === "gear") return involuteGearProfilePart(shape);
  if (shape.kind !== "knurl") return null;
  const width = shapeWidth(shape);
  const settings = knurlSettings({ ...shape, width });
  if (settings.pattern !== "straight") return null;
  if (!allFinitePositive([settings.diameter, settings.height])) return null;
  const loop: number[] = [];
  knurlCorners(settings.diameter, settings.count, settings.depth).forEach(({ angle, radius }) => {
    loop.push(Math.cos(angle) * radius, Math.sin(angle) * radius);
  });
  return {
    kind: "profileExtrusion",
    loop,
    height: settings.height,
    capChamfer: settings.chamfer > 0 ? { radius: settings.diameter / 2, size: settings.chamfer } : undefined,
    transform: primitivePlacementTransform(shape, settings.height),
  };
}

export function cadModifierPrimitiveForBakedShape(shape: WorkplaneShape): CadModifierPrimitivePart | null {
  const primitive = shape.cadPrimitiveFrame;
  const frame = primitive?.frame;
  if (!primitive || primitive.kind !== "box" || !frame) {
    return null;
  }

  if (!allFinitePositive([
    primitive.width,
    primitive.depth,
    primitive.height,
    frame.width,
    frame.depth,
    frame.height,
    shapeWidth(shape),
    shapeDepth(shape),
    shape.height,
  ])) {
    return null;
  }

  const centerY = shape.height / 2;
  const scaleX = shapeWidth(shape) / frame.width;
  const scaleY = shape.height / frame.height;
  const scaleZ = shapeDepth(shape) / frame.depth;
  const mirrorX = mirrorSign(shape.mirrorX);
  const mirrorY = mirrorSign(shape.mirrorY);
  const mirrorZ = mirrorSign(shape.mirrorZ);
  const matrix = new THREE.Matrix4()
    .makeTranslation(shape.x, (shape.elevation ?? 0) + centerY, shape.z)
    .multiply(new THREE.Matrix4().makeRotationFromEuler(
      new THREE.Euler(
        THREE.MathUtils.degToRad(shape.rotationX ?? 0),
        THREE.MathUtils.degToRad(shape.rotation ?? 0),
        THREE.MathUtils.degToRad(shape.rotationZ ?? 0),
        "XYZ",
      ),
    ))
    .multiply(new THREE.Matrix4().makeTranslation(0, -mirrorY * centerY, 0))
    .multiply(new THREE.Matrix4().makeScale(mirrorX * scaleX, mirrorY * scaleY, mirrorZ * scaleZ))
    .multiply(new THREE.Matrix4().makeTranslation(-frame.x, -frame.elevation, -frame.z))
    .multiply(cadTransformToMatrix(frame.sourceTransform));

  const transform = cadTransformFromMatrix(matrix);
  return {
    kind: primitive.kind,
    width: primitive.width,
    depth: primitive.depth,
    height: primitive.height,
    transform: isIdentityCadTransform(transform) ? undefined : transform,
  };
}

export function bakedBoxSelectionFrame(shape: WorkplaneShape) {
  const primitive = cadModifierPrimitiveForBakedShape(shape);
  if (!primitive || primitive.kind !== "box") {
    return null;
  }
  const matrix = cadTransformToMatrix(primitive.transform);
  const xVector = new THREE.Vector3(primitive.width, 0, 0).applyMatrix3(new THREE.Matrix3().setFromMatrix4(matrix));
  const yVector = new THREE.Vector3(0, primitive.height, 0).applyMatrix3(new THREE.Matrix3().setFromMatrix4(matrix));
  const zVector = new THREE.Vector3(0, 0, primitive.depth).applyMatrix3(new THREE.Matrix3().setFromMatrix4(matrix));
  const width = xVector.length();
  const height = yVector.length();
  const depth = zVector.length();
  if (![width, height, depth].every((value) => Number.isFinite(value) && value > 0.001)) {
    return null;
  }

  const xAxis = xVector.normalize();
  const yAxis = yVector.normalize();
  const zAxis = zVector.normalize();
  const center = new THREE.Vector3(0, primitive.height / 2, 0).applyMatrix4(matrix);
  const basis = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis);
  return {
    center,
    quaternion: new THREE.Quaternion().setFromRotationMatrix(basis),
    xAxis,
    yAxis,
    zAxis,
    width,
    height,
    depth,
  };
}

export function cadBrepTransformForShape(shape: WorkplaneShape) {
  const frame = shape.cadBrepFrame;
  if (!frame) return undefined;
  const oldCenter = new THREE.Vector3(frame.x, frame.elevation + frame.height / 2, frame.z);
  const currentCenter = new THREE.Vector3(shape.x, (shape.elevation ?? 0) + shape.height / 2, shape.z);
  const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(
    THREE.MathUtils.degToRad(shape.rotationX ?? 0),
    THREE.MathUtils.degToRad(shape.rotation ?? 0),
    THREE.MathUtils.degToRad(shape.rotationZ ?? 0),
    "XYZ",
  ));
  const scale = new THREE.Vector3(
    shapeWidth(shape) / Math.max(0.001, frame.width) * mirrorSign(shape.mirrorX),
    shape.height / Math.max(0.001, frame.height) * mirrorSign(shape.mirrorY),
    shapeDepth(shape) / Math.max(0.001, frame.depth) * mirrorSign(shape.mirrorZ),
  );
  const matrix = new THREE.Matrix4()
    .compose(currentCenter, rotation, scale)
    .multiply(new THREE.Matrix4().makeTranslation(-oldCenter.x, -oldCenter.y, -oldCenter.z))
    .multiply(cadTransformToMatrix(frame.sourceTransform));
  const result = cadTransformFromMatrix(matrix);
  return isIdentityCadTransform(result) ? undefined : result;
}

/**
 * Der genaue Koerper eines STEP-Imports, dort platziert, wo der Koerper steht.
 *
 * Beim Einlesen kommt beides herein: das Netz, das man sieht, und die genaue
 * Beschreibung, aus der es vernetzt wurde (`importedMesh.brepStep`). Benutzt
 * wurde die bisher nur beim Ausfuehren - das Kantenwerkzeug arbeitete auf den
 * Dreiecken. Beim Zylinder heisst das gemessen: 42 Facettenkanten statt eines
 * Kreises, und schon vor der ersten Verrundung 0,4 Prozent weniger Volumen.
 *
 * Null heisst: Fuer diesen Koerper traegt die Datei nicht, nimm das Netz.
 */
export function importedStepSourceForShape(shape: WorkplaneShape) {
  const mesh = shape.kind === "mesh" ? shape.importedMesh : undefined;
  if (!mesh?.brepStep) return null;
  /*
   * Eine fruehere Kantenbearbeitung legt ihr Ergebnis in `cadBrep` ab, und das
   * ist der neuere Koerper: Die Datei kennt die Verrundung nicht, die schon
   * daran sitzt.
   */
  if (shape.cadBrep || shapeHasShapeDeform(shape)) return null;
  const stretched = (
    Math.abs(shapeWidth(shape) - mesh.baseWidth) > 1e-6 ||
    Math.abs(shapeDepth(shape) - mesh.baseDepth) > 1e-6 ||
    Math.abs(shape.height - mesh.baseHeight) > 1e-6
  );
  /*
   * Mit starren Raendern gezogen ist das Netz nicht mehr die Datei mal einem
   * Faktor, sondern in der Mitte gestreckt und an den Enden stehengelassen -
   * das kann die genaue Beschreibung nicht nachmachen.
   */
  if (stretched && preservesFeatureSize(shape)) return null;
  const transform = cadBrepTransformForShape({
    ...shape,
    // Die Datei liegt in demselben Rahmen wie das Netz: auf x und z
    // mittig, Unterseite auf null, in seinen Grundmassen.
    cadBrepFrame: { x: 0, z: 0, elevation: 0, width: mesh.baseWidth, depth: mesh.baseDepth, height: mesh.baseHeight },
  });
  /*
   * Ungleichmaessig verzerrt traegt die Datei nichts mehr ein: Der Kern
   * muesste den Koerper dann mit `generalTransform` umbauen, und das macht aus
   * jeder Flaeche einen B-Spline - bei einem auf das Doppelte gezogenen
   * Zylinder gemessen 0,9 Prozent am Volumen daneben. Dann ist das Netz die
   * ehrlichere Quelle, denn es hat die richtige Groesse.
   */
  if (transform && cadTransformRequiresGeneralTransform(transform)) return null;
  return { stepText: mesh.brepStep, transform };
}

function bakeCadDisplayEdgesForShape(shape: WorkplaneShape, frame: BakedCadMetadataFrame) {
  if (!shape.cadDisplayEdges?.length) {
    return undefined;
  }

  const centerY = shape.height / 2;
  const matrix = new THREE.Matrix4().makeRotationFromEuler(
    new THREE.Euler(
      THREE.MathUtils.degToRad(shape.rotationX ?? 0),
      THREE.MathUtils.degToRad(frame.yawDegrees),
      THREE.MathUtils.degToRad(shape.rotationZ ?? 0),
      "XYZ",
    ),
  );
  const xMirror = mirrorSign(shape.mirrorX);
  const yMirror = mirrorSign(shape.mirrorY);
  const zMirror = mirrorSign(shape.mirrorZ);
  const bakedEdges = shape.cadDisplayEdges.flatMap((edge) => {
    if (edge.points.length < 6) {
      return [];
    }

    const resizedPoints = resizedImportedCoordinates(shape, edge.points);
    const points: number[] = [];
    for (let index = 0; index + 2 < resizedPoints.length; index += 3) {
      const vertex = new THREE.Vector3(
        resizedPoints[index] * xMirror,
        (resizedPoints[index + 1] - centerY) * yMirror,
        resizedPoints[index + 2] * zMirror,
      ).applyMatrix4(matrix);
      const x = vertex.x + shape.x - frame.centerX;
      const y = vertex.y + (shape.elevation ?? 0) + centerY - frame.minY;
      const z = vertex.z + shape.z - frame.centerZ;
      if ([x, y, z].every(Number.isFinite)) {
        points.push(x, y, z);
      }
    }

    return points.length >= 6 ? [{ points }] : [];
  });

  return bakedEdges.length > 0 ? bakedEdges : undefined;
}

function bakeCadPrimitiveFrameForShapeTransform(shape: WorkplaneShape, frame: BakedCadMetadataFrame) {
  const primitive = cadModifierPrimitiveForBakedShape(shape) ?? cadModifierPrimitiveForAnalyticBox(shape);
  // Box only: this frame is persisted in .skf, and the round kinds are rebuilt
  // from the live shape rather than from a bake.
  if (primitive?.kind !== "box") {
    return undefined;
  }

  return {
    kind: primitive.kind,
    width: primitive.width,
    depth: primitive.depth,
    height: primitive.height,
    frame: {
      x: frame.centerX,
      z: frame.centerZ,
      elevation: frame.minY,
      width: frame.width,
      depth: frame.depth,
      height: frame.height,
      ...(primitive.transform ? { sourceTransform: primitive.transform } : {}),
    },
  };
}

export function bakeCadMetadataForShapeTransform(shape: WorkplaneShape, frame: BakedCadMetadataFrame) {
  const cadDisplayEdges = bakeCadDisplayEdgesForShape(shape, frame);
  const sourceTransform = cadBrepTransformForShape(shape);
  const cadPrimitiveFrame = bakeCadPrimitiveFrameForShapeTransform(shape, frame);
  const cadBrepFrame = shape.cadBrep && shape.cadBrepFrame
    ? {
        x: frame.centerX,
        z: frame.centerZ,
        elevation: frame.minY,
        width: frame.width,
        depth: frame.depth,
        height: frame.height,
        ...(sourceTransform ? { sourceTransform } : {}),
      }
    : undefined;
  return {
    cadDisplayEdges,
    cadDisplayEdgesVersion: cadDisplayEdges ? (2 as const) : undefined,
    cadBrep: cadBrepFrame ? shape.cadBrep : undefined,
    cadBrepFrame,
    cadPrimitiveFrame,
  };
}
