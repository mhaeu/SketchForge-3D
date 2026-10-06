import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  SNAP_MAX_TRIANGLES,
  chainMiddle,
  meshSnapFeatures,
  snapMoveIds,
  snapPointOnMesh,
  snapTranslation,
  type SnapPoint,
  type SnapTarget,
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

/**
 * Die Stelle, an der der Strahl auftrifft. Nur die Vorgabe "Fläche, frei"
 * gibt sie zurueck; alle anderen rechnen selbst, und dann steht hier
 * irgendein Punkt.
 */
const FACE_POINT = { x: 0, y: 0, z: 3 };

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
    const hit = snapPointOnMesh({ positions: box, triangle: 0, pointer: { x: screen.x + 4, y: screen.y - 5 }, hitPoint: FACE_POINT, target: "auto", project, visible })!;
    expect(hit.kind).toBe("corner");
    expect(nearly(hit.point, wanted)).toBe(true);
  });

  it("nimmt die Stelle auf der Kante, auf die gezeigt wird", () => {
    // Ein Viertel entlang der oberen vorderen Kante, weit weg von beiden Ecken.
    const wanted = { x: -5, y: 5, z: 3 };
    const hit = snapPointOnMesh({ positions: box, triangle: 0, pointer: project(wanted), hitPoint: FACE_POINT, target: "auto", project, visible })!;
    expect(hit.kind).toBe("edge");
    expect(nearly(hit.point, wanted)).toBe(true);
  });

  it("nimmt die Mitte der Flaeche, wenn weit und breit keine Kante ist", () => {
    const screen = project({ x: 0, y: 0, z: 3 });
    // Dreieck 8 und 9 bilden bei three.js die vordere Wand (z = +3).
    const hit = snapPointOnMesh({ positions: box, triangle: 8, pointer: screen, hitPoint: FACE_POINT, target: "auto", project, visible })!;
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
    const blind = snapPointOnMesh({ positions: box, triangle: 8, pointer: screen, hitPoint: FACE_POINT, target: "auto", project })!;
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
    const hit = snapPointOnMesh({ positions: box, triangle: 0, pointer: { x: screen.x - 2, y: screen.y + 2 }, hitPoint: FACE_POINT, target: "auto", project, visible })!;
    expect(hit.kind).toBe("corner");
    expect(nearly(hit.point, corner)).toBe(true);
  });

  it("uebergeht, was hinter der Kamera liegt", () => {
    const corner = { x: 10, y: 5, z: 3 };
    const screen = project(corner);
    const behind = (point: SnapPoint) => (nearly(point, corner) ? null : project(point));
    const hit = snapPointOnMesh({ positions: box, triangle: 0, pointer: { x: screen.x + 1, y: screen.y + 1 }, hitPoint: FACE_POINT, target: "auto", project: behind, visible })!;
    expect(nearly(hit.point, corner)).toBe(false);
  });

  it("nimmt die naechste Ecke, die nicht verdeckt ist", () => {
    const hidden = { x: 10, y: 5, z: 3 };
    const screen = project(hidden);
    const hit = snapPointOnMesh({ positions: box, triangle: 0, pointer: screen, hitPoint: FACE_POINT, target: "auto", project, visible: (point) => !nearly(point, hidden) })!;
    expect(nearly(hit.point, hidden)).toBe(false);
  });

  it("gibt nichts zurueck, wenn das getroffene Dreieck nicht zum Netz gehoert", () => {
    expect(snapPointOnMesh({ positions: box, triangle: 999, pointer: { x: 0, y: 0 }, hitPoint: FACE_POINT, target: "auto", project })).toBeNull();
    expect(snapPointOnMesh({ positions: box, triangle: -1, pointer: { x: 0, y: 0 }, hitPoint: FACE_POINT, target: "auto", project })).toBeNull();
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

describe("Ganze Kanten", () => {
  it("legt die zwoelf Kanten eines Kastens einzeln ab", () => {
    const features = meshSnapFeatures(soup(new THREE.BoxGeometry(20, 10, 6)));
    expect(features.chains).toHaveLength(12);
    for (const chain of features.chains) {
      expect(chain.closed).toBe(false);
      // Zwischen zwei Kastenecken liegt nichts, also bleibt es bei zwei Punkten.
      expect(chain.points).toHaveLength(2);
    }
  });

  it("fasst den Rand eines Rohrendes zu einem Ring zusammen", () => {
    const features = meshSnapFeatures(soup(new THREE.CylinderGeometry(5, 5, 20, 32)));
    expect(features.chains).toHaveLength(2);
    for (const chain of features.chains) {
      expect(chain.closed).toBe(true);
      // Der letzte Punkt ist nicht noch einmal der erste.
      expect(chain.points).toHaveLength(32);
    }
  });

  /**
   * Die Probe auf das Zusammenlegen: Der Rand einer unterteilten Wand besteht
   * aus vier Stuecken. Wer sie einzeln nimmt, findet als "Mitte" das Ende
   * eines Stuecks und nicht die Mitte der Kante.
   */
  it("findet die Mitte einer unterteilten Kante und nicht die eines Stuecks", () => {
    const features = meshSnapFeatures(soup(new THREE.PlaneGeometry(20, 10, 4, 3)));
    const along = features.chains.filter((chain) => chain.points.length === 5);
    expect(along).toHaveLength(2);
    for (const chain of along) {
      const middle = chainMiddle(chain)!;
      expect(middle.x).toBeCloseTo(0, 6);
      expect(Math.abs(middle.y)).toBeCloseTo(5, 6);
    }
  });

  it("nimmt bei einer geraden Kante ihre Mitte", () => {
    const features = meshSnapFeatures(soup(new THREE.BoxGeometry(20, 10, 6)));
    const front = features.chains.find((chain) => chain.points.every((point) => (
      Math.abs(point.y - 5) < 1e-4 && Math.abs(point.z - 3) < 1e-4
    )))!;
    expect(nearly(chainMiddle(front)!, { x: 0, y: 5, z: 3 })).toBe(true);
  });

  /**
   * Beim Ring gibt es keine halbe Laenge, die etwas bedeutet - seine Mitte
   * ist die Achse. Genau das braucht man, um zwei Rohre am Rand anzusetzen,
   * ohne auf das Ende selbst klicken zu koennen.
   */
  it("nimmt beim Ring seine Achse", () => {
    const features = meshSnapFeatures(soup(new THREE.CylinderGeometry(5, 5, 20, 32)));
    for (const chain of features.chains) {
      const middle = chainMiddle(chain)!;
      expect(middle.x).toBeCloseTo(0, 6);
      expect(middle.z).toBeCloseTo(0, 6);
      expect(Math.abs(middle.y)).toBeCloseTo(10, 6);
    }
  });
});

describe("Eine Vorgabe gilt auch weit weg", () => {
  const box = soup(new THREE.BoxGeometry(20, 10, 6));
  const middleOfWall = project({ x: 0, y: 0, z: 3 });
  const request = (target: SnapTarget, pointer: { x: number; y: number }, triangle = 8) => snapPointOnMesh({
    positions: box,
    triangle,
    pointer,
    hitPoint: FACE_POINT,
    target,
    project,
    visible,
  });

  it("holt die naechste Ecke, auch wenn der Zeiger mitten auf der Wand steht", () => {
    const hit = request("corner", middleOfWall)!;
    expect(hit.kind).toBe("corner");
    const corners = meshSnapFeatures(box).corners;
    expect(corners.some((corner) => nearly(corner, hit.point))).toBe(true);
    // Auch ohne Zielkreis bleibt der Vorzug: eine Ecke, die man sieht.
    expect(visible(hit.point)).toBe(true);
  });

  it("holt die naechste Stelle auf einer Kante", () => {
    const hit = request("edge", middleOfWall)!;
    expect(hit.kind).toBe("edge");
    expect(visible(hit.point)).toBe(true);
    // Auf einer Kante des Kastens liegt immer mindestens eine Koordinate auf
    // dem Rand.
    const onBorder = [
      Math.abs(Math.abs(hit.point.x) - 10) < 1e-4,
      Math.abs(Math.abs(hit.point.y) - 5) < 1e-4,
      Math.abs(Math.abs(hit.point.z) - 3) < 1e-4,
    ].filter(Boolean).length;
    expect(onBorder).toBeGreaterThanOrEqual(2);
  });

  it("holt die Mitte der naechsten ganzen Kante", () => {
    const wanted = { x: -5, y: 5, z: 3 };
    const hit = request("edgeMiddle", project(wanted))!;
    expect(hit.kind).toBe("edgeMiddle");
    expect(nearly(hit.point, { x: 0, y: 5, z: 3 })).toBe(true);
  });

  it("nimmt bei der Flaechenmitte auch dann die Mitte, wenn der Zeiger auf einer Ecke steht", () => {
    const hit = request("face", project({ x: 10, y: 5, z: 3 }))!;
    expect(hit.kind).toBe("face");
    expect(nearly(hit.point, { x: 0, y: 0, z: 3 })).toBe(true);
  });

  it("gibt bei der freien Flaeche genau die getroffene Stelle zurueck", () => {
    const hit = request("surface", project({ x: 10, y: 5, z: 3 }))!;
    expect(hit.kind).toBe("surface");
    expect(hit.point).toEqual(FACE_POINT);
  });

  /**
   * Die Mitte eines Rings liegt in seinem Loch. Ob man sie sieht, sagt darum
   * nichts darueber, ob dieser Ring gemeint war - gefragt wird an der Stelle
   * des Rings, auf die gezeigt wurde.
   */
  it("waehlt den Ring nach der gezeigten Stelle und nicht nach seiner Mitte", () => {
    const disc = soup(new THREE.CylinderGeometry(15, 15, 20, 48));
    // Die Mitte des unteren Randes liegt fuer diese Kamera hinter dem
    // Koerper, ein Stueck seines Randes aber nicht.
    const onLowerRim = { x: 10.6, y: -10, z: 10.6 };
    expect(visible(onLowerRim)).toBe(true);
    expect(visible({ x: 0, y: -10, z: 0 })).toBe(false);
    const hit = snapPointOnMesh({
      positions: disc,
      triangle: 4,
      pointer: project(onLowerRim),
      hitPoint: FACE_POINT,
      target: "edgeMiddle",
      project,
      visible,
    })!;
    expect(hit.point.y).toBeCloseTo(-10, 6);
  });

  /**
   * Eine Ansage ist eine Ansage: Liegt die naechste Ecke hinter dem Koerper,
   * kommt sie trotzdem. Eine Absage waere hier das Falsche - der Benutzer hat
   * "Eckpunkt" gewaehlt und sieht sonst nur, dass nichts passiert.
   */
  it("nimmt auch eine verdeckte Ecke, wenn keine sichtbare da ist", () => {
    const hit = snapPointOnMesh({
      positions: box,
      triangle: 8,
      pointer: middleOfWall,
      hitPoint: FACE_POINT,
      target: "corner",
      project,
      visible: () => false,
    })!;
    expect(hit.kind).toBe("corner");
    expect(meshSnapFeatures(box).corners.some((corner) => nearly(corner, hit.point))).toBe(true);
  });

  it("sagt ab, wenn es am Koerper nicht gibt, was verlangt wird", () => {
    const ball = soup(new THREE.SphereGeometry(8, 32, 16));
    const ask = (target: SnapTarget) => snapPointOnMesh({
      positions: ball,
      triangle: 4,
      pointer: { x: 0, y: 0 },
      hitPoint: FACE_POINT,
      target,
      project,
      visible,
    });
    expect(ask("corner")).toBeNull();
    expect(ask("edge")).toBeNull();
    expect(ask("edgeMiddle")).toBeNull();
    // Eine Flaeche hat sie immer - und sei es nur die eine Facette.
    expect(ask("face")).not.toBeNull();
    expect(ask("surface")).not.toBeNull();
  });
});

/**
 * Ecken und Kanten eines Netzes zu finden kostet Zeit - bei 24 000 Dreiecken
 * gemessen 111 ms. Fuer eine Vorschau, die dem Zeiger folgt, rechnet das
 * Ansichtsfenster sie darum einmal je Koerper und gibt sie wieder herein.
 * Dabei muss genau dasselbe herauskommen wie beim Rechnen in einem Zug.
 */
describe("Vorgerechnete Ecken und Kanten", () => {
  const positions = soup(new THREE.BoxGeometry(20, 10, 6));
  const features = meshSnapFeatures(positions);

  it("ergeben auf jedem Weg dasselbe wie das Rechnen im Zug", () => {
    const targets: SnapTarget[] = ["auto", "corner", "edge", "edgeMiddle", "face", "surface"];
    const pointers = [{ x: 0, y: 0 }, { x: 140, y: 95 }, { x: -60, y: 200 }];
    targets.forEach((target) => {
      pointers.forEach((pointer) => {
        const shared = { positions, triangle: 3, pointer, hitPoint: { x: 1, y: 2, z: 3 }, target, project };
        expect(snapPointOnMesh({ ...shared, features }), `${target} ${pointer.x}/${pointer.y}`)
          .toEqual(snapPointOnMesh(shared));
      });
    });
  });

  /**
   * Dass die vorgerechneten Merkmale wirklich genommen werden - und nicht
   * stillschweigend noch einmal gesucht. Darum muss der Zeiger genau auf
   * einer Ecke stehen: Steht er irgendwo im Leeren, faellt die Rechnung
   * ohnehin auf die Flaechenmitte, und die Pruefung sagte nichts.
   */
  it("werden genommen und nicht noch einmal gesucht", () => {
    const onCorner = project({ x: 10, y: 5, z: 3 });
    const shared = { positions, triangle: 3, pointer: onCorner, hitPoint: { x: 1, y: 2, z: 3 }, target: "auto" as const, project };

    // Mit echten Merkmalen ist es die Ecke, auf die der Zeiger zeigt.
    const found = snapPointOnMesh({ ...shared, features });
    expect(found?.kind).toBe("corner");
    expect(nearly(found!.point, { x: 10, y: 5, z: 3 })).toBe(true);

    // Ein leerer Satz heisst: keine Ecken, keine Kanten. Wuerde die Rechnung
    // ihn uebergehen und selbst suchen, kaeme auch hier die Ecke heraus.
    const given = snapPointOnMesh({ ...shared, features: { corners: [], edges: [], chains: [] } });
    expect(given?.kind).toBe("face");
  });
});
