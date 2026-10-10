import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { deformShapePoint, subdivideTrianglesByHeight, twistBandCount, twistBandPlanes } from "@/lib/shapeMeshDeform";
import type { WorkplaneShape } from "@/types/sketchforge";

/**
 * Laeuft ein Drall rund, oder schnuert er den Koerper ein?
 *
 * Zwischen zwei Hoehenlagen eines Netzes laeuft jede Kante geradlinig. Der
 * Drall muesste sie auf einem Bogen fuehren - also liegt die Kante innerhalb,
 * und der Koerper wird in der Mitte duenner. Gemessen an einem Kasten
 * 20 x 20 x 40 mit 90 Grad Drall, dessen Netz nur die beiden Enden hat: Die
 * Ecke stand bei halber Hoehe auf 10,00 mm statt auf 14,14 mm - 4,14 mm zu
 * schmal, im Bild und in der Druckdatei.
 */

const twistedBox = (twist: number): WorkplaneShape => ({
  id: "b",
  name: "Kasten",
  kind: "box",
  color: "#d41721",
  x: 0,
  z: 0,
  elevation: 0,
  size: 20,
  width: 20,
  depth: 20,
  height: 40,
  rotation: 0,
  extrudeTwist: twist,
} as WorkplaneShape);

/** Der Dreieckshaufen eines Kastens, wie das Bild ihn baut. */
function boxSoup(width: number, height: number, depth: number) {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  const plain = geometry.index ? geometry.toNonIndexed() : geometry;
  const positions = Array.from(plain.getAttribute("position").array as Float32Array);
  geometry.dispose();
  return positions;
}

function deformSoup(shape: WorkplaneShape, soup: readonly number[]) {
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let index = 1; index < soup.length; index += 3) {
    minY = Math.min(minY, soup[index]);
    maxY = Math.max(maxY, soup[index]);
  }
  const bounds = { minX: -shape.width / 2, maxX: shape.width / 2, minY, maxY, minZ: -shape.depth / 2, maxZ: shape.depth / 2 };
  const moved: number[] = [];
  for (let index = 0; index + 2 < soup.length; index += 3) {
    const point = deformShapePoint(shape, bounds, { x: soup[index], y: soup[index + 1], z: soup[index + 2] });
    moved.push(point.x, point.y, point.z);
  }
  return moved;
}

/** Der weiteste Punkt vom Mittelpunkt, in einer schmalen Scheibe bei dieser Hoehe. */
function widestRadiusAt(soup: readonly number[], height: number, tolerance = 0.3) {
  let widest = 0;
  for (let index = 0; index + 2 < soup.length; index += 3) {
    if (Math.abs(soup[index + 1] - height) > tolerance) continue;
    widest = Math.max(widest, Math.hypot(soup[index], soup[index + 2]));
  }
  return widest;
}

describe("Wie viele Baender ein Drall braucht", () => {
  it("keines ohne Drall", () => {
    expect(twistBandCount({ extrudeTwist: 0 })).toBe(1);
    expect(twistBandCount({})).toBe(1);
  });

  /** 7,5 Grad je Band: 90 Grad geben zwoelf, 45 Grad sechs. */
  it("eines je 7,5 Grad", () => {
    expect(twistBandCount({ extrudeTwist: 90 })).toBe(12);
    expect(twistBandCount({ extrudeTwist: -90 })).toBe(12);
    expect(twistBandCount({ extrudeTwist: 45 })).toBe(6);
    expect(twistBandCount({ extrudeTwist: 1 })).toBe(1);
  });

  it("und hoechstens 96, auch bei zwei Umdrehungen", () => {
    expect(twistBandCount({ extrudeTwist: 720 })).toBe(96);
  });

  it("schneidet zwischen den Raendern, nicht auf ihnen", () => {
    expect(twistBandPlanes(0, 40, 4)).toEqual([10, 20, 30]);
    expect(twistBandPlanes(0, 40, 1)).toEqual([]);
    expect(twistBandPlanes(5, 5, 4)).toEqual([]);
  });
});

describe("Das Schneiden selbst", () => {
  it("laesst ein Dreieck, das die Ebene nicht kreuzt, unberuehrt", () => {
    const triangle = [0, 0, 0, 1, 0, 0, 0, 1, 0];
    expect(subdivideTrianglesByHeight(triangle, [5])).toEqual(triangle);
    expect(subdivideTrianglesByHeight(triangle, [])).toEqual(triangle);
  });

  /**
   * Ein Dreieck, das eine Ebene kreuzt, faellt in drei - eines auf der einen
   * Seite, zwei auf der anderen - und seine Flaeche bleibt dieselbe.
   */
  it("schneidet ein kreuzendes Dreieck in drei, ohne Flaeche zu verlieren", () => {
    const triangle = [0, 0, 0, 4, 0, 0, 0, 4, 0];
    const cut = subdivideTrianglesByHeight(triangle, [2]);
    expect(cut.length / 9).toBe(3);
    const area = (soup: readonly number[]) => {
      let total = 0;
      for (let offset = 0; offset + 8 < soup.length; offset += 9) {
        const ax = soup[offset + 3] - soup[offset];
        const ay = soup[offset + 4] - soup[offset + 1];
        const bx = soup[offset + 6] - soup[offset];
        const by = soup[offset + 7] - soup[offset + 1];
        total += Math.abs(ax * by - ay * bx) / 2;
      }
      return total;
    };
    expect(area(cut)).toBeCloseTo(area(triangle), 9);
  });

  /** Und ein Kasten bleibt nach dem Schneiden ein geschlossener Koerper. */
  it("haelt den Koerper geschlossen", () => {
    const soup = boxSoup(20, 40, 20);
    const cut = subdivideTrianglesByHeight(soup, twistBandPlanes(-20, 20, 12));
    const volume = (positions: readonly number[]) => {
      let total = 0;
      for (let offset = 0; offset + 8 < positions.length; offset += 9) {
        const [ax, ay, az, bx, by, bz, cx, cy, cz] = positions.slice(offset, offset + 9);
        total += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
      }
      return total;
    };
    // Dieselbe Umlaufrichtung, derselbe Rauminhalt: 20 x 40 x 20.
    expect(volume(cut)).toBeCloseTo(16000, 6);
    expect(cut.length).toBeGreaterThan(soup.length);
  });
});

describe("Der verdrehte Kasten", () => {
  /**
   * Der Fehler selbst, als Zahl. Ohne Baender hat das Netz bei halber Hoehe
   * **keinen einzigen Punkt** - zwischen den beiden Enden laeuft die Kante
   * geradlinig. Die Verbindung der beiden verdrehten Ecken fuehrt dort auf
   * einen Halbmesser von 10 mm, waehrend die Ecke auf 14,14 gehoert: 4,14 mm
   * zu schmal.
   */
  it("hatte ohne Baender in der Mitte keinen Punkt - und war 4,14 mm zu schmal", () => {
    const shape = twistedBox(90);
    const plain = deformSoup(shape, boxSoup(20, 40, 20));
    expect(widestRadiusAt(plain, 0)).toBe(0);
    // Die gerade Verbindung zwischen unterer und oberer Ecke bei halber Hoehe.
    const corner = deformSoup(shape, [10, -20, 10, 10, 20, 10, 10, -20, 10]);
    const middle = { x: (corner[0] + corner[3]) / 2, z: (corner[2] + corner[5]) / 2 };
    expect(Math.hypot(middle.x, middle.z)).toBeCloseTo(10, 6);
    expect(Math.hypot(10, 10) - Math.hypot(middle.x, middle.z)).toBeCloseTo(4.142, 3);
  });

  /**
   * Mit Baendern trifft dieselbe Stelle die Ecke, wie sie der Drall fuehrt:
   * bei 45 Grad auf der Diagonale, also auf 14,14 mm. Der Rest ist die
   * Sehnenhoehe eines Bandes von 7,5 Grad - unter 0,03 mm.
   */
  it("steht mit Baendern auf seinem wahren Halbmesser", () => {
    const shape = twistedBox(90);
    const bands = twistBandCount(shape);
    const banded = deformSoup(shape, subdivideTrianglesByHeight(boxSoup(20, 40, 20), twistBandPlanes(-20, 20, bands)));
    const widest = widestRadiusAt(banded, 0, 0.9);
    expect(widest).toBeGreaterThan(14.1);
    expect(widest).toBeLessThanOrEqual(Math.hypot(10, 10) + 1e-6);
    // Der verbleibende Fehler ist die Sehnenhoehe eines Bandes.
    expect(Math.hypot(10, 10) - widest).toBeLessThan(0.03);
  });

  /** Ohne Drall wird nichts geschnitten - das Netz bleibt, wie es war. */
  it("bleibt ohne Drall unveraendert", () => {
    const soup = boxSoup(20, 40, 20);
    expect(subdivideTrianglesByHeight(soup, twistBandPlanes(-20, 20, twistBandCount(twistedBox(0))))).toEqual(soup);
  });
});
