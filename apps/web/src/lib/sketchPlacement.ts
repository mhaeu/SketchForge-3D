import * as THREE from "three";
import {
  placementPatchForNewShape,
  placementWorkplanePoint,
  type PlacementWorkplane,
} from "@/lib/placementWorkplane";
import { cadSketchRegions, sampleCadSketchPath } from "@/lib/sketchCadProfile";
import { sketchGeometryProfile } from "@/lib/sketchConstruction";
import { canonicalizeShape } from "@/lib/workplaneShapes";
import type { SketchProfile, WorkplaneShape } from "@/types/sketchforge";

type Flat = { x: number; z: number };

/**
 * Die Mitte des Umrisses in der Skizze: die Mitte des Kastens um alle
 * aeusseren Ringe, Kurven abgetastet - dieselbe Mitte, um die der genaue
 * Koerper gebaut wird (shapeFromCadMesh zentriert sein Netz auf den Kasten).
 * `null`, wenn die Skizze keinen geschlossenen Umriss hat.
 */
export function sketchOutlineCentre(profile: SketchProfile): Flat | null {
  const samples = cadSketchRegions(sketchGeometryProfile(profile)).flatMap((region) => sampleCadSketchPath(region.outer));
  if (samples.length === 0) return null;
  const xs = samples.map((point) => point.x);
  const zs = samples.map((point) => point.z);
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, z: (Math.min(...zs) + Math.max(...zs)) / 2 };
}

/**
 * Um wie viel der Koerper wandert, wenn seine Skizze bearbeitet wurde.
 *
 * Der Koerper sitzt mit seiner Mitte auf der Mitte seines Umrisses. Waechst
 * der Umriss nur nach rechts, wandert diese Mitte um die Haelfte nach rechts -
 * blieb der Koerper aber stehen, rutschte alles, was man nicht angefasst hat,
 * um diese Haelfte nach links. Beim naechsten Oeffnen lag die Skizze dann
 * scheinbar verschoben ueber dem Koerper.
 *
 * Die Verschiebung ist in der Skizze gemessen, also im eigenen Rahmen des
 * Koerpers; in die Welt kommt sie mit seiner Drehung und Spiegelung. Ein
 * Koerper auf einer schraegen Flaeche wandert dabei auch in der Hoehe.
 *
 * Nach Layerling 1.70.0 (#291).
 */
export function editedSketchShift(existing: WorkplaneShape, previous: Flat | null, next: Flat | null) {
  if (!previous || !next) return { x: 0, y: 0, z: 0 };
  const local = new THREE.Vector3(
    (next.x - previous.x) * (existing.mirrorX ? -1 : 1),
    0,
    (next.z - previous.z) * (existing.mirrorZ ? -1 : 1),
  );
  local.applyEuler(new THREE.Euler(
    THREE.MathUtils.degToRad(existing.rotationX ?? 0),
    THREE.MathUtils.degToRad(existing.rotation ?? 0),
    THREE.MathUtils.degToRad(existing.rotationZ ?? 0),
    "XYZ",
  ));
  return { x: local.x, y: local.y, z: local.z };
}

export function placeSketchExtrusion(
  shape: WorkplaneShape,
  workplane: PlacementWorkplane,
  existing?: WorkplaneShape | null,
  /** Wie weit die Mitte des Umrisses beim Bearbeiten gewandert ist, in der Skizze. */
  outlineShift?: { previous: Flat | null; next: Flat | null },
) {
  if (existing) {
    const shift = outlineShift ? editedSketchShift(existing, outlineShift.previous, outlineShift.next) : { x: 0, y: 0, z: 0 };
    return canonicalizeShape({
      ...shape,
      x: existing.x + shift.x,
      z: existing.z + shift.z,
      elevation: (existing.elevation ?? 0) + shift.y,
      rotation: existing.rotation,
      rotationX: existing.rotationX ?? 0,
      rotationZ: existing.rotationZ ?? 0,
      mirrorX: existing.mirrorX,
      mirrorY: existing.mirrorY,
      mirrorZ: existing.mirrorZ,
      locked: existing.locked,
      hidden: existing.hidden,
    });
  }

  const basePoint = placementWorkplanePoint(workplane, shape.x, shape.z);
  return canonicalizeShape({
    ...shape,
    ...placementPatchForNewShape(shape, workplane, basePoint),
  });
}
