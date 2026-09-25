import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { regionBoxPlacement, regionFrameStillHolds, regionFromBoxPlacement, workplaneFramePatch } from "@/lib/regionFrame";
import type { ResizeRegion } from "@/lib/regionResize";
import type { PlacementWorkplane } from "@/lib/placementWorkplane";
import type { WorkplaneShape } from "@/types/sketchforge";

/** Ein Netz als Dreieckssuppe, hier nur als Punktwolke gebraucht. */
function boxPositions(width: number, height: number, depth: number) {
  const points: number[] = [];
  [-1, 1].forEach((sx) => [0, 1].forEach((sy) => [-1, 1].forEach((sz) => {
    points.push(sx * width / 2, sy * height, sz * depth / 2);
  })));
  // Auf ein Vielfaches von neun bringen, damit es wie Dreiecke aussieht.
  while (points.length % 9 !== 0) points.push(0, 0, 0);
  return points;
}

function shape(patch: Partial<WorkplaneShape> = {}): WorkplaneShape {
  const width = 30;
  const height = 20;
  const depth = 10;
  return {
    id: "s", name: "s", kind: "mesh", color: "#fff",
    x: 5, z: -7, elevation: 3,
    width, depth, height, size: width,
    rotation: 0, rotationX: 0, rotationZ: 0,
    importedMesh: {
      positions: boxPositions(width, height, depth),
      baseWidth: width, baseDepth: depth, baseHeight: height,
      triangleCount: 0, sourceFormat: "json",
    },
    ...patch,
  } as WorkplaneShape;
}

/** Die Punkte des Koerpers in der Szene - so, wie die Ansicht sie stellt. */
function worldPoints(body: WorkplaneShape) {
  const positions = body.importedMesh!.positions;
  const centre = new THREE.Vector3(body.x, (body.elevation ?? 0) + body.height / 2, body.z);
  const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(
    THREE.MathUtils.degToRad(body.rotationX ?? 0),
    THREE.MathUtils.degToRad(body.rotation ?? 0),
    THREE.MathUtils.degToRad(body.rotationZ ?? 0),
    "XYZ",
  ));
  const out: THREE.Vector3[] = [];
  for (let index = 0; index + 2 < positions.length; index += 3) {
    out.push(new THREE.Vector3(positions[index], positions[index + 1] - body.height / 2, positions[index + 2])
      .applyQuaternion(quaternion).add(centre));
  }
  return out;
}

const region: ResizeRegion = { minX: -5, maxX: 9, minY: 4, maxY: 15, minZ: -3, maxZ: 2 };

/** Eine gekippte Arbeitsebene: um 90 Grad um die Laengsachse gedreht. */
const tilted: PlacementWorkplane = {
  origin: { x: 0, y: 0, z: 0 },
  normal: { x: 0, y: 0, z: -1 },
  xAxis: { x: 1, y: 0, z: 0 },
  zAxis: { x: 0, y: 1, z: 0 },
};

describe("Der Kasten des Teilbereichs in der Szene", () => {
  it("steht an einem ungedrehten Koerper dort, wo er immer stand", () => {
    const body = shape();
    const box = regionBoxPlacement(body, region);
    expect(box.x).toBeCloseTo(body.x + 2, 9);
    expect(box.z).toBeCloseTo(body.z - 0.5, 9);
    expect(box.elevation).toBeCloseTo((body.elevation ?? 0) + 4, 9);
    expect([box.width, box.height, box.depth]).toEqual([14, 11, 5]);
  });

  it("dreht sich mit dem Koerper", () => {
    /*
     * Frueher wurde er ohne dessen Drehung gezeichnet - an einem gedrehten
     * Koerper stand er dann woanders als das Material, das er meint.
     */
    const body = shape({ rotation: 90 });
    const box = regionBoxPlacement(body, region);
    expect(box.rotation).toBe(90);
    // Um neunzig Grad um die Hochachse: aus laengs wird quer.
    expect(box.x).toBeCloseTo(body.x - 0.5, 9);
    expect(box.z).toBeCloseTo(body.z - 2, 9);
  });

  it("findet aus dem gezogenen Kasten wieder denselben Bereich", () => {
    for (const body of [shape(), shape({ rotation: 90 }), shape({ rotationX: 45, rotation: 30 })]) {
      const placed = regionBoxPlacement(body, region);
      const back = regionFromBoxPlacement(body, { ...placed, size: placed.width } as WorkplaneShape);
      (Object.keys(region) as Array<keyof ResizeRegion>).forEach((face) => {
        expect(back[face]).toBeCloseTo(region[face], 6);
      });
    }
  });
});

describe("Das Netz in den Rahmen der Arbeitsebene drehen", () => {
  it("laesst den Koerper stehen, wo er steht", () => {
    /*
     * Sichtbar aendert sich nichts - nur die Achsen, in denen gerechnet wird.
     * Geprueft wird das auch an einem Koerper, der nicht um seine Mitte
     * herum symmetrisch ist: Bei einem symmetrischen faellt die Verschiebung
     * beim Drehen von selbst auf null, und ein Fehler dort bliebe unbemerkt.
     */
    const lopsided = shape({
      // Eine Pyramide: unten die volle Grundflaeche, oben eine Spitze. Beim
      // Kippen liegt ihr Kasten nicht mehr um die alte Mitte.
      importedMesh: {
        positions: [
          -15, 0, -5, 15, 0, -5, 15, 0, 5,
          -15, 0, -5, 15, 0, 5, -15, 0, 5,
          -15, 0, -5, 15, 0, -5, 0, 20, 0,
          15, 0, 5, -15, 0, 5, 0, 20, 0,
        ],
        baseWidth: 30, baseDepth: 10, baseHeight: 20, triangleCount: 4, sourceFormat: "json",
      },
    } as Partial<WorkplaneShape>);
    /** Eine schraege Ebene - bei rechten Winkeln bleibt der Kasten von selbst mittig. */
    const oblique: PlacementWorkplane = (() => {
      const half = Math.SQRT1_2;
      return {
        origin: { x: 0, y: 0, z: 0 },
        normal: { x: 0, y: half, z: -half },
        xAxis: { x: 1, y: 0, z: 0 },
        zAxis: { x: 0, y: half, z: half },
      };
    })();
    for (const [body, plane] of [[shape(), tilted], [lopsided, tilted], [lopsided, oblique]] as const) {
      const result = workplaneFramePatch(body, plane)!;
      expect(result).not.toBeNull();
      const turned = { ...body, ...result.patch } as WorkplaneShape;
      const before = worldPoints(body).map((point) => point.toArray().map((value) => value.toFixed(6)).join(",")).sort();
      const after = worldPoints(turned).map((point) => point.toArray().map((value) => value.toFixed(6)).join(",")).sort();
      expect(after).toEqual(before);
    }
  });

  it("legt die eigenen Achsen des Koerpers auf die der Arbeitsebene", () => {
    const body = shape();
    const turned = { ...body, ...workplaneFramePatch(body, tilted)!.patch } as WorkplaneShape;
    // Die Hochachse des Koerpers zeigt danach dorthin, wo die Normale der
    // Arbeitsebene hinzeigt - und damit auch die Hoehe des Teilbereichs.
    const up = new THREE.Vector3(0, 1, 0).applyEuler(new THREE.Euler(
      THREE.MathUtils.degToRad(turned.rotationX ?? 0),
      THREE.MathUtils.degToRad(turned.rotation ?? 0),
      THREE.MathUtils.degToRad(turned.rotationZ ?? 0),
      "XYZ",
    ));
    expect(up.x).toBeCloseTo(tilted.normal.x, 6);
    expect(up.y).toBeCloseTo(tilted.normal.y, 6);
    expect(up.z).toBeCloseTo(tilted.normal.z, 6);
  });

  it("misst den Koerper im neuen Rahmen neu", () => {
    // Gekippt ist seine Hoehe die alte Tiefe - genau das soll der Teilbereich
    // dann auch anzeigen.
    const body = shape();
    const patch = workplaneFramePatch(body, tilted)!.patch;
    expect(patch.height).toBeCloseTo(10, 6);
    expect(patch.width).toBeCloseTo(30, 6);
    expect(patch.depth).toBeCloseTo(20, 6);
  });

  it("ruehrt nichts an, wo der Rahmen schon stimmt", () => {
    const base: PlacementWorkplane = {
      origin: { x: 0, y: 0, z: 0 },
      normal: { x: 0, y: 1, z: 0 },
      xAxis: { x: 1, y: 0, z: 0 },
      zAxis: { x: 0, y: 0, z: 1 },
    };
    expect(workplaneFramePatch(shape(), base)).toBeNull();
    expect(workplaneFramePatch({ ...shape(), importedMesh: undefined } as WorkplaneShape, tilted)).toBeNull();
  });
});

/**
 * Gemeldet an einem gedrehten Koerper auf einer anderen Arbeitsebene: Es liess
 * sich ueberhaupt kein Teilbereich waehlen.
 *
 * Der Kasten wird eingeschaltet, der Koerper dabei in die Arbeitsebene
 * gedreht - und traegt danach deren Drehung. Die Wache, die den Kasten
 * begleitet, warf ihn genau dafuer sofort wieder weg: Sie liess nur ein
 * ungedrehtes Netz gelten. Auf der Hauptarbeitsebene faellt das Drehen weg,
 * dort ging es; auf jeder anderen war der Kasten weg, ehe man ihn anfassen
 * konnte.
 */
describe("Ob der Kasten an diesem Koerper noch gilt", () => {
  it("haelt an einem Koerper, der in die Arbeitsebene gedreht wurde", () => {
    const body = shape();
    const aligned = workplaneFramePatch(body, tilted)!;
    const turned = { ...body, ...aligned.patch } as WorkplaneShape;
    // Genau die Drehung, an der es scheiterte.
    expect(Math.abs(turned.rotation ?? 0) + Math.abs(turned.rotationX ?? 0) + Math.abs(turned.rotationZ ?? 0))
      .toBeGreaterThan(0);
    expect(regionFrameStillHolds(turned)).toBe(true);
  });

  it("traegt den ganzen Weg: ausrichten, Kasten stellen, Bereich zurueck", () => {
    // Der gemeldete Fall von Anfang bis Ende - der Koerper wird in die
    // Arbeitsebene gedreht, der Kasten in der Szene gestellt und aus ihm
    // wieder der Bereich gelesen. Was herauskommt, muss der Bereich sein, mit
    // dem angefangen wurde.
    const aligned = workplaneFramePatch(shape(), tilted)!;
    const turned = { ...shape(), ...aligned.patch } as WorkplaneShape;
    expect(regionFrameStillHolds(turned)).toBe(true);

    const inside: ResizeRegion = {
      minX: -4, maxX: 6,
      minY: 2, maxY: turned.height - 3,
      minZ: -2, maxZ: 3,
    };
    const box = regionBoxPlacement(turned, inside);
    const back = regionFromBoxPlacement(turned, { ...box, id: "b", name: "b", kind: "box", color: "#fff" } as WorkplaneShape);
    (Object.keys(inside) as Array<keyof ResizeRegion>).forEach((face) => {
      expect(back[face]).toBeCloseTo(inside[face], 6);
    });
  });

  it("haelt am schlichten, ungedrehten Netz", () => {
    expect(regionFrameStillHolds(shape())).toBe(true);
  });

  it("faellt, wo das Netz nicht mehr dasteht", () => {
    // Ein Rueckgaengig ueber die Verwandlung hinaus macht aus dem Netz wieder
    // das, was der Koerper vorher war.
    expect(regionFrameStillHolds(undefined)).toBe(false);
    expect(regionFrameStillHolds(null)).toBe(false);
    expect(regionFrameStillHolds(shape({ kind: "box" }))).toBe(false);
    expect(regionFrameStillHolds(shape({ importedMesh: undefined }))).toBe(false);
  });

  it("faellt an einem gesperrten Koerper", () => {
    expect(regionFrameStillHolds(shape({ locked: true }))).toBe(false);
  });

  it("faellt an einem gespiegelten Koerper", () => {
    // Eine Spiegelung kehrt den Rahmen um, in dem gemessen wird, und laesst
    // sich nicht als Drehung mittragen.
    expect(regionFrameStillHolds(shape({ mirrorX: true }))).toBe(false);
    expect(regionFrameStillHolds(shape({ mirrorY: true }))).toBe(false);
    expect(regionFrameStillHolds(shape({ mirrorZ: true }))).toBe(false);
  });
});
