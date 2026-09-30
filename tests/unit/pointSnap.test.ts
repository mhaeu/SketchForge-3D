import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  SNAP_MAX_TRIANGLES,
  meshSnapFeatures,
  snapMoveIds,
  snapPointOnMesh,
  snapTranslation,
  type SnapPoint,
} from "@/lib/pointSnap";

/**
 * Die Netze kommen aus three.js, also aus derselben Quelle wie die des
 * Editors: eine Naht doppelt vorhanden, Deckel und Mantel getrennt, Punkte in
 * einfacher Genauigkeit. Handgebaute Kaesten wuerden genau das verstecken,
 * worauf das Zusammenschweissen der Ecken antwortet.
 */
function soup(geometry: THREE.BufferGeometry) {
  const plain = geometry.index ? geometry.toNonIndexed() : geometry;
  return Array.from(plain.getAttribute("position").array as Float32Array);
}

/**
 * Eine schraege Parallelprojektion. Sie trennt alle acht Ecken eines Kastens -
 * ein Blick gerade von vorn legt die hinteren auf die vorderen, und dann ist
 * nicht mehr zu sehen, welche Ecke gemeint war.
 */
const SCALE = 8;
function project(point: SnapPoint) {
  return {
    x: 300 + (point.x - point.z) * SCALE,
    y: 300 - (point.y + (point.x + point.z) * 0.4) * SCALE,
  };
}

function nearly(a: SnapPoint, b: SnapPoint, tolerance = 1e-4) {
  return Math.abs(a.x - b.x) < tolerance && Math.abs(a.y - b.y) < tolerance && Math.abs(a.z - b.z) < tolerance;
}

/**
 * Was eine Kamera ueber der Ecke (1, 1, 1) von einem Kasten um den Nullpunkt
 * sieht: Die Projektion allein weiss nichts von Tiefe, also muss die Sicht
 * gesondert gefragt werden.
 */
function visible(point: SnapPoint) {
  return point.x + point.y + point.z >= 0;
}

describe("Was am Netz zum Anfassen da ist", () => {
  it("findet am Kasten acht Ecken und zwoelf Kanten", () => {
    const features = meshSnapFeatures(soup(new THREE.BoxGeometry(20, 10, 6)));
    expect(features.corners).toHaveLength(8);
    expect(features.edges).toHaveLength(12);
    for (const x of [-10, 10]) {
      for (const y of [-5, 5]) {
        for (const z of [-3, 3]) {
          expect(features.corners.some((corner) => nearly(corner, { x, y, z }))).toBe(true);
        }
      }
    }
  });

  /**
   * Die Diagonale ueber eine Kastenwand ist blosse Unterteilung. Wuerde sie
   * mitzaehlen, koennte man mitten auf der Wand an einem Strich haengen, den
   * es am Koerper nicht gibt.
   */
  it("haelt die Unterteilung einer Wand nicht fuer eine Kante", () => {
    const features = meshSnapFeatures(soup(new THREE.PlaneGeometry(20, 10, 4, 3)));
    // Vier Raender, jeder in so viele Stuecke geteilt wie die Unterteilung.
    expect(features.edges).toHaveLength(4 + 3 + 4 + 3);
    expect(features.corners).toHaveLength(4);
  });

  /**
   * Am Rohr bleiben die beiden Endraender uebrig. Am Mantel knickt es je Naht
   * nur 360/32 Grad - dort ist nichts zu fangen, und an den Raendern auch
   * keine Ecke: Der Rand ist ein Kreis, auf dem jede Stelle gleich viel gilt.
   */
  it("laesst am Rohr die Endraender stehen und setzt keine Ecken darauf", () => {
    const features = meshSnapFeatures(soup(new THREE.CylinderGeometry(5, 5, 20, 32)));
    expect(features.corners).toHaveLength(0);
    expect(features.edges).toHaveLength(64);
    for (const [a] of features.edges) {
      expect(Math.abs(Math.abs(a.y) - 10)).toBeLessThan(1e-4);
    }
  });

  it("findet an einer Kugel nichts zum Anfassen", () => {
    const features = meshSnapFeatures(soup(new THREE.SphereGeometry(8, 32, 16)));
    expect(features.corners).toHaveLength(0);
    expect(features.edges).toHaveLength(0);
  });

  /**
   * Ein grobes Rohr ist gekantet, und dann sind seine Nahtpunkte auch Ecken:
   * Bei sechs Seiten knickt der Rand um 60 Grad.
   */
  it("findet am groben Sechskant seine Ecken", () => {
    const features = meshSnapFeatures(soup(new THREE.CylinderGeometry(5, 5, 20, 6)));
    expect(features.corners).toHaveLength(12);
  });

  it("sucht in einem sehr grossen Netz nicht nach Kanten", () => {
    const box = soup(new THREE.BoxGeometry(20, 10, 6));
    const padded = new Float32Array((SNAP_MAX_TRIANGLES + 1) * 9);
    padded.set(box);
    // Ohne die Schranke kaeme der Kasten am Anfang mit seinen acht Ecken
    // heraus; die angehaengten entarteten Dreiecke tragen nichts bei.
    expect(meshSnapFeatures(padded).corners).toHaveLength(0);
    expect(meshSnapFeatures(box.slice()).corners).toHaveLength(8);
  });
});

describe("Der Punkt, auf den gezeigt wird", () => {
  const box = soup(new THREE.BoxGeometry(20, 10, 6));

  it("nimmt die Ecke, wenn der Zeiger nah an ihr steht", () => {
    const wanted = { x: 10, y: 5, z: 3 };
    const screen = project(wanted);
    const hit = snapPointOnMesh(box, 0, { x: screen.x + 4, y: screen.y - 5 }, project, visible)!;
    expect(hit.kind).toBe("corner");
    expect(nearly(hit.point, wanted)).toBe(true);
  });

  it("nimmt die Stelle auf der Kante, auf die gezeigt wird", () => {
    // Ein Viertel entlang der oberen vorderen Kante, weit weg von beiden Ecken.
    const wanted = { x: -5, y: 5, z: 3 };
    const hit = snapPointOnMesh(box, 0, project(wanted), project, visible)!;
    expect(hit.kind).toBe("edge");
    expect(nearly(hit.point, wanted)).toBe(true);
  });

  it("nimmt die Mitte der Flaeche, wenn weit und breit keine Kante ist", () => {
    const screen = project({ x: 0, y: 0, z: 3 });
    // Dreieck 8 und 9 bilden bei three.js die vordere Wand (z = +3).
    const hit = snapPointOnMesh(box, 8, screen, project, visible)!;
    expect(hit.kind).toBe("face");
    expect(hit.point.x).toBeCloseTo(0, 6);
    expect(hit.point.y).toBeCloseTo(0, 6);
    expect(hit.point.z).toBeCloseTo(3, 6);
  });

  /**
   * Genau der Grund, warum die Sicht gesondert gefragt wird: In der
   * Parallelprojektion laeuft die hintere obere Kante des Kastens mitten
   * durch seine vordere Wand. Wer nur auf dem Schirm messen wuerde, haengte
   * den Punkt an eine Kante, die der Benutzer nicht sehen kann.
   */
  it("wuerde ohne Sichtpruefung an der verdeckten Kante dahinter haengen", () => {
    const screen = project({ x: 0, y: 0, z: 3 });
    const blind = snapPointOnMesh(box, 8, screen, project)!;
    expect(blind.kind).toBe("edge");
    expect(blind.point.z).toBeCloseTo(-3, 6);
  });

  /**
   * Die Ecke geht der Kante vor: Nah an einer Ecke laeuft auch immer eine
   * Kante, und gemeint ist dann die Ecke.
   */
  it("bevorzugt die Ecke, wenn beide in Reichweite liegen", () => {
    const corner = { x: 10, y: 5, z: 3 };
    const screen = project(corner);
    const hit = snapPointOnMesh(box, 0, { x: screen.x - 2, y: screen.y + 2 }, project, visible)!;
    expect(hit.kind).toBe("corner");
    expect(nearly(hit.point, corner)).toBe(true);
  });

  it("uebergeht, was hinter der Kamera liegt", () => {
    const corner = { x: 10, y: 5, z: 3 };
    const screen = project(corner);
    const behind = (point: SnapPoint) => (nearly(point, corner) ? null : project(point));
    const hit = snapPointOnMesh(box, 0, { x: screen.x + 1, y: screen.y + 1 }, behind, visible)!;
    expect(nearly(hit.point, corner)).toBe(false);
  });

  it("nimmt die naechste Ecke, die nicht verdeckt ist", () => {
    const hidden = { x: 10, y: 5, z: 3 };
    const screen = project(hidden);
    const hit = snapPointOnMesh(box, 0, screen, project, (point) => !nearly(point, hidden))!;
    expect(nearly(hit.point, hidden)).toBe(false);
  });

  it("gibt nichts zurueck, wenn das getroffene Dreieck nicht zum Netz gehoert", () => {
    expect(snapPointOnMesh(box, 999, { x: 0, y: 0 }, project)).toBeNull();
    expect(snapPointOnMesh(box, -1, { x: 0, y: 0 }, project)).toBeNull();
  });
});

describe("Was aus zwei Punkten folgt", () => {
  it("verschiebt den ersten Punkt genau auf den zweiten", () => {
    const translation = snapTranslation({ x: 3, y: -2, z: 8 }, { x: -1, y: 4, z: 8 });
    expect(translation).toEqual({ x: -4, y: 6, z: 0 });
  });

  it("bewegt allein den angesetzten Koerper, wenn er nicht ausgewaehlt ist", () => {
    const shapes = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(snapMoveIds("a", ["b", "c"], shapes)).toEqual(["a"]);
  });

  it("nimmt die ganze Auswahl mit, wenn der angesetzte Koerper dazugehoert", () => {
    const shapes = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(snapMoveIds("a", ["a", "c"], shapes)).toEqual(["a", "c"]);
  });

  it("laesst festgestellte Koerper stehen", () => {
    const shapes = [{ id: "a" }, { id: "b", locked: true }, { id: "c" }];
    expect(snapMoveIds("a", ["a", "b", "c"], shapes)).toEqual(["a", "c"]);
  });

  it("bewegt nichts, wenn der angesetzte Koerper festgestellt ist", () => {
    const shapes = [{ id: "a", locked: true }, { id: "b" }];
    expect(snapMoveIds("a", ["a", "b"], shapes)).toEqual([]);
  });

  it("bewegt nichts, wenn der angesetzte Koerper nicht mehr da ist", () => {
    expect(snapMoveIds("a", ["a"], [{ id: "b" }])).toEqual([]);
  });
});
