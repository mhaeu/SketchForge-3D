import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  GEOMETRY_FINE_ROTATION_STEP_DEGREES,
  GEOMETRY_ROTATION_STEP_DEGREES,
  geometryRotationDegreesForShortcut,
  geometryRotationDelta,
  composedShapeRotation,
  rotatedGeometryShapePatch,
} from "@/lib/geometryRotation";
import { horizontalPlacementWorkplane, placementWorkplaneFromSurface } from "@/lib/placementWorkplane";
import type { WorkplaneShape } from "@/types/sketchforge";

function shape(overrides: Partial<WorkplaneShape> = {}): WorkplaneShape {
  return {
    id: "box-1",
    name: "Box",
    kind: "box",
    color: "#d41721",
    x: 0,
    z: 0,
    elevation: 0,
    size: 20,
    width: 20,
    depth: 20,
    height: 20,
    rotation: 0,
    locked: false,
    hidden: false,
    ...overrides,
  };
}

function shortcut(overrides: Partial<Parameters<typeof geometryRotationDegreesForShortcut>[0]> = {}) {
  return geometryRotationDegreesForShortcut({
    altKey: false,
    code: "KeyR",
    ctrlKey: false,
    key: "r",
    metaKey: false,
    shiftKey: false,
    ...overrides,
  });
}

describe("geometry rotation shortcut", () => {
  it("maps R to 45 degrees and Shift+R to 22.5 degrees", () => {
    expect(shortcut()).toBe(GEOMETRY_ROTATION_STEP_DEGREES);
    expect(shortcut({ key: "R", shiftKey: true })).toBe(GEOMETRY_FINE_ROTATION_STEP_DEGREES);
  });

  it("does not intercept browser, command, Alt, or unrelated shortcuts", () => {
    expect(shortcut({ ctrlKey: true })).toBeNull();
    expect(shortcut({ metaKey: true })).toBeNull();
    expect(shortcut({ altKey: true })).toBeNull();
    expect(shortcut({ code: "KeyT", key: "t" })).toBeNull();
  });

  it("uses the physical R key even when the keyboard layout reports another character", () => {
    expect(shortcut({ key: "ρ" })).toBe(GEOMETRY_ROTATION_STEP_DEGREES);
  });
});

describe("geometry rotation transform", () => {
  it("rotates an object 45 degrees around the base workplane normal", () => {
    const delta = geometryRotationDelta(horizontalPlacementWorkplane(), 45);
    const patch = rotatedGeometryShapePatch(shape(), delta, null);

    expect(patch).toMatchObject({ rotationX: 0, rotation: 45, rotationZ: 0 });
    expect(patch).not.toHaveProperty("x");
    expect(patch).not.toHaveProperty("elevation");
  });

  it("preserves the fine 22.5-degree step on an oriented workplane", () => {
    const vertical = placementWorkplaneFromSurface(
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
    );
    const delta = geometryRotationDelta(vertical, 22.5);
    const patch = rotatedGeometryShapePatch(shape(), delta, null);

    expect(patch).toMatchObject({ rotationX: 22.5, rotation: 0, rotationZ: 0 });
  });

  it("rotates multi-object centers around the shared selection pivot", () => {
    const delta = geometryRotationDelta(horizontalPlacementWorkplane(), 90);
    const patch = rotatedGeometryShapePatch(shape({ x: 10, elevation: 4 }), delta, new THREE.Vector3(0, 14, 0));

    expect(patch.x).toBeCloseTo(0, 8);
    expect(patch.z).toBeCloseTo(-10, 8);
    expect(patch.elevation).toBeCloseTo(4, 8);
  });

  it("pre-multiplies the shortcut around the world workplane axis for compound rotations", () => {
    const source = shape({ rotationX: 18, rotation: 31, rotationZ: 12 });
    const delta = geometryRotationDelta(horizontalPlacementWorkplane(), 22.5);
    const patch = rotatedGeometryShapePatch(source, delta, null);
    const actual = new THREE.Quaternion().setFromEuler(new THREE.Euler(
      THREE.MathUtils.degToRad(patch.rotationX ?? 0),
      THREE.MathUtils.degToRad(patch.rotation ?? 0),
      THREE.MathUtils.degToRad(patch.rotationZ ?? 0),
      "XYZ",
    ));
    const sourceQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(
      THREE.MathUtils.degToRad(source.rotationX ?? 0),
      THREE.MathUtils.degToRad(source.rotation),
      THREE.MathUtils.degToRad(source.rotationZ ?? 0),
      "XYZ",
    ));
    const expected = delta.clone().multiply(sourceQuaternion);

    expect(actual.angleTo(expected)).toBeLessThan(0.002);
  });

  it("falls back to the world-up axis for a malformed workplane normal", () => {
    const malformed = { ...horizontalPlacementWorkplane(), normal: { x: 0, y: 0, z: 0 } };
    const patch = rotatedGeometryShapePatch(shape(), geometryRotationDelta(malformed, 45), null);

    expect(patch).toMatchObject({ rotationX: 0, rotation: 45, rotationZ: 0 });
  });

  /*
   * Eine gedrehte Form wird in ein Netz gebacken. Wer sie danach noch einmal
   * dreht, dreht das Netz - die urspruengliche Form muss beide Drehungen
   * kennen, um neu gebaut werden zu koennen. Ueber Eulerwinkel liesse sich das
   * nicht addieren.
   */
  it("verkettet zwei Drehungen, statt sie zu addieren", () => {
    const none = { rotation: 0, rotationX: 0, rotationZ: 0 };
    expect(composedShapeRotation(none, { rotation: 30, rotationX: 0, rotationZ: 0 }))
      .toEqual({ rotation: 30, rotationX: 0, rotationZ: 0 });

    // Zweimal 30 Grad um dieselbe Achse sind 60.
    expect(composedShapeRotation({ rotation: 30, rotationX: 0, rotationZ: 0 }, { rotation: 30, rotationX: 0, rotationZ: 0 }).rotation)
      .toBeCloseTo(60, 6);

    /*
     * Um verschiedene Achsen zaehlt nicht das Ergebnis der Winkel, sondern
     * was mit einem Punkt geschieht. Also wird genau das geprueft: erst
     * innen, dann aussen drehen muss dasselbe ergeben wie die verkettete
     * Drehung in einem Zug.
     */
    const outer = { rotation: 90, rotationX: 0, rotationZ: 0 };
    const inner = { rotation: 0, rotationX: 90, rotationZ: 0 };
    const asEuler = (r: { rotation: number; rotationX: number; rotationZ: number }) => new THREE.Euler(
      THREE.MathUtils.degToRad(r.rotationX),
      THREE.MathUtils.degToRad(r.rotation),
      THREE.MathUtils.degToRad(r.rotationZ),
      "XYZ",
    );
    const point = new THREE.Vector3(1, 2, 3);
    const inTurn = point.clone().applyEuler(asEuler(inner)).applyEuler(asEuler(outer));
    const composed = point.clone().applyEuler(asEuler(composedShapeRotation(outer, inner)));
    expect(composed.x).toBeCloseTo(inTurn.x, 5);
    expect(composed.y).toBeCloseTo(inTurn.y, 5);
    expect(composed.z).toBeCloseTo(inTurn.z, 5);
    // Und die Summe der Winkel waere etwas anderes gewesen.
    const summed = point.clone().applyEuler(asEuler({ rotation: 90, rotationX: 90, rotationZ: 0 }));
    expect(Math.hypot(summed.x - composed.x, summed.y - composed.y, summed.z - composed.z)).toBeGreaterThan(1);

    // Und eine Drehung mit ihrer Gegendrehung hebt sich auf.
    expect(composedShapeRotation({ rotation: -45, rotationX: 0, rotationZ: 0 }, { rotation: 45, rotationX: 0, rotationZ: 0 }))
      .toEqual({ rotation: 0, rotationX: 0, rotationZ: 0 });
  });
});
