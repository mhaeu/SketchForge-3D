import { describe, expect, it } from "vitest";
import {
  horizontalPlacementWorkplane,
  normalizePlacementWorkplane,
  placementWorkplaneFingerprint,
  placementPatchForNewShape,
  placementWorkplaneCoordinates,
  placementWorkplaneFromSurface,
  placementWorkplanePoint,
  snapPlacementWorkplaneOrigin,
  translationToWorkplane,
} from "@/lib/placementWorkplane";

describe("placement workplanes", () => {
  it("round-trips coordinates on an oriented surface", () => {
    const plane = placementWorkplaneFromSurface(
      { x: 10, y: 5, z: -4 },
      { x: 0, y: 0, z: 1 },
      { x: 1, y: 0, z: 0 },
    );
    const world = placementWorkplanePoint(plane, 12, -7);
    const local = placementWorkplaneCoordinates(plane, world);

    expect(local.x).toBeCloseTo(12);
    expect(local.y).toBeCloseTo(0);
    expect(local.z).toBeCloseTo(-7);
  });

  it("places a new shape flush with a vertical face", () => {
    const plane = placementWorkplaneFromSurface(
      { x: 20, y: 10, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
    );
    const patch = placementPatchForNewShape({ height: 8 }, plane);

    expect(patch.x).toBeCloseTo(24);
    expect(patch.elevation).toBeCloseTo(6);
    expect(Math.abs(patch.rotationZ ?? 0)).toBeCloseTo(90);
  });

  it("reverses which side receives newly placed shapes", () => {
    const normal = { x: 0, y: 1, z: 0 };
    const regular = placementWorkplaneFromSurface({ x: 0, y: 4, z: 0 }, normal, { x: 1, y: 0, z: 0 });
    const reversed = placementWorkplaneFromSurface({ x: 0, y: 4, z: 0 }, normal, { x: 1, y: 0, z: 0 }, true);

    expect(placementPatchForNewShape({ height: 10 }, regular).elevation).toBe(4);
    expect(placementPatchForNewShape({ height: 10 }, reversed).elevation).toBe(-6);
  });

  it("snaps a horizontal surface origin to the base grid", () => {
    const plane = placementWorkplaneFromSurface(
      { x: 7.3, y: 12, z: -4.6 },
      { x: 0, y: 1, z: 0 },
      { x: 1, y: 0, z: 0 },
    );
    const snapped = snapPlacementWorkplaneOrigin(plane, 2);

    expect(snapped.origin).toEqual({ x: 8, y: 12, z: -4 });
  });

  it("snaps both in-plane coordinates without moving a vertical surface", () => {
    const plane = placementWorkplaneFromSurface(
      { x: 20, y: 7.3, z: -4.6 },
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
    );
    const snapped = snapPlacementWorkplaneOrigin(plane, 2);

    expect(snapped.origin).toEqual({ x: 20, y: 8, z: -4 });
    expect(snapped.origin.x).toBe(plane.origin.x);
  });

  it("keeps an angled surface coplanar while snapping from the base origin", () => {
    const plane = placementWorkplaneFromSurface(
      { x: 7.2, y: 5.1, z: -3.8 },
      { x: 1, y: 1, z: 0 },
      { x: 0, y: 0, z: 1 },
    );
    const snapped = snapPlacementWorkplaneOrigin(plane, 2.5);
    const snappedCoordinates = placementWorkplaneCoordinates(plane, snapped.origin);
    const planeOffset = (
      plane.origin.x * plane.normal.x
      + plane.origin.y * plane.normal.y
      + plane.origin.z * plane.normal.z
    );
    const baseGridAnchor = {
      ...plane,
      origin: {
        x: plane.normal.x * planeOffset,
        y: plane.normal.y * planeOffset,
        z: plane.normal.z * planeOffset,
      },
    };
    const gridCoordinates = placementWorkplaneCoordinates(baseGridAnchor, snapped.origin);

    expect(snappedCoordinates.y).toBeCloseTo(0);
    expect(gridCoordinates.x / 2.5).toBeCloseTo(Math.round(gridCoordinates.x / 2.5));
    expect(gridCoordinates.z / 2.5).toBeCloseTo(Math.round(gridCoordinates.z / 2.5));
  });

  it("computes the exact translation required to drop geometry onto a plane", () => {
    const plane = horizontalPlacementWorkplane(3);
    const translation = translationToWorkplane(plane, [
      { x: -2, y: 8, z: -2 },
      { x: 2, y: 8, z: 2 },
      { x: 0, y: 12, z: 0 },
    ]);

    expect(translation).toEqual({ x: 0, y: -5, z: 0 });
  });
});

/**
 * Die Projektliste der Startseite wird gelesen, gemischt, geschrieben und als
 * neuer Zustand uebernommen - in einer einzigen Wirkung. Ein Wert, der sich
 * bei jedem Normalisieren aendert, kommt dort nie zur Ruhe; die Seite lief mit
 * einer gekippten Arbeitsebene im Projekt in "maximum update depth exceeded".
 */
describe("normalizePlacementWorkplane kommt zur Ruhe", () => {
  const tilted = placementWorkplaneFromSurface({ x: 3, y: 7, z: -2 }, { x: 0.3, y: 0.8, z: -0.51 }, { x: 1, y: 0.2, z: 0.4 });

  it("liefert ab dem zweiten Durchlauf denselben Wert", () => {
    const once = normalizePlacementWorkplane(tilted, 0);
    const twice = normalizePlacementWorkplane(once, 0);
    const thrice = normalizePlacementWorkplane(twice, 0);
    const fourth = normalizePlacementWorkplane(thrice, 0);
    expect(JSON.stringify(thrice)).toBe(JSON.stringify(twice));
    expect(JSON.stringify(fourth)).toBe(JSON.stringify(twice));
  });

  it("haelt die Achsen auf neun Nachkommastellen", () => {
    const stored = normalizePlacementWorkplane(tilted, 0);
    const coordinates = [stored.normal, stored.xAxis, stored.zAxis].flatMap((axis) => [axis.x, axis.y, axis.z]);
    coordinates.forEach((value) => {
      expect(Number(value.toFixed(9))).toBe(value);
    });
    // Und bleibt dabei eine Ebene: die Achsen stehen weiter senkrecht
    // aufeinander und sind einen Millimeter lang.
    const dot = (a: typeof stored.normal, b: typeof stored.normal) => a.x * b.x + a.y * b.y + a.z * b.z;
    expect(dot(stored.normal, stored.xAxis)).toBeCloseTo(0, 8);
    expect(dot(stored.normal, stored.zAxis)).toBeCloseTo(0, 8);
    expect(dot(stored.xAxis, stored.zAxis)).toBeCloseTo(0, 8);
    expect(dot(stored.normal, stored.normal)).toBeCloseTo(1, 8);
  });

  it("laesst eine waagerechte Ebene unangetastet", () => {
    const flat = normalizePlacementWorkplane(horizontalPlacementWorkplane(12), 0);
    expect(JSON.stringify(flat)).toBe(JSON.stringify(horizontalPlacementWorkplane(12)));
  });
});

/**
 * Am Fingerabdruck haengt, ob ein Wechsel der Arbeitsebene als Aenderung
 * zaehlt - fuer den Verlauf und fuer das Sichern.
 */
describe("der Fingerabdruck einer Arbeitsebene", () => {
  it("ist fuer dieselbe Ebene derselbe und fuer eine andere ein anderer", () => {
    const base = horizontalPlacementWorkplane(0);
    const raised = horizontalPlacementWorkplane(10);
    expect(placementWorkplaneFingerprint(base)).toBe(placementWorkplaneFingerprint(horizontalPlacementWorkplane(0)));
    expect(placementWorkplaneFingerprint(base)).not.toBe(placementWorkplaneFingerprint(raised));
  });

  it("macht aus einer unlesbaren Angabe die Hauptebene", () => {
    expect(normalizePlacementWorkplane(null, 15).origin.y).toBe(15);
    expect(normalizePlacementWorkplane({}, 8).origin.y).toBe(8);
    expect(normalizePlacementWorkplane({ origin: { x: 0, y: "kaputt", z: 0 } }, 4).origin.y).toBe(4);
  });
});
