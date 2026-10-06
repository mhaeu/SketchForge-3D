import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { snapPointOnMesh, snapTranslation, type SnapPoint, type SnapTarget } from "@/lib/pointSnap";
import { pointIsCutAway } from "@/lib/sectionView";

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
function pick(positions: Float64Array, triangle: number, screen: { x: number; y: number }, target: SnapTarget = "auto") {
  const hit = snapPointOnMesh({
    positions,
    triangle,
    pointer: screen,
    // Kommt nur bei "Fläche, frei" heraus; hier rechnet die Vorgabe selbst.
    hitPoint: { x: 0, y: 0, z: 0 },
    target,
    project,
  });
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

/**
 * Die Schnittansicht und das Ansetzen zusammen.
 *
 * Beim Zeigen rechnet three.js ohne die Schnittebenen - ein Eck in der
 * weggenommenen Haelfte ist fuer den Strahl also voll da. Darum bekommt
 * `snapPointOnMesh` im Ansichtsfenster eine Sichtpruefung, die beides
 * abfragt: was ein anderer Koerper verdeckt *und* was die Schnittansicht
 * weggenommen hat. Hier laufen die beiden echten Teile gegeneinander.
 */
describe("Ansetzen in der Schnittansicht", () => {
  const view = { axis: "x" as const, offset: 0, flipped: false };
  const box = worldSoup(new THREE.BoxGeometry(20, 10, 6), placement(0, 5, 0, 0));
  // Stehen bleibt, was unter dem Schnitt liegt: hier alles mit x <= 0.
  const available = (point: SnapPoint) => !pointIsCutAway(point, view);
  const hidden = { x: 10, y: 10, z: 3 };

  /** Dieselbe Frage einmal ohne und einmal mit Schnitt. */
  function both(target: SnapTarget, pointer: SnapPoint) {
    const shared = { positions: box, triangle: 0, pointer: project(pointer), hitPoint: pointer, target, project };
    return {
      whole: snapPointOnMesh(shared),
      cut: snapPointOnMesh({ ...shared, available }),
    };
  }

  /**
   * Die drei Wege durch die Rechnung, die vor dieser Pruefung alle drei einen
   * weggenommenen Punkt zurueckgaben.
   *
   * Eine *Ansage* bekommt weiter eine Antwort, nur eben eine stehengebliebene:
   * "Eckpunkt" hat mit Absicht keinen Umkreis - wer ihn waehlt, will eine Ecke
   * und keine Absage. "Automatisch" dagegen fragt nur im Umkreis von elf bis
   * dreizehn Bildpunkten und faellt sonst auf die Flaechenmitte zurueck; ist
   * die weggenommen, gibt es hier nichts zu greifen.
   */
  it("gibt in der weggenommenen Haelfte nichts Weggenommenes her", () => {
    const corner = both("corner", hidden);
    expect(corner.whole?.point.x).toBeCloseTo(10, 6);
    expect(corner.cut?.kind).toBe("corner");
    expect(corner.cut?.point.x).toBeLessThanOrEqual(0);

    const edge = both("edge", hidden);
    expect(edge.whole?.point.x).toBeCloseTo(10, 6);
    expect(edge.cut?.kind).toBe("edge");
    expect(edge.cut?.point.x).toBeLessThanOrEqual(0);

    // Ohne Schnitt liegt der Zeiger genau auf dem Eck und bekommt es.
    const auto = both("auto", hidden);
    expect(auto.whole?.kind).toBe("corner");
    expect(auto.whole?.point.x).toBeCloseTo(10, 6);
    // Mit Schnitt ist im Umkreis nichts uebrig und die Flaechenmitte weg.
    expect(auto.cut).toBeNull();
  });

  /** Und die Flaechenmitte auf Ansage: dieselbe Absage. */
  it("gibt auch die Mitte einer weggenommenen Flaeche nicht her", () => {
    expect(both("face", hidden).whole?.point.x).toBeCloseTo(10, 6);
    expect(both("face", hidden).cut).toBeNull();
  });

  it("gibt auf der stehengebliebenen Seite dasselbe her wie ohne Schnitt", () => {
    const standing = { x: -10, y: 10, z: 3 };
    const corner = both("corner", standing);
    expect(corner.cut).toEqual(corner.whole);
    expect(corner.cut?.kind).toBe("corner");
    expect(corner.cut?.point.x).toBeCloseTo(-10, 6);

    const auto = both("auto", standing);
    expect(auto.cut).toEqual(auto.whole);
  });

  /**
   * Und die Schnittflaeche selbst bleibt greifbar: Genau dort liegt das
   * Innere, das man sich ansehen will. Ihre Ecken liegen auf der Ebene.
   */
  it("laesst die Schnittflaeche selbst greifen", () => {
    expect(available({ x: 0, y: 5, z: 0 })).toBe(true);
  });

  /**
   * Verdeckt ist nicht weggenommen: Wer ausdruecklich eine Ecke verlangt,
   * bekommt sie auch hinter einem anderen Koerper. Nur der Schnitt sagt
   * wirklich ab.
   */
  it("haelt an der weichen Sichtpruefung fest", () => {
    const hit = snapPointOnMesh({
      positions: box, triangle: 0, pointer: project(hidden), hitPoint: hidden,
      target: "corner", project, visible: () => false,
    });
    expect(hit?.point.x).toBeCloseTo(10, 6);
  });
});
