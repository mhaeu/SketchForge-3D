import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { planarFace } from "@/lib/rotationPivot";
import { planarRegionLoops } from "@/lib/meshPlanarFaces";
import { createRoundedBoxGeometry } from "@/lib/roundedBoxGeometry";
import { regularPolygonFootprintScale } from "@/lib/regularPolygonFootprint";
import { placementWorkplaneCoordinates, placementWorkplaneFromSurface } from "@/lib/placementWorkplane";
import {
  distanceToHolePatternPolygon,
  holePatternCutter,
  holePatternFaceFromLoops,
  holePatternOutline,
  holePatternPlacements,
  holePatternWorldPoints,
  holePatternReach,
  MAX_HOLE_PATTERN_COUNT,
  minHolePatternSpacing,
  normalizeHolePatternSettings,
  pointInHolePatternPolygon,
  type HolePatternFace,
  type HolePatternPoint,
  type HolePatternSettings,
} from "@/lib/holePattern";

/**
 * Ein Lochmuster auf einer Flaeche.
 *
 * Gemessen wird dreierlei: dass die Loecher dort stehen, wo die Teilung sagt;
 * dass ein versetztes Muster **gleichmaessig** ist, also jeder der sechs
 * Nachbarn genau eine Teilung weit weg liegt; und dass kein Loch entsteht, das
 * den Rand oder eine Oeffnung anschneidet.
 */

const rectangle = (width: number, depth: number): HolePatternFace => ({
  outline: [
    { x: -width / 2, z: -depth / 2 },
    { x: width / 2, z: -depth / 2 },
    { x: width / 2, z: depth / 2 },
    { x: -width / 2, z: depth / 2 },
  ],
});

const settings = (overrides: Partial<HolePatternSettings> = {}): HolePatternSettings =>
  normalizeHolePatternSettings({ kind: "round", size: 4, spacing: 6, arrangement: "grid", margin: 2, ...overrides });

/** Der kuerzeste Abstand zwischen zwei Mitten des Musters. */
function nearestSpacing(placements: HolePatternPoint[]) {
  let best = Infinity;
  for (let a = 0; a < placements.length; a += 1) {
    for (let b = a + 1; b < placements.length; b += 1) {
      best = Math.min(best, Math.hypot(placements[a].x - placements[b].x, placements[a].z - placements[b].z));
    }
  }
  return best;
}

/** Wie viele Nachbarn genau eine Teilung weit weg liegen, im Mittel. */
function neighboursAtSpacing(placements: HolePatternPoint[], spacing: number) {
  const counts = placements.map((centre) => placements.filter((other) => {
    const distance = Math.hypot(centre.x - other.x, centre.z - other.z);
    return distance > 1e-6 && Math.abs(distance - spacing) < 1e-6;
  }).length);
  return Math.max(...counts);
}

describe("Die Masse eines Lochmusters", () => {
  it("haelt die Teilung ueber dem Loch, damit ein Steg bleibt", () => {
    // 4 mm Loch, 0,8 mm Steg - weniger zeigt kein FDM-Drucker.
    expect(minHolePatternSpacing({ kind: "round", size: 4 })).toBeCloseTo(4.8, 9);
    expect(settings({ spacing: 1 }).spacing).toBeCloseTo(4.8, 9);
    // Ein Schlitz zaehlt mit seiner Laenge.
    expect(minHolePatternSpacing({ kind: "slot", size: 4, length: 20 })).toBeCloseTo(20.8, 9);
  });

  it("gibt einem Rechteck und einem Schlitz zwei Masse, dem Rest eines", () => {
    expect(settings({ kind: "round", size: 4 }).length).toBeUndefined();
    expect(settings({ kind: "rectangle", size: 4, length: 12 }).length).toBeCloseTo(12, 9);
    // Ein Schlitz ist nie kuerzer als breit.
    expect(settings({ kind: "slot", size: 6, length: 2 }).length).toBeCloseTo(6, 9);
  });

  /**
   * Die Umrisse: ein Sechseck wird wie eine Mutter gemessen, ueber die
   * Flaechen - `size` ist die Schluesselweite und nicht der Eckendurchmesser.
   */
  it("baut die fuenf Umrisse in ihren Massen", () => {
    const round = holePatternOutline({ kind: "round", size: 4 });
    expect(round).toHaveLength(24);
    round.forEach((point) => expect(Math.hypot(point.x, point.z)).toBeCloseTo(2, 9));

    const square = holePatternOutline({ kind: "square", size: 4 });
    expect(square).toHaveLength(4);
    expect(Math.max(...square.map((point) => point.x))).toBeCloseTo(2, 9);

    const hexagon = holePatternOutline({ kind: "hexagon", size: 10 });
    expect(hexagon).toHaveLength(6);
    // Ueber die Flaechen 10 mm, ueber die Ecken 10 / cos(30 Grad) = 11,547.
    const widths = hexagon.map((point) => Math.hypot(point.x, point.z));
    expect(Math.max(...widths) * 2).toBeCloseTo(10 / Math.cos(Math.PI / 6), 6);
    expect(holePatternReach({ kind: "hexagon", size: 10 }) * 2).toBeCloseTo(11.547, 3);

    const slot = holePatternOutline({ kind: "slot", size: 4, length: 12 });
    expect(Math.max(...slot.map((point) => point.x))).toBeCloseTo(6, 9);
    expect(Math.max(...slot.map((point) => point.z))).toBeCloseTo(2, 9);
    // Die Enden sind halbrund: jeder Punkt liegt 2 mm von seiner Mitte.
    slot.forEach((point) => {
      const centre = point.x >= 0 ? 4 : -4;
      expect(Math.hypot(point.x - centre, point.z)).toBeCloseTo(2, 6);
    });
  });
});

describe("Das Raster", () => {
  /**
   * Eine Platte von 50 x 50 mit 4-mm-Loechern, Teilung 6, Rand 2: Von der
   * Mitte aus liegen die Loecher alle 6 mm, und das letzte muss mit seinem
   * Halbmesser und dem Rand hineinpassen - also bis 25 - 2 - 2 = 21 mm von
   * der Mitte. Das sind je Richtung die Spalten -3..3, zusammen 7 x 7 = 49.
   */
  it("setzt die Loecher mittig und zaehlt sie richtig", () => {
    const placements = holePatternPlacements(rectangle(50, 50), settings());
    expect(placements).toHaveLength(49);
    expect(nearestSpacing(placements)).toBeCloseTo(6, 9);
    // Mittig: ein Loch sitzt genau in der Mitte, und das Muster ist symmetrisch.
    expect(placements.some((point) => Math.hypot(point.x, point.z) < 1e-9)).toBe(true);
    const sumX = placements.reduce((total, point) => total + point.x, 0);
    const sumZ = placements.reduce((total, point) => total + point.z, 0);
    expect(sumX).toBeCloseTo(0, 6);
    expect(sumZ).toBeCloseTo(0, 6);
    // Im Raster hat jedes Loch vier Nachbarn auf einer Teilung.
    expect(neighboursAtSpacing(placements, 6)).toBe(4);
  });

  /**
   * Und jedes davon liegt ganz in der Flaeche, mit dem Randabstand: Der
   * aeusserste Punkt eines Loches ist mindestens 2 mm vom Rand weg.
   */
  it("laesst jedem Loch seinen Randabstand", () => {
    const face = rectangle(50, 50);
    const current = settings();
    const outline = holePatternOutline(current);
    holePatternPlacements(face, current).forEach((centre) => {
      outline.forEach((corner) => {
        const point = { x: centre.x + corner.x, z: centre.z + corner.z };
        expect(pointInHolePatternPolygon(point, face.outline)).toBe(true);
        expect(distanceToHolePatternPolygon(point, face.outline)).toBeGreaterThanOrEqual(2 - 1e-9);
      });
    });
  });

  /**
   * Ein groesserer Rand laesst weniger Loecher - und nie mehr. Er wirkt dabei
   * in Stufen, weil eine ganze Spalte zugleich herausfaellt: Die aeusserste
   * Spalte liegt 18 mm von der Mitte, ihr Loch reicht 2 mm weiter, und die
   * Platte endet bei 25 - also faellt sie genau dann heraus, wenn der Rand
   * ueber 5 mm geht. Gemessen: 49 Loecher bis 5 mm Rand, 25 ab 6 mm.
   */
  it("nimmt mit dem Rand Loecher weg, in Stufen", () => {
    const counts = [0, 2, 5, 6, 10].map((margin) => holePatternPlacements(rectangle(50, 50), settings({ margin })).length);
    expect(counts).toEqual([49, 49, 49, 25, 25]);
    expect([...counts].sort((a, b) => b - a)).toEqual(counts);
  });

  it("gibt nichts zurueck, wenn kein Loch hineinpasst", () => {
    expect(holePatternPlacements(rectangle(6, 6), settings({ margin: 2 }))).toHaveLength(0);
  });
});

describe("Die versetzte Anordnung", () => {
  /**
   * Darum geht es bei "versetzt": Jede zweite Zeile ist um eine halbe Teilung
   * geschoben, und die Zeilen liegen enger - `spacing * sqrt(3) / 2`. Erst so
   * liegen **sechs** Nachbarn genau eine Teilung weit weg; mit dem
   * Zeilenabstand des Rasters waeren es vier auf einer Teilung und zwei
   * naeher, und die Stege waeren ungleich dick.
   */
  it("legt jeden der sechs Nachbarn genau eine Teilung weit weg", () => {
    const current = settings({ arrangement: "staggered" });
    const placements = holePatternPlacements(rectangle(60, 60), current);
    expect(placements.length).toBeGreaterThan(40);
    expect(nearestSpacing(placements)).toBeCloseTo(current.spacing, 6);
    expect(neighboursAtSpacing(placements, current.spacing)).toBe(6);
  });

  /**
   * Die Gegenprobe, damit die Zusage etwas wert ist: Mit dem Zeilenabstand
   * des Rasters - also nur geschoben, nicht gepackt - liegt der naechste
   * Nachbar naeher als eine Teilung. Gerechnet: sqrt((6/2)^2 + 6^2) = 6,708
   * ist der diagonale, aber die halbe Teilung macht aus dem Zeilenabstand 6
   * ein Dreieck mit 3 und 6 - und der naechste Nachbar liegt bei 6, nicht
   * darunter. Erst der enge Zeilenabstand macht alle sechs gleich: 6 statt
   * vier bei 6 und zwei bei 6,708.
   */
  it("ist mit dem Zeilenabstand des Rasters ungleichmaessig", () => {
    const spacing = 6;
    const staggeredRows = (spacing * Math.sqrt(3)) / 2;
    expect(staggeredRows).toBeCloseTo(5.196, 3);
    // Mit dem engen Zeilenabstand: der versetzte Nachbar liegt auf 6.
    expect(Math.hypot(spacing / 2, staggeredRows)).toBeCloseTo(spacing, 9);
    // Mit dem Zeilenabstand des Rasters: er liegt auf 6,708 - weiter weg als
    // der Nachbar in der Zeile, also sind die Stege ungleich.
    expect(Math.hypot(spacing / 2, spacing)).toBeCloseTo(6.708, 3);
  });

  it("haelt auch versetzt den Randabstand ein", () => {
    const face = rectangle(60, 60);
    const current = settings({ arrangement: "staggered" });
    const outline = holePatternOutline(current);
    holePatternPlacements(face, current).forEach((centre) => {
      outline.forEach((corner) => {
        const point = { x: centre.x + corner.x, z: centre.z + corner.z };
        expect(distanceToHolePatternPolygon(point, face.outline)).toBeGreaterThanOrEqual(current.margin - 1e-9);
      });
    });
  });
});

describe("Oeffnungen in der Flaeche", () => {
  /**
   * Eine Bohrung in der Flaeche ist kein Platz fuer ein Loch, und auch ihr
   * Rand will seinen Abstand: Eine Bohrung, die ein Lueftungsloch anschneidet,
   * laesst eine Schneide stehen, die beim Drucken abbricht.
   */
  it("laesst Loecher weg, die eine Oeffnung anschneiden", () => {
    const bore: HolePatternPoint[] = Array.from({ length: 48 }, (_, index) => {
      const angle = (index / 48) * Math.PI * 2;
      return { x: Math.cos(angle) * 8, z: Math.sin(angle) * 8 };
    });
    const face: HolePatternFace = { ...rectangle(50, 50), openings: [bore] };
    const current = settings();
    const open = holePatternPlacements(face, current);
    const closed = holePatternPlacements(rectangle(50, 50), current);
    expect(open.length).toBeLessThan(closed.length);
    // Kein Loch steht in der Bohrung, und keines naeher als der Rand.
    const outline = holePatternOutline(current);
    open.forEach((centre) => {
      expect(pointInHolePatternPolygon(centre, bore)).toBe(false);
      outline.forEach((corner) => {
        const point = { x: centre.x + corner.x, z: centre.z + corner.z };
        expect(pointInHolePatternPolygon(point, bore)).toBe(false);
        expect(distanceToHolePatternPolygon(point, bore)).toBeGreaterThanOrEqual(current.margin - 1e-9);
      });
    });
    /*
     * Gemessen: von 49 Loechern bleiben 40. Die neun, die fehlen, sind genau
     * die, deren Mitte naeher als 8 + 2 + 2 = 12 mm an der Bohrungsmitte
     * liegt - die Mitte selbst, die vier auf 6 mm und die vier auf 8,49 mm.
     */
    expect(closed).toHaveLength(49);
    expect(open).toHaveLength(40);
    expect(closed.filter((centre) => Math.hypot(centre.x, centre.z) < 12)).toHaveLength(9);
  });
});

describe("Die Grenze des Musters", () => {
  /**
   * Jedes Loch wird im Editor eine eigene Aussparung. Darum eine Obergrenze,
   * und zwar eine, die auch greift: Eine Platte von 1000 x 1000 mit Teilung 6
   * ergaebe 27556 Loecher.
   */
  it("hoert bei der Obergrenze auf", () => {
    expect(MAX_HOLE_PATTERN_COUNT).toBe(400);
    const placements = holePatternPlacements(rectangle(1000, 1000), settings());
    expect(placements).toHaveLength(MAX_HOLE_PATTERN_COUNT);
  });

  it("nimmt eine eigene Grenze an", () => {
    expect(holePatternPlacements(rectangle(50, 50), settings(), 10)).toHaveLength(10);
  });
});

describe("Ein gedrehtes Muster", () => {
  /**
   * Die Drehung dreht das Muster in der Flaeche, nicht die Flaeche: Die
   * Loecher liegen weiter eine Teilung auseinander, nur die Reihen laufen
   * schraeg. Und sie liegen weiter ganz in der Flaeche - darum muss das
   * Raster weiter gespannt werden als der Rahmen der Flaeche, sonst fehlten
   * die Ecken.
   */
  it("haelt Teilung und Rand auch schraeg ein", () => {
    const face = rectangle(50, 50);
    const current = settings({ angle: 30 });
    const placements = holePatternPlacements(face, current);
    expect(placements.length).toBeGreaterThan(30);
    expect(nearestSpacing(placements)).toBeCloseTo(current.spacing, 6);
    const outline = holePatternOutline(current);
    placements.forEach((centre) => {
      outline.forEach((corner) => {
        const point = { x: centre.x + corner.x, z: centre.z + corner.z };
        expect(distanceToHolePatternPolygon(point, face.outline)).toBeGreaterThanOrEqual(current.margin - 1e-9);
      });
    });
  });
});

/**
 * Und der ganze Weg an einem echten Netz: ein Kasten, wie der Editor ihn
 * baut, die angeklickte Flaeche mit `planarFace` gefunden, ihr Rand mit
 * `planarRegionLoops` gelesen, in die Arbeitsebene gelegt und mit Loechern
 * besetzt. Die Mitten kommen am Ende in Weltkoordinaten zurueck, und die
 * muessen auf der Flaeche liegen.
 */
describe("Von der angeklickten Flaeche zu den Loechern", () => {
  const soup = (geometry: THREE.BufferGeometry) => {
    const mesh = geometry.index ? geometry.toNonIndexed() : geometry;
    return Array.from(mesh.getAttribute("position").array as ArrayLike<number>);
  };

  /** Das erste Dreieck, dessen Normale nach oben zeigt - der Deckel. */
  const topTriangle = (positions: number[]) => {
    for (let triangle = 0; triangle * 9 + 8 < positions.length; triangle += 1) {
      const at = triangle * 9;
      const ux = positions[at + 3] - positions[at];
      const uy = positions[at + 4] - positions[at + 1];
      const uz = positions[at + 5] - positions[at + 2];
      const vx = positions[at + 6] - positions[at];
      const vy = positions[at + 7] - positions[at + 1];
      const vz = positions[at + 8] - positions[at + 2];
      const ny = uz * vx - ux * vz;
      const length = Math.hypot(uy * vz - uz * vy, ny, ux * vy - uy * vx);
      if (length > 0 && ny / length > 0.999) return triangle;
    }
    return -1;
  };

  it("besetzt den Deckel eines Kastens mit einem Raster", () => {
    const geometry = new THREE.BoxGeometry(50, 10, 30);
    geometry.translate(0, 5, 0);
    const positions = soup(geometry);
    const hit = topTriangle(positions);
    expect(hit).toBeGreaterThanOrEqual(0);

    const face = planarFace(positions, hit);
    expect(face).not.toBeNull();
    // Der Deckel: zwei Dreiecke, die Mitte oben, die Normale nach oben.
    expect(face!.triangles).toHaveLength(2);
    expect(face!.centre.y).toBeCloseTo(10, 9);
    expect(face!.normal.y).toBeCloseTo(1, 9);

    const loops = planarRegionLoops(positions, face!.triangles);
    expect(loops).not.toBeNull();
    // Vier Ecken, kein Loch - die Naht der beiden Dreiecke ist weg.
    expect(loops!.outline).toHaveLength(12);
    expect(loops!.holes).toHaveLength(0);

    const workplane = placementWorkplaneFromSurface(face!.centre, face!.normal, { x: 1, y: 0, z: 0 });
    const patternFace = holePatternFaceFromLoops(workplane, loops!);
    expect(patternFace.outline).toHaveLength(4);
    // 50 x 30, also die Ausdehnung in der Ebene.
    const spanX = Math.max(...patternFace.outline.map((point) => point.x)) - Math.min(...patternFace.outline.map((point) => point.x));
    const spanZ = Math.max(...patternFace.outline.map((point) => point.z)) - Math.min(...patternFace.outline.map((point) => point.z));
    expect([spanX, spanZ].sort((a, b) => a - b)).toEqual([30, 50]);

    const current = settings({ spacing: 6, size: 4, margin: 2 });
    const placements = holePatternPlacements(patternFace, current);
    // 50 lang: bis 25 - 2 - 2 = 21 von der Mitte, also -3..3 - sieben Spalten.
    // 30 breit: bis 15 - 2 - 2 = 11, also -1..1 - drei Zeilen.
    expect(placements).toHaveLength(7 * 3);

    // Und zurueck im Raum liegen alle auf dem Deckel.
    holePatternWorldPoints(workplane, placements).forEach((point) => {
      expect(point.y).toBeCloseTo(10, 6);
      expect(Math.abs(point.x)).toBeLessThanOrEqual(21 + 1e-6);
      expect(Math.abs(point.z)).toBeLessThanOrEqual(11 + 1e-6);
    });
  });

  /**
   * Eine Flaeche mit einer Bohrung darin: Ihr Rand hat dann eine Oeffnung,
   * und das Muster laesst sie frei. Gebaut wird der Kasten mit der Bohrung so,
   * wie der Editor ihn nach dem Gruppieren haelt - mit manifold geschnitten.
   */
  it("laesst die Bohrung im Deckel frei", async () => {
    const manifoldModule = (await import("manifold-3d")).default;
    const runtime = await manifoldModule();
    runtime.setup();
    const { Manifold } = runtime;
    // Bohrung laengs z, darum der Kasten so gedreht, dass sie den Deckel trifft.
    const bored = Manifold.cube([50, 30, 10], true).subtract(Manifold.cylinder(30, 6, 6, 48, true));
    const mesh = bored.getMesh();
    const positions: number[] = [];
    for (let offset = 0; offset + 2 < mesh.triVerts.length; offset += 3) {
      for (let corner = 0; corner < 3; corner += 1) {
        const at = mesh.triVerts[offset + corner] * 3;
        // manifold hat z oben, die Szene y - darum vertauscht.
        positions.push(mesh.vertProperties[at], mesh.vertProperties[at + 2] + 5, mesh.vertProperties[at + 1]);
      }
    }
    const hit = topTriangle(positions);
    expect(hit).toBeGreaterThanOrEqual(0);
    const face = planarFace(positions, hit);
    const loops = face ? planarRegionLoops(positions, face.triangles) : null;
    expect(loops).not.toBeNull();
    // Der Deckel: vier Ecken aussen, die Bohrung als Oeffnung aus 48 Punkten.
    expect(loops!.outline).toHaveLength(12);
    expect(loops!.holes).toHaveLength(1);
    expect(loops!.holes[0]).toHaveLength(48 * 3);

    const workplane = placementWorkplaneFromSurface(face!.centre, face!.normal, { x: 1, y: 0, z: 0 });
    const patternFace = holePatternFaceFromLoops(workplane, loops!);
    const current = settings({ spacing: 6, size: 4, margin: 2 });
    const placements = holePatternPlacements(patternFace, current);
    expect(placements.length).toBeGreaterThan(0);
    // Keine Mitte liegt naeher als 6 + 2 + 2 = 10 mm an der Bohrungsmitte.
    const centre = placementWorkplaneCoordinates(workplane, { x: 0, y: 10, z: 0 });
    placements.forEach((placement) => {
      expect(Math.hypot(placement.x - centre.x, placement.z - centre.z)).toBeGreaterThanOrEqual(10 - 1e-6);
    });
  }, 120000);
});

/**
 * Der Geist auf der Flaeche und die Aussparung, die spaeter schneidet, muessen
 * dieselbe Form haben - sonst zeigt die Vorschau etwas anderes als das
 * Ergebnis. Darum wird hier der Umriss gegen die wirkliche Grundflaeche der
 * Aussparung gemessen, fuer alle fuenf Formen.
 */
describe("Die Aussparung zu einer Lochform", () => {
  /** Die Grundflaeche, die der Editor fuer diesen Grundkoerper baut, von oben. */
  function cutterFootprint(cutter: ReturnType<typeof holePatternCutter>) {
    if (cutter.kind === "cylinder") {
      const geometry = new THREE.CylinderGeometry(1, 1, 10, 96);
      geometry.scale(cutter.width / 2, 1, cutter.depth / 2);
      return geometry;
    }
    if (cutter.kind === "box") {
      return new THREE.BoxGeometry(cutter.width, 10, cutter.depth);
    }
    if (cutter.kind === "roundedBox") {
      return createRoundedBoxGeometry({
        width: cutter.width,
        depth: cutter.depth,
        height: 10,
        cornerFillet: cutter.cornerFillet ?? 0,
        topBottomFillet: cutter.topBottomFillet ?? 0,
      });
    }
    // Das Vieleck, wie der Editor es baut: Prisma mit Halbmesser 1, dann in
    // den Rahmen gepasst.
    const geometry = new THREE.CylinderGeometry(1, 1, 10, cutter.sides ?? 6);
    const scale = regularPolygonFootprintScale(cutter.width, cutter.depth, cutter.sides ?? 6);
    geometry.scale(scale.x, 1, scale.z);
    geometry.translate(scale.offsetX, 0, scale.offsetZ);
    return geometry;
  }

  const spanOf = (geometry: THREE.BufferGeometry) => {
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    return { width: box.max.x - box.min.x, depth: box.max.z - box.min.z };
  };

  it.each([
    { kind: "round" as const, size: 5 },
    { kind: "square" as const, size: 5 },
    { kind: "rectangle" as const, size: 5, length: 14 },
    { kind: "hexagon" as const, size: 5 },
    { kind: "slot" as const, size: 5, length: 14 },
  ])("deckt sich mit dem Umriss von $kind", (current) => {
    const cutter = holePatternCutter(current);
    const outline = holePatternOutline(current);
    const expected = {
      width: Math.max(...outline.map((point) => point.x)) - Math.min(...outline.map((point) => point.x)),
      depth: Math.max(...outline.map((point) => point.z)) - Math.min(...outline.map((point) => point.z)),
    };
    const measured = spanOf(cutterFootprint(cutter));
    // Rund und Sechseck: das Netz schreibt sein Vieleck in den Kreis ein, also
    // ist es ein Haar kleiner als der Umriss - nie groesser.
    expect(measured.width).toBeLessThanOrEqual(expected.width + 1e-6);
    expect(measured.depth).toBeLessThanOrEqual(expected.depth + 1e-6);
    expect(expected.width - measured.width).toBeLessThan(0.01);
    expect(expected.depth - measured.depth).toBeLessThan(0.01);
  });

  /**
   * Das Sechseck wird wie eine Mutter gemessen: `size` ist die
   * Schluesselweite. Dafuer braucht seine Grundflaeche eine groessere Tiefe
   * als Breite - sonst waere es kein regelmaessiges Sechseck.
   */
  it("macht aus der Schluesselweite ein regelmaessiges Sechseck", () => {
    const cutter = holePatternCutter({ kind: "hexagon", size: 10 });
    expect(cutter.kind).toBe("polygon");
    expect(cutter.sides).toBe(6);
    expect(cutter.width).toBeCloseTo(10, 9);
    expect(cutter.depth).toBeCloseTo(10 / Math.cos(Math.PI / 6), 9);
    // Regelmaessig heisst: alle sechs Seiten gleich lang.
    const geometry = cutterFootprint(cutter);
    const positions = Array.from(geometry.getAttribute("position").array as ArrayLike<number>);
    const corners = new Map<string, { x: number; z: number }>();
    for (let index = 0; index + 2 < positions.length; index += 3) {
      if (positions[index + 1] < 0) continue;
      // Die Mitte des Deckels gehoert nicht zum Rand.
      if (Math.hypot(positions[index], positions[index + 2]) < 1e-6) continue;
      const key = `${positions[index].toFixed(4)},${positions[index + 2].toFixed(4)}`;
      corners.set(key, { x: positions[index], z: positions[index + 2] });
    }
    const ring = [...corners.values()].sort((a, b) => Math.atan2(a.z, a.x) - Math.atan2(b.z, b.x));
    expect(ring).toHaveLength(6);
    const sides = ring.map((corner, index) => {
      const next = ring[(index + 1) % ring.length];
      return Math.hypot(next.x - corner.x, next.z - corner.z);
    });
    expect(Math.max(...sides) - Math.min(...sides)).toBeLessThan(0.001);
  });

  /**
   * Der Schlitz ist der Rundkasten mit dem halben Breitenradius: Seine Enden
   * sind dann Halbkreise, und zwar genau die, die der Umriss zeichnet.
   */
  it("macht aus dem Schlitz einen Rundkasten mit halbrunden Enden", () => {
    const cutter = holePatternCutter({ kind: "slot", size: 5, length: 14 });
    expect(cutter.kind).toBe("roundedBox");
    expect(cutter.cornerFillet).toBeCloseTo(2.5, 9);
    const geometry = cutterFootprint(cutter);
    const positions = Array.from(geometry.getAttribute("position").array as ArrayLike<number>);
    // Jeder Punkt der Grundflaeche liegt 2,5 mm von einer der beiden
    // Endmitten - oder auf der Gerade dazwischen.
    for (let index = 0; index + 2 < positions.length; index += 3) {
      const x = positions[index];
      const z = positions[index + 2];
      const centre = x >= 0 ? 4.5 : -4.5;
      const onEnd = Math.abs(Math.hypot(x - centre, z) - 2.5) < 0.02;
      const onSide = Math.abs(Math.abs(z) - 2.5) < 0.02 && Math.abs(x) <= 4.5 + 0.02;
      expect(onEnd || onSide, `(${x.toFixed(2)}, ${z.toFixed(2)})`).toBe(true);
    }
  });
});
