import { beforeAll, describe, expect, it } from "vitest";
import * as THREE from "three";
import manifoldModule from "manifold-3d";
import { planarMeshFaces } from "@/lib/meshPlanarFaces";

/**
 * Die flachen Flaechen eines Netzes zurueckgewinnen.
 *
 * Ein Netz weiss nicht mehr, dass seine zwoelf Dreiecke sechs Seiten eines
 * Kastens sind. Hier wird gemessen, ob sie wieder zusammenfinden - und ob die
 * Ecken danach genau auf dem Schnitt ihrer Ebenen sitzen, denn davon haengt
 * ab, ob der Kern eine Verrundung darauf annimmt.
 *
 * Gerechnet wird an den Netzen, die der Editor wirklich baut: three.js fuer
 * die Grundkoerper, manifold fuer das Verschneiden und das Zerteilen.
 */

let runtime: Awaited<ReturnType<typeof manifoldModule>>;

beforeAll(async () => {
  runtime = await manifoldModule();
  runtime.setup();
}, 120000);

function soupOf(geometry: THREE.BufferGeometry) {
  const mesh = geometry.index ? geometry.toNonIndexed() : geometry;
  const positions = Array.from(mesh.getAttribute("position").array as ArrayLike<number>);
  const indices = Array.from({ length: positions.length / 3 }, (_, index) => index);
  return { positions, indices };
}

function soupOfManifold(solid: ReturnType<typeof runtime.Manifold.cube>) {
  const mesh = solid.getMesh();
  return { positions: Array.from(mesh.vertProperties), indices: Array.from(mesh.triVerts) };
}

const pointsOf = (loop: readonly number[]) => loop.length / 3;

/** Der groesste Abstand eines Randpunktes von der Ebene seiner Flaeche. */
function worstPlaneDistance(faces: ReturnType<typeof planarMeshFaces>) {
  let worst = 0;
  faces!.faces.forEach((face) => {
    const offset = face.normal[0] * face.outline[0] + face.normal[1] * face.outline[1] + face.normal[2] * face.outline[2];
    [face.outline, ...face.holes].forEach((loop) => {
      for (let index = 0; index + 2 < loop.length; index += 3) {
        const distance = face.normal[0] * loop[index] + face.normal[1] * loop[index + 1] + face.normal[2] * loop[index + 2] - offset;
        worst = Math.max(worst, Math.abs(distance));
      }
    });
  });
  return worst;
}

describe("Die flachen Flaechen eines Netzes", () => {
  it("legt die zwoelf Dreiecke eines Kastens zu sechs Seiten zusammen", () => {
    const { positions, indices } = soupOf(new THREE.BoxGeometry(20, 10, 30));
    const found = planarMeshFaces(positions, indices);
    expect(found).not.toBeNull();
    expect(found!.faces).toHaveLength(6);
    found!.faces.forEach((face) => {
      expect(pointsOf(face.outline)).toBe(4);
      expect(face.holes).toHaveLength(0);
    });
    const directions = found!.faces.map((face) => face.normal.map((value) => Math.round(value)).join(",")).sort();
    expect(directions).toEqual(["-1,0,0", "0,-1,0", "0,0,-1", "0,0,1", "0,1,0", "1,0,0"]);
  });

  /**
   * Der Fall, auf den es ankommt: Eine Seite, die aus vielen kleinen
   * Dreiecken besteht, wird wieder **eine** Flaeche - und ihr Rand traegt nur
   * noch die vier Ecken, nicht jeden Punkt der Vernetzung. Ohne diesen
   * Schritt hat eine Wand im Kern 53 Kanten statt 4, und eine Verrundung
   * muesste 53 Stuecke treffen.
   */
  it("macht aus einer feingeteilten Seite eine Flaeche mit vier Ecken", () => {
    const { positions, indices } = soupOf(new THREE.BoxGeometry(20, 10, 30, 7, 5, 9));
    expect(indices.length / 3).toBeGreaterThan(200);
    const found = planarMeshFaces(positions, indices);
    expect(found).not.toBeNull();
    expect(found!.faces).toHaveLength(6);
    found!.faces.forEach((face) => expect(pointsOf(face.outline)).toBe(4));
  });

  /**
   * Ein Loch bleibt ein Loch: Der Deckel eines gebohrten Kastens ist eine
   * Flaeche mit einem Ring darin, und der Bohrungsmantel bleibt seine
   * Facetten - die duerfen gerade **nicht** zusammengelegt werden, sonst waere
   * aus dem Zylinder eine Ebene geworden.
   */
  it("behaelt den Bohrungsrand als Loch und den Mantel als Facetten", () => {
    const { Manifold } = runtime;
    const bored = Manifold.cube([20, 10, 20], true).subtract(Manifold.cylinder(30, 4, 4, 24, true));
    const { positions, indices } = soupOfManifold(bored);
    const found = planarMeshFaces(positions, indices);
    expect(found).not.toBeNull();
    const withHoles = found!.faces.filter((face) => face.holes.length > 0);
    expect(withHoles).toHaveLength(2);
    withHoles.forEach((face) => {
      expect(face.holes).toHaveLength(1);
      expect(pointsOf(face.holes[0])).toBe(24);
      expect(pointsOf(face.outline)).toBe(4);
    });
    // Vier Waende, Deckel und Boden, und 24 Facetten des Mantels.
    expect(found!.faces).toHaveLength(6 + 24);
  });

  /**
   * Die Zusage, auf die es hinauslaeuft: Jeder Randpunkt liegt **genau** auf
   * der Ebene seiner Flaeche - nicht nur auf die float32 des Netzes, sondern
   * auf float64. Dafuer wird jede Ecke auf den Schnitt ihrer Ebenen gesetzt;
   * dass sie dabei nur ein Zehnmillionstel wandert, zeigt `snapped`.
   */
  it("setzt jede Ecke genau auf die Ebene ihrer Flaeche", () => {
    const { Manifold } = runtime;
    const bored = Manifold.cube([20, 10, 20], true).subtract(Manifold.cylinder(30, 4, 4, 24, true));
    const { positions, indices } = soupOfManifold(bored);
    const found = planarMeshFaces(positions, indices);
    expect(found).not.toBeNull();
    expect(worstPlaneDistance(found)).toBeLessThan(1e-9);
    expect(found!.snapped).toBeGreaterThan(0);
    expect(found!.snapped).toBeLessThan(1e-5);
  });

  /**
   * Und der Fall, der diese Datei verlangt hat: eine schraeg abgeschnittene
   * Haelfte. Im Kern zerfiel ihre Schnittflaeche vorher in mehrere Stuecke und
   * eine Wand trug 53 Kanten statt 4. Hier kommt sie mustergueltig heraus:
   * 102 Flaechen - 96 Facetten des Bohrungsmantels, vier Waende, und die
   * Vorderseite und die Schnittflaeche mit je einem Loch aus 96 Punkten -, und
   * jeder Aussenrand hat genau vier Ecken.
   */
  it("macht aus der Schnittflaeche einer geteilten Haelfte eine Flaeche", () => {
    const { Manifold } = runtime;
    const bored = Manifold.cube([20, 20, 20], true).subtract(Manifold.cylinder(30, 4, 4, 96, true));
    const normal = [0.3, 0, 1];
    const size = Math.hypot(...normal);
    const [half] = bored.splitByPlane(normal.map((value) => value / size) as [number, number, number], 2);
    const { positions, indices } = soupOfManifold(half);
    const found = planarMeshFaces(positions, indices);
    expect(found).not.toBeNull();
    expect(found!.faces).toHaveLength(102);
    found!.faces.forEach((face) => expect(pointsOf(face.outline)).toBe(4));
    const withHoles = found!.faces.filter((face) => face.holes.length > 0);
    expect(withHoles).toHaveLength(2);
    withHoles.forEach((face) => {
      expect(face.holes).toHaveLength(1);
      expect(pointsOf(face.holes[0])).toBe(96);
    });
    // Die Schnittflaeche steht schraeg, die Vorderseite nicht.
    const tilted = withHoles.filter((face) => Math.abs(face.normal[2]) < 0.999);
    expect(tilted).toHaveLength(1);
    expect(worstPlaneDistance(found)).toBeLessThan(1e-9);
    // Die Ecken wandern dabei um ein Zehnmillionstel, nicht weiter.
    expect(found!.snapped).toBeLessThan(1e-6);
  });

  /**
   * Der Weg lehnt ab, wofuer er nicht gemacht ist. Ein gewachsenes Netz - eine
   * Kugel aus lauter verschieden gerichteten Dreiecken - hat fast so viele
   * Bereiche wie Dreiecke; daraus Einzelflaechen zu bauen waere langsamer und
   * nicht besser als der Umweg ueber STL. `null` heisst "nimm den anderen
   * Weg", nicht "Fehler".
   */
  it("lehnt ein gewachsenes Netz ab, statt es in Einzelflaechen zu zerlegen", () => {
    const { positions, indices } = soupOf(new THREE.SphereGeometry(10, 64, 48));
    expect(planarMeshFaces(positions, indices, { maxRegions: 500 })).toBeNull();
  });

  /**
   * Was ein Netz angeht, dessen Dreiecke nicht sauber aneinanderstossen - ein
   * Punkt mitten auf der Kante des Nachbarn, eine T-Stelle -, so zerfaellt es
   * hier in Einzelflaechen und wird nicht falsch: Ohne gemeinsame Kante sind
   * zwei Dreiecke keine Nachbarn, also wachsen sie nicht zusammen, und jeder
   * Bereich traegt seinen eigenen, richtigen Rand. Gemessen am Verschneiden
   * mit three-bvh-csg, das solche Netze liefert (ein gebohrter Kasten hat auf
   * einer Seite 82 Punkte, auf der 28 liegen muessten): 77 Flaechen statt 30 -
   * schlechter als der saubere Fall, aber nichts Erfundenes.
   *
   * Die Umlaufrichtung trennt ebenfalls: Zwei Dreiecke, die in derselben Ebene
   * liegen, aber entgegengesetzt umlaufen, zeigen nach verschiedenen Seiten
   * und gehoeren nicht in eine Flaeche. Verglichen wird darum das Skalarprodukt
   * der Normalen und nicht sein Betrag - sonst waeren Deckel und Boden einer
   * duennen Platte eine Flaeche.
   */
  it("trennt Dreiecke, die entgegengesetzt umlaufen", () => {
    const positions = [
      // Vier Dreiecke in der Ebene y = 0, zwei davon gegen die anderen gedreht.
      0, 0, 0, 10, 0, 0, 5, 0, 10,
      0, 0, 0, -5, 0, 10, -10, 0, 0,
      0, 0, 0, 10, 0, 0, 0, 0, -10,
      0, 0, 0, 0, 0, -10, -10, 0, 0,
    ];
    const indices = Array.from({ length: positions.length / 3 }, (_, index) => index);
    // Vier Dreiecke, drei Bereiche - der Anteil muss hier hochgesetzt werden,
    // sonst griffe die Weiche "das Zusammenlegen bringt nichts".
    const found = planarMeshFaces(positions, indices, { maxRegionShare: 1 });
    expect(found).not.toBeNull();
    expect(found!.faces.length).toBeGreaterThan(1);
    const directions = new Set(found!.faces.map((face) => Math.sign(face.normal[1])));
    expect(directions).toEqual(new Set([-1, 1]));
  });

  it("lehnt ein Netz ohne genug Dreiecke ab", () => {
    expect(planarMeshFaces([0, 0, 0, 1, 0, 0, 0, 1, 0], [0, 1, 2])).toBeNull();
  });
});
