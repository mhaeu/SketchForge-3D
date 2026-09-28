import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { cavityFitPatch, unturnedMeshSize } from "@/lib/cavityFit";
import { shapeRotationQuaternion } from "@/lib/geometryRotation";
import type { WorkplaneShape } from "@/types/sketchforge";

/** Ein Kasten als Punktwolke im eigenen Rahmen: x/z um null, y ab null. */
function boxPositions(width: number, depth: number, height: number) {
  const points: number[] = [];
  [-1, 1].forEach((sx) => [0, 1].forEach((sy) => [-1, 1].forEach((sz) => {
    points.push((sx * width) / 2, sy * height, (sz * depth) / 2);
  })));
  while (points.length % 9 !== 0) points.push(0, 0, 0);
  return points;
}

type Turn = { rotation: number; rotationX: number; rotationZ: number };

/** Ein gebackener Koerper: das Netz gedreht, neu vermessen, neu gesetzt. */
function bakedBody(size: { width: number; depth: number; height: number }, turn: Turn): WorkplaneShape {
  const raw = boxPositions(size.width, size.depth, size.height);
  const quaternion = shapeRotationQuaternion(turn as WorkplaneShape);
  const half = size.height / 2;
  const box = new THREE.Box3().makeEmpty();
  const turned: THREE.Vector3[] = [];
  for (let index = 0; index + 2 < raw.length; index += 3) {
    const point = new THREE.Vector3(raw[index], raw[index + 1] - half, raw[index + 2]).applyQuaternion(quaternion);
    turned.push(point);
    box.expandByPoint(point);
  }
  const outer = box.getSize(new THREE.Vector3());
  const positions: number[] = [];
  turned.forEach((point) => positions.push(point.x - (box.min.x + box.max.x) / 2, point.y - box.min.y, point.z - (box.min.z + box.max.z) / 2));
  return {
    id: "hohl", name: "Hohl", kind: "mesh", color: "#fff",
    x: 3, z: -2, elevation: 1,
    width: outer.x, depth: outer.z, height: outer.y, size: Math.max(outer.x, outer.z),
    rotation: 0, rotationX: 0, rotationZ: 0,
    bakedRotation: turn,
    importedMesh: { positions, baseWidth: outer.x, baseDepth: outer.z, baseHeight: outer.y, triangleCount: 0, sourceFormat: "json" },
  } as unknown as WorkplaneShape;
}

/** Der frisch gebaute volle Koerper: ungedreht, Masse gleich seinem Netz. */
function freshlyBuilt(width: number, depth: number, height: number): WorkplaneShape {
  return {
    id: "voll", name: "Voll", kind: "mesh", color: "#fff",
    x: 0, z: 0, elevation: 0,
    width, depth, height, size: Math.max(width, depth),
    rotation: 0, rotationX: 0, rotationZ: 0,
    importedMesh: {
      positions: boxPositions(width, depth, height),
      baseWidth: width, baseDepth: depth, baseHeight: height, triangleCount: 0, sourceFormat: "json",
    },
  } as unknown as WorkplaneShape;
}

describe("Die Masse eines Koerpers in seinem eigenen Rahmen", () => {
  it("liest sie an einem ungedrehten Koerper einfach ab", () => {
    const size = unturnedMeshSize(freshlyBuilt(24, 24, 71))!;
    expect(size.width).toBeCloseTo(24, 6);
    expect(size.depth).toBeCloseTo(24, 6);
    expect(size.height).toBeCloseTo(71, 6);
  });

  it("holt sie an einem gedrehten Koerper aus dem Netz zurueck", () => {
    /*
     * Ein gedrehter Koerper traegt die Masse des Kastens um die gedrehte Form;
     * die eigenen stehen nur noch im Netz. Genau die braucht der Vergleich mit
     * dem frisch gebauten, ungedrehten Koerper.
     */
    const body = bakedBody({ width: 24, depth: 24, height: 71 }, { rotation: 87.2, rotationX: 0, rotationZ: 103.1 });
    // Der Kasten um die gedrehte Form ist ein ganz anderer.
    expect(body.height).not.toBeCloseTo(71, 1);
    const size = unturnedMeshSize(body)!;
    expect(size.width).toBeCloseTo(24, 6);
    expect(size.depth).toBeCloseTo(24, 6);
    expect(size.height).toBeCloseTo(71, 6);
  });

  it("nimmt die Streckung des angezeigten Netzes mit", () => {
    const stretched = { ...freshlyBuilt(24, 24, 71), height: 142 } as WorkplaneShape;
    expect(unturnedMeshSize(stretched)!.height).toBeCloseTo(142, 6);
  });

  it("meldet nichts, wo kein Netz ist", () => {
    expect(unturnedMeshSize({ ...freshlyBuilt(24, 24, 71), importedMesh: undefined } as WorkplaneShape)).toBeNull();
  });
});

/**
 * Gemeldet an einem Rotationskoerper, dessen Zeichnung 45 mm lang war,
 * waehrend er selbst 71 mm lang dastand: Der Hohlraum liess sich nicht
 * aussparen. Der neu gebaute volle Koerper kam in der gezeichneten Groesse
 * heraus, steckte den hohlen nicht ein, und die Sicherheitsprobe sagte ab.
 */
describe("Den vollen Koerper auf die Masse des hohlen bringen", () => {
  const tool = bakedBody({ width: 24, depth: 24, height: 71 }, { rotation: 87.2, rotationX: 0, rotationZ: 103.1 });

  it("traegt eine Streckung nach, die nach dem Zeichnen dazukam", () => {
    // Genau der gemeldete Fall: gezeichnet 45 lang, gezogen auf 71.
    const patch = cavityFitPatch(freshlyBuilt(24, 24, 45), tool)!;
    expect(patch.height).toBeCloseTo(71, 6);
    expect(patch.width).toBeCloseTo(24, 6);
    expect(patch.depth).toBeCloseTo(24, 6);
  });

  it("laesst in Ruhe, was schon zusammenpasst", () => {
    expect(cavityFitPatch(freshlyBuilt(24, 24, 71), tool)).toBeNull();
  });

  it("uebergeht einen Unterschied, der nur aus der Taefelung kommt", () => {
    // Ein 64-Eck misst ein Zehntelpromille anders als der Kreis, den es meint.
    expect(cavityFitPatch(freshlyBuilt(24.002, 23.998, 71.004), tool)).toBeNull();
  });

  it("setzt auch die Groesse mit, die aus Breite und Tiefe folgt", () => {
    const patch = cavityFitPatch(freshlyBuilt(10, 20, 45), tool)!;
    expect(patch.size).toBeCloseTo(24, 6);
  });

  it("meldet nichts, wenn der hohle Koerper sich nicht messen laesst", () => {
    const noMesh = { ...tool, importedMesh: undefined } as WorkplaneShape;
    expect(cavityFitPatch(freshlyBuilt(24, 24, 45), noMesh)).toBeNull();
  });
});
