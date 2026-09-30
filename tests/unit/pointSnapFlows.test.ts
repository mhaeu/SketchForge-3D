import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { snapPointOnMesh, snapTranslation, type SnapPoint } from "@/lib/pointSnap";

/**
 * Der ganze Weg vom Klick bis zum verschobenen Koerper, an gedrehten Netzen.
 *
 * Das Ansetzen rechnet in Weltkoordinaten, und genau dort ist bei uns schon
 * mehrfach etwas verrutscht: Ein gedrehter Koerper hat andere Ecken als seine
 * eigenen Masse hergeben. Darum kommen die Netze hier durch dieselbe Kette
 * wie im Ansichtsfenster - Geometrie, Matrix, Weltpunkte.
 */
function worldSoup(geometry: THREE.BufferGeometry, matrix: THREE.Matrix4) {
  const plain = geometry.index ? geometry.toNonIndexed() : geometry;
  const position = plain.getAttribute("position");
  const world = new Float64Array(position.count * 3);
  const point = new THREE.Vector3();
  for (let corner = 0; corner < position.count; corner += 1) {
    point.fromBufferAttribute(position, corner).applyMatrix4(matrix);
    world[corner * 3] = point.x;
    world[corner * 3 + 1] = point.y;
    world[corner * 3 + 2] = point.z;
  }
  return world;
}

function placement(x: number, y: number, z: number, yawDegrees: number) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, THREE.MathUtils.degToRad(yawDegrees), 0, "XYZ")),
    new THREE.Vector3(1, 1, 1),
  );
}

const SCALE = 7;
function project(point: SnapPoint) {
  return {
    x: 320 + (point.x - point.z) * SCALE,
    y: 320 - (point.y + (point.x + point.z) * 0.4) * SCALE,
  };
}

/** Der Punkt am Koerper, auf den ein Klick auf `screen` faellt. */
function pick(positions: Float64Array, triangle: number, screen: { x: number; y: number }) {
  const hit = snapPointOnMesh(positions, triangle, screen, project);
  expect(hit).not.toBeNull();
  return hit!;
}

describe("Zwei Koerper aufeinandersetzen", () => {
  it("legt die Ecke des gedrehten Kastens genau auf die Ecke des zweiten", () => {
    const turned = placement(12, 4, -5, 30);
    const box = worldSoup(new THREE.BoxGeometry(20, 10, 6), turned);
    const target = worldSoup(new THREE.BoxGeometry(8, 8, 8), placement(-30, 0, 14, 0));

    // Die obere vordere rechte Ecke des gedrehten Kastens, in der Welt.
    const wanted = new THREE.Vector3(10, 5, 3).applyMatrix4(turned);
    const source = pick(box, 0, project(wanted));
    expect(source.kind).toBe("corner");
    expect(source.point.x).toBeCloseTo(wanted.x, 4);
    expect(source.point.z).toBeCloseTo(wanted.z, 4);

    const corner = { x: -26, y: -4, z: 18 };
    const destination = pick(target, 0, project(corner));
    expect(destination.kind).toBe("corner");

    const translation = snapTranslation(source.point, destination.point);
    // So rechnet der Editor: Die Verschiebung kommt auf Lage und Hoehe.
    const moved = {
      x: source.point.x + translation.x,
      y: source.point.y + translation.y,
      z: source.point.z + translation.z,
    };
    expect(moved.x).toBeCloseTo(corner.x, 4);
    expect(moved.y).toBeCloseTo(corner.y, 4);
    expect(moved.z).toBeCloseTo(corner.z, 4);
  });

  /**
   * Der Fall, um den es beim Rohr geht: Zwei runde Enden sollen Achse auf
   * Achse stehen. Eine Ecke gibt es dort nicht - der Klick auf das Ende
   * liefert seine Mitte, und die ist die Achse.
   */
  it("setzt die Achse eines gedrehten Rohrendes auf die Achse eines anderen", () => {
    const turned = placement(6, 12, -4, 25);
    const pipe = worldSoup(new THREE.CylinderGeometry(5, 5, 20, 48), turned);
    const socket = worldSoup(new THREE.CylinderGeometry(5, 5, 14, 48), placement(-18, 3, 20, 0));

    // Ein Dreieck des oberen Deckels. Bei three.js kommen die Deckel nach dem
    // Mantel, der obere zuerst.
    const mantle = 48 * 2;
    const onPipeLid = pick(pipe, mantle + 4, project(new THREE.Vector3(1, 10, 1).applyMatrix4(turned)));
    expect(onPipeLid.kind).toBe("face");
    const pipeAxis = new THREE.Vector3(0, 10, 0).applyMatrix4(turned);
    expect(onPipeLid.point.x).toBeCloseTo(pipeAxis.x, 3);
    expect(onPipeLid.point.y).toBeCloseTo(pipeAxis.y, 3);
    expect(onPipeLid.point.z).toBeCloseTo(pipeAxis.z, 3);

    const onSocketLid = pick(socket, mantle + 4, project({ x: -17, y: 10, z: 21 }));
    expect(onSocketLid.kind).toBe("face");
    expect(onSocketLid.point.x).toBeCloseTo(-18, 3);
    expect(onSocketLid.point.y).toBeCloseTo(10, 3);
    expect(onSocketLid.point.z).toBeCloseTo(20, 3);

    const translation = snapTranslation(onPipeLid.point, onSocketLid.point);
    expect(onPipeLid.point.x + translation.x).toBeCloseTo(-18, 3);
    expect(onPipeLid.point.y + translation.y).toBeCloseTo(10, 3);
    expect(onPipeLid.point.z + translation.z).toBeCloseTo(20, 3);
  });
});
