import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { closedMeshFaceOrientation, closedMeshVolume, type MeshVolumeFace, type MeshVolumeVertex } from "@/lib/meshVolume";

/** Ein Wuerfel der Kantenlaenge `size`, Ecke auf dem Ursprung, aussen gewickelt. */
function cube(size: number, offset: [number, number, number] = [0, 0, 0]) {
  const [ox, oy, oz] = offset;
  const vertices: MeshVolumeVertex[] = [
    [ox, oy, oz], [ox + size, oy, oz], [ox + size, oy + size, oz], [ox, oy + size, oz],
    [ox, oy, oz + size], [ox + size, oy, oz + size], [ox + size, oy + size, oz + size], [ox, oy + size, oz + size],
  ];
  const faces: MeshVolumeFace[] = [
    [0, 2, 1], [0, 3, 2],
    [4, 5, 6], [4, 6, 7],
    [0, 1, 5], [0, 5, 4],
    [2, 3, 7], [2, 7, 6],
    [1, 2, 6], [1, 6, 5],
    [0, 4, 7], [0, 7, 3],
  ];
  return { vertices, faces };
}

/** Ein three.js-Netz, wie es die Ansicht zeichnet, in Ecken und Dreiecke. */
function fromGeometry(geometry: THREE.BufferGeometry) {
  const indexed = geometry.index ? geometry : geometry.clone();
  const position = indexed.getAttribute("position");
  const vertices: MeshVolumeVertex[] = [];
  for (let index = 0; index < position.count; index += 1) {
    vertices.push([position.getX(index), position.getY(index), position.getZ(index)]);
  }
  const faces: MeshVolumeFace[] = [];
  const order = indexed.index;
  if (order) {
    for (let index = 0; index + 2 < order.count; index += 3) {
      faces.push([order.getX(index), order.getX(index + 1), order.getX(index + 2)]);
    }
  } else {
    for (let index = 0; index + 2 < position.count; index += 3) {
      faces.push([index, index + 1, index + 2]);
    }
  }
  return { vertices, faces };
}

describe("Der Raum eines geschlossenen Netzes", () => {
  it("nennt das Volumen eines Wuerfels", () => {
    const { vertices, faces } = cube(1);
    expect(closedMeshVolume(vertices, faces)).toBeCloseTo(1, 9);
  });

  it("waechst mit der dritten Potenz der Kantenlaenge", () => {
    const { vertices, faces } = cube(10);
    expect(closedMeshVolume(vertices, faces)).toBeCloseTo(1000, 6);
  });

  it("stoert sich nicht daran, wo der Koerper steht", () => {
    const { vertices, faces } = cube(2, [-50, 7, 13]);
    expect(closedMeshVolume(vertices, faces)).toBeCloseTo(8, 6);
  });

  /**
   * Der Fall, fuer den die Umwicklung ueberhaupt gerechnet wird: Nach innen
   * gewickelt gaebe die reine Summe der vorzeichenbehafteten Dreiecke -1.
   */
  it("zaehlt ein nach innen gewickeltes Netz genauso", () => {
    const { vertices, faces } = cube(1);
    const inward = faces.map(([a, b, c]) => [a, c, b] as MeshVolumeFace);
    expect(closedMeshVolume(vertices, inward)).toBeCloseTo(1, 9);
  });

  /**
   * Und der eigentliche Grund: Bei unseren Anzeigenetzen laufen Deckel und
   * Waende nicht immer gleich herum. Hier sind drei Dreiecke umgedreht - das
   * Ergebnis darf sich nicht ruehren.
   */
  it("bringt gemischt gewickelte Dreiecke in Einklang", () => {
    const { vertices, faces } = cube(1);
    const mixed = faces.map((face, index) => (index % 4 === 0 ? [face[0], face[2], face[1]] as MeshVolumeFace : face));
    expect(closedMeshVolume(vertices, mixed)).toBeCloseTo(1, 9);
  });

  it("addiert getrennte Stuecke", () => {
    const first = cube(1);
    const second = cube(2, [10, 0, 0]);
    const vertices = [...first.vertices, ...second.vertices];
    const faces: MeshVolumeFace[] = [
      ...first.faces,
      ...second.faces.map(([a, b, c]) => [a + 8, b + 8, c + 8] as MeshVolumeFace),
    ];
    const orientation = closedMeshFaceOrientation(vertices, faces);
    expect(orientation.pieceVolume.length).toBe(2);
    expect(closedMeshVolume(vertices, faces)).toBeCloseTo(9, 6);
  });

  it("gibt null, wo nichts ist", () => {
    expect(closedMeshVolume([], [])).toBe(0);
  });
});

describe("An den Netzen, die die Ansicht zeichnet", () => {
  /**
   * Nicht an handgebauten Kaesten allein: Eine Kugel aus three.js hat Pole,
   * entartete Dreiecke und geteilte Naehte - genau das, woran eine
   * Volumenrechnung scheitert.
   */
  it("trifft das Volumen einer Kugel", () => {
    const { vertices, faces } = fromGeometry(new THREE.SphereGeometry(10, 96, 64));
    const exact = (4 / 3) * Math.PI * 1000;
    // Ein Vieleck liegt innen; bei dieser Feinheit fehlt weniger als ein Promille.
    expect(closedMeshVolume(vertices, faces)).toBeGreaterThan(exact * 0.998);
    expect(closedMeshVolume(vertices, faces)).toBeLessThan(exact);
  });

  it("trifft das Volumen eines Zylinders", () => {
    const { vertices, faces } = fromGeometry(new THREE.CylinderGeometry(5, 5, 20, 128));
    const exact = Math.PI * 25 * 20;
    expect(closedMeshVolume(vertices, faces)).toBeGreaterThan(exact * 0.999);
    expect(closedMeshVolume(vertices, faces)).toBeLessThan(exact);
  });

  /**
   * Ein Kegel hat eine Spitze, an der viele Dreiecke zusammenlaufen - und in
   * der three.js-Geometrie ist sie in so viele Ecken aufgespalten, wie der
   * Mantel Seiten hat. Ohne das Zusammenfassen nach Lage faellt das Netz dort
   * in Stuecke.
   */
  it("trifft das Volumen eines Kegels", () => {
    const { vertices, faces } = fromGeometry(new THREE.ConeGeometry(6, 15, 128));
    const exact = (Math.PI * 36 * 15) / 3;
    expect(closedMeshVolume(vertices, faces)).toBeGreaterThan(exact * 0.999);
    expect(closedMeshVolume(vertices, faces)).toBeLessThan(exact);
  });

  /**
   * Der Fall, fuer den die Ecken nach ihrer Lage zusammengefasst werden:
   * `BoxGeometry` gibt jeder der sechs Seiten eigene vier Ecken - 24
   * Eckpunkte, von denen keiner geteilt wird. Ohne das Zusammenfassen findet
   * keine Seite ihre Nachbarn, jede gilt als eigenes Stueck, und summiert
   * werden sechs Kegel vom Ursprung aus. Steht der Kasten nicht im Ursprung,
   * kommt dabei ein Vielfaches heraus.
   */
  it("findet die Seiten eines Kastens zusammen, der seine Ecken nicht teilt", () => {
    const geometry = new THREE.BoxGeometry(4, 6, 8);
    geometry.translate(100, 50, -70);
    const { vertices, faces } = fromGeometry(geometry);
    expect(vertices.length).toBe(24);
    const orientation = closedMeshFaceOrientation(vertices, faces);
    expect(orientation.pieceVolume.length).toBe(1);
    expect(closedMeshVolume(vertices, faces)).toBeCloseTo(4 * 6 * 8, 6);
  });

  /** Und derselbe Kasten mit verdrehten Seiten - beides zusammen. */
  it("bringt ihn auch in Einklang, wenn die Seiten verschieden gewickelt sind", () => {
    const geometry = new THREE.BoxGeometry(4, 6, 8);
    geometry.translate(100, 50, -70);
    const { vertices, faces } = fromGeometry(geometry);
    const mixed = faces.map((face, index) => (index % 3 === 0 ? [face[0], face[2], face[1]] as MeshVolumeFace : face));
    expect(closedMeshVolume(vertices, mixed)).toBeCloseTo(4 * 6 * 8, 6);
  });

  it("haelt eine Kugel fuer ein Stueck", () => {
    const { vertices, faces } = fromGeometry(new THREE.SphereGeometry(10, 32, 16));
    expect(closedMeshFaceOrientation(vertices, faces).pieceVolume.length).toBe(1);
  });
});
