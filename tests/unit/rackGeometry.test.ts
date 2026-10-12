import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { gearOutlineCorners, involuteGearMeasures } from "@/lib/gearGeometry";
import {
  createRackGeometry,
  minRackDepth,
  normalizeRackDepth,
  normalizeRackTeeth,
  rackLength,
  rackMeasures,
  rackModule,
  rackOutlineCorners,
  rackPinionLimitTeeth,
  rackToothCentre,
} from "@/lib/rackGeometry";
import type { WorkplaneShape } from "@/types/sketchforge";
import { closestApproach, overlapCount, pointInPolygon, type OutlinePoint } from "./support/outlineOverlap";

/**
 * Die Zahnstange - und die Zusage, um die es geht: Ein Evolventenrad
 * desselben Moduls waelzt auf ihr ab.
 *
 * Diese Zusage steht unten als Rechnung. Und sie ist schaerfer als die bei
 * zwei Zahnraedern: Dort wird **eine** Verdrehung gesucht, bei der sich die
 * Umrisse nicht ueberdecken. Hier wird das Rad ueber eine ganze Zahnteilung
 * abgewaelzt - gedreht und dabei um `Halbmesser x Winkel` weitergeschoben -
 * und an **jeder** Stelle dieses Weges muss es passen. Ein Antrieb, der nur
 * in einer Stellung frei ist, ist kein Antrieb.
 */

const RACK_TEETH = 6;
const PINION_TEETH = 12;

function rackShape(module: number, teeth = RACK_TEETH, overrides: Partial<WorkplaneShape> = {}): WorkplaneShape {
  const length = rackLength(module, teeth);
  return {
    id: "r",
    name: "Zahnstange",
    kind: "rack",
    color: "#6f7f8d",
    x: 0,
    z: 0,
    elevation: 0,
    size: length,
    width: length,
    depth: minRackDepth(module),
    height: 6,
    rotation: 0,
    teeth,
    ...overrides,
  } as WorkplaneShape;
}

function pinionShape(module: number, teeth = PINION_TEETH, pressure = 20): WorkplaneShape {
  const diameter = module * (teeth + 2);
  return {
    id: "p",
    name: "Zahnrad",
    kind: "gear",
    color: "#6f7f8d",
    x: 0,
    z: 0,
    elevation: 0,
    size: diameter,
    width: diameter,
    depth: diameter,
    height: 6,
    rotation: 0,
    teeth,
    gearProfile: "involute",
    gearPressureAngle: pressure,
  } as WorkplaneShape;
}

/** Der Umriss des Rades als Vieleck, gedreht und an seinen Platz geschoben. */
function pinionPolygon(shape: WorkplaneShape, turn: number, centre: OutlinePoint): OutlinePoint[] {
  return gearOutlineCorners(shape.width, shape.depth, shape).map(({ angle, radiusX, radiusZ }) => ({
    x: Math.cos(angle + turn) * radiusX + centre.x,
    z: Math.sin(angle + turn) * radiusZ + centre.z,
  }));
}

describe("Die Masse einer Zahnstange", () => {
  /**
   * Alles folgt aus Modul und Zaehnezahl: Teilung = pi x Modul, Laenge =
   * Zaehne x Teilung, Kopf ein Modul ueber der Waelzlinie, Fuss 1,25 darunter.
   */
  it("folgt den Formeln der Norm", () => {
    const measures = rackMeasures(rackLength(2, 6), minRackDepth(2), { teeth: 6 } as WorkplaneShape);
    expect(measures.module).toBeCloseTo(2, 9);
    expect(measures.pitch).toBeCloseTo(2 * Math.PI, 9);
    expect(measures.length).toBeCloseTo(6 * 2 * Math.PI, 9);
    expect(measures.tipLine - measures.pitchLine).toBeCloseTo(2, 9);
    expect(measures.pitchLine - measures.rootLine).toBeCloseTo(2.5, 9);
    // Ein Modul Ruecken hinter dem Fuss - mehr nicht, aber auch nicht weniger.
    expect(measures.rootLine - measures.backLine).toBeCloseTo(2, 9);
    expect(rackModule(rackLength(2, 6), 6)).toBeCloseTo(2, 9);
  });

  /**
   * Die Flanke ist eine gerade Strecke unter dem Eingriffswinkel - das ist
   * die ganze Zahnstange. Gemessen als Steigung: Wie viel Breite der Zahn je
   * Millimeter Hoehe verliert, ist `tan(Eingriffswinkel)`.
   */
  it("stellt die Flanken auf den Eingriffswinkel", () => {
    [14.5, 20, 25].forEach((pressure) => {
      const measures = rackMeasures(rackLength(2, 6), minRackDepth(2), { teeth: 6, gearPressureAngle: pressure } as WorkplaneShape);
      const slope = (measures.pitchHalf - measures.tipHalf) / (measures.tipLine - measures.pitchLine);
      expect(slope, `${pressure} Grad`).toBeCloseTo(Math.tan(THREE.MathUtils.degToRad(pressure)), 9);
      const rootSlope = (measures.rootHalf - measures.pitchHalf) / (measures.pitchLine - measures.rootLine);
      expect(rootSlope, `${pressure} Grad im Fuss`).toBeCloseTo(Math.tan(THREE.MathUtils.degToRad(pressure)), 9);
    });
  });

  /**
   * Auf der Waelzlinie ist der Zahn die halbe Teilung dick, abzueglich der
   * halben Spielbreite - dieselbe Rechnung wie beim Rad, damit ein Paar mit
   * dem eingestellten Spiel kaemmt und nicht mit dem doppelten.
   */
  it("nimmt dem Zahn die halbe Spielbreite", () => {
    const thickness = (backlash: number) => 2 * rackMeasures(
      rackLength(2, 6),
      minRackDepth(2),
      { teeth: 6, gearBacklash: backlash } as WorkplaneShape,
    ).pitchHalf;
    expect(thickness(0)).toBeCloseTo(Math.PI, 9);
    expect(thickness(0) - thickness(0.4)).toBeCloseTo(0.2, 9);
  });

  /**
   * Der erste Zahn steht eine halbe Teilung vom Ende. Zwei Zahnstangen
   * hintereinander ergeben darum eine durchgehende Zahnreihe: Die Luecke
   * ueber dem Stoss ist genauso breit wie jede andere.
   */
  it("laesst an beiden Enden eine halbe Teilung stehen", () => {
    const measures = rackMeasures(rackLength(2, 6), minRackDepth(2), { teeth: 6 } as WorkplaneShape);
    const half = measures.length / 2;
    expect(rackToothCentre(measures, 0) + half).toBeCloseTo(measures.pitch / 2, 9);
    expect(half - rackToothCentre(measures, measures.teeth - 1)).toBeCloseTo(measures.pitch / 2, 9);
    // Und die Mitten liegen genau eine Teilung auseinander.
    expect(rackToothCentre(measures, 1) - rackToothCentre(measures, 0)).toBeCloseTo(measures.pitch, 9);
  });

  it("haelt Zaehnezahl und Tiefe in ihren Grenzen", () => {
    expect(normalizeRackTeeth(undefined)).toBe(12);
    expect(normalizeRackTeeth(1)).toBe(2);
    expect(normalizeRackTeeth(500)).toBe(120);
    expect(normalizeRackTeeth(7.4)).toBe(7);
    // Zahn und Ruecken brauchen 3,25 Modul; weniger wird aufgerundet.
    expect(minRackDepth(2)).toBeCloseTo(6.5, 9);
    expect(normalizeRackDepth(1, 2)).toBeCloseTo(6.5, 9);
    expect(normalizeRackDepth(20, 2)).toBe(20);
  });

  /**
   * Der Umriss: vier Ecken je Zahn und vier fuer den Rahmen, die Spitzen auf
   * der Vorderkante und der Ruecken auf der Hinterkante.
   */
  it("zeichnet vier Ecken je Zahn, Spitzen vorn und Ruecken hinten", () => {
    const shape = rackShape(2);
    const corners = rackOutlineCorners(shape.width, shape.depth, shape);
    const measures = rackMeasures(shape.width, shape.depth, shape);
    expect(corners.length).toBe(RACK_TEETH * 4 + 4);
    expect(Math.max(...corners.map((corner) => corner.z))).toBeCloseTo(measures.tipLine, 9);
    expect(Math.min(...corners.map((corner) => corner.z))).toBeCloseTo(measures.backLine, 9);
    expect(Math.max(...corners.map((corner) => corner.x))).toBeCloseTo(measures.length / 2, 9);
    expect(Math.min(...corners.map((corner) => corner.x))).toBeCloseTo(-measures.length / 2, 9);
    // Keine Schleife im Umriss: Die Ecken eines Zahnes laufen nach rechts.
    const ascending = corners.slice(0, RACK_TEETH * 4 + 1);
    ascending.forEach((corner, index) => {
      if (index > 0) expect(corner.x).toBeGreaterThanOrEqual(ascending[index - 1].x - 1e-9);
    });
  });

  /**
   * Bei 30 Grad Eingriffswinkel wuerde der Zahnfuss breiter als die halbe
   * Teilung - zwei Nachbarn kreuzten sich, und der Umriss schlaege eine
   * Schleife. Die Grenze haelt das ab.
   */
  it("laesst auch bei weitem Eingriffswinkel keine Schleife entstehen", () => {
    const measures = rackMeasures(rackLength(2, 6), minRackDepth(2), {
      teeth: 6,
      gearPressureAngle: 30,
      gearBacklash: 0,
    } as WorkplaneShape);
    expect(measures.rootHalf).toBeLessThan(measures.pitch / 2);
    expect(measures.tipHalf).toBeGreaterThan(0);
  });

  it("zieht den Umriss auf die Hoehe hoch, im Rahmen seiner Masse", () => {
    const shape = rackShape(2);
    const geometry = createRackGeometry({ ...shape, teeth: shape.teeth });
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    expect(box.max.x - box.min.x).toBeCloseTo(rackLength(2, RACK_TEETH), 6);
    expect(box.max.z - box.min.z).toBeCloseTo(minRackDepth(2), 6);
    // Die Hoehe laeuft von 0 nach oben, wie bei jedem anderen Koerper.
    expect(box.min.y).toBeCloseTo(0, 6);
    expect(box.max.y).toBeCloseTo(6, 6);
    expect(geometry.getAttribute("position").count).toBeGreaterThan(100);
  });
});

/**
 * Das Abwaelzen.
 *
 * Das Rad sitzt mit seinem Teilkreis auf der Waelzlinie. Dreht es sich um
 * `turn`, rollt es ohne zu gleiten - seine Mitte wandert also um
 * `Teilkreishalbmesser x turn` zurueck. Genau diese Bewegung wird abgefahren.
 */
describe("Ein Rad, das auf der Zahnstange abwaelzt", () => {
  const module = 2;

  /**
   * Wie gut Stange und Rad auf einem ganzen Abwaelzweg zusammenpassen.
   *
   * Zuerst wird die Stellung gesucht, in der die Flanken einander am
   * naechsten kommen, ohne sich zu ueberdecken - das ist die Stellung, in der
   * ein Paar eingebaut ist. Von dort wird eine ganze Zahnteilung abgewaelzt
   * und an jeder Stelle gemessen: wie viele Punkte ineinanderstecken, wie
   * tief, und wie weit die Flanken an der Beruehrung auseinanderliegen.
   *
   * Gezaehlt wird zwischen den **ganzen** Vielecken; eingegrenzt wird nur,
   * welche Punkte gefragt werden - was mehr als eineinhalb Teilungen neben
   * dem Rad liegt, kann es nicht treffen.
   */
  function roll(pinionTeeth: number, pressure = 20) {
    const rack = rackShape(module, RACK_TEETH, { gearPressureAngle: pressure });
    const pinion = pinionShape(module, pinionTeeth, pressure);
    const measures = rackMeasures(rack.width, rack.depth, rack);
    const pitchRadius = involuteGearMeasures(pinion.width, pinion).pitchRadius;
    const rackPolygon: OutlinePoint[] = rackOutlineCorners(rack.width, rack.depth, rack);
    const pitchTurn = (Math.PI * 2) / pinionTeeth;

    const fitAt = (start: number, turn: number, drop = 0) => {
      const centre = { x: start - pitchRadius * turn, z: measures.pitchLine + pitchRadius - drop };
      const polygon = pinionPolygon(pinion, turn, centre);
      const band = { from: centre.x - 1.5 * measures.pitch, to: centre.x + 1.5 * measures.pitch };
      const inBand = (point: OutlinePoint) => point.x > band.from && point.x < band.to;
      const inRack = polygon.filter((point) => inBand(point) && pointInPolygon(point, rackPolygon));
      const inPinion = rackPolygon.filter((point) => inBand(point) && pointInPolygon(point, polygon));
      const contact = polygon.filter((point) => point.z < measures.tipLine && inBand(point));
      return {
        overlap: inRack.length + inPinion.length,
        // Wie tief das Eindringen geht - ein Punkt knapp innen ist etwas
        // anderes als ein Zahn, der im anderen steckt.
        deepest: Math.max(
          0,
          ...inRack.map((point) => closestApproach([point], rackPolygon)),
          ...inPinion.map((point) => closestApproach([point], polygon)),
        ),
        gap: contact.length > 0 ? closestApproach(contact, rackPolygon) : Number.POSITIVE_INFINITY,
      };
    };

    const search = (drop = 0) => {
      let best = { overlap: Number.POSITIVE_INFINITY, gap: Number.POSITIVE_INFINITY, deepest: 0, start: 0 };
      const look = (start: number) => {
        const fit = fitAt(start, 0, drop);
        if (fit.overlap > best.overlap) return;
        if (fit.overlap < best.overlap || fit.gap < best.gap) best = { ...fit, start };
      };
      // Erst grob eine ganze Teilung ab, dann fein um die beste Stelle.
      for (let step = 0; step < 48; step += 1) look((measures.pitch * step) / 48);
      const coarse = best.start;
      for (let step = -10; step <= 10; step += 1) look(coarse + (measures.pitch * step) / 480);
      return best;
    };

    const start = search();
    let overlap = 0;
    let deepest = 0;
    let widest = 0;
    for (let step = 0; step < 120; step += 1) {
      const fit = fitAt(start.start, (pitchTurn * step) / 120);
      overlap = Math.max(overlap, fit.overlap);
      deepest = Math.max(deepest, fit.deepest);
      if (Number.isFinite(fit.gap)) widest = Math.max(widest, fit.gap);
    }
    return { overlap, deepest, widest, dropped: search(1) };
  }

  /**
   * Die Zusage: Ein Rad desselben Moduls laeuft eine ganze Zahnteilung ab,
   * ohne zu klemmen und ohne abzuheben - an **jeder** Stelle des Weges, nicht
   * nur in einer Stellung. Ein Antrieb, der nur in einer Stellung frei ist,
   * ist kein Antrieb.
   *
   * "Ohne abzuheben" heisst gemessen 0,0097 mm bei 18 Zaehnen und 0,0101 bei
   * 24, und das ist die Feinheit des Vielecks (zwoelf Punkte je Flanke), kein
   * Spalt. Das Spiel sitzt auf der Gegenflanke.
   */
  it("laeuft eine ganze Zahnteilung ab, ohne zu klemmen und ohne abzuheben", () => {
    [18, 24].forEach((teeth) => {
      const measured = roll(teeth);
      expect(measured.overlap, `${teeth} Zaehne`).toBe(0);
      expect(measured.widest, `${teeth} Zaehne`).toBeLessThan(0.012);
    });
  });

  /**
   * Die Gegenprobe, damit die Zusage etwas wert ist: Einen Millimeter tiefer
   * gestellt gibt es keine Stellung mehr ohne Ueberdeckung.
   */
  it("klemmt, wenn man das Rad einen Millimeter tiefer stellt", () => {
    expect(roll(18).dropped.overlap).toBeGreaterThan(0);
  });

  /**
   * Und die Grenze nach unten, die zu einer Zahnstange gehoert: Unter
   * `2 / sin^2(Eingriffswinkel)` Zaehnen greift ihr Zahnkopf unter den
   * Grundkreis des Rades - dort, wo ein wirklich gewaelztes Rad
   * unterschnitten ist und unseres nicht.
   *
   * Gemessen bei 20 Grad: 0,006 mm Eindringen bei 14 Zaehnen, 0,021 bei 12,
   * 0,099 bei 8. Bis etwa zwei Hundertstel steckt das im Spiel und unter dem,
   * was ein Drucker aufloest; ein Zehntel nicht mehr. Darum nennt das
   * Eigenschaftsfeld die Zaehnezahl, ab der es sauber ist.
   */
  it("greift unter der Grenze in den Zahnfuss, und zwar messbar wenig", () => {
    expect(rackPinionLimitTeeth(20)).toBeCloseTo(17.1, 1);
    expect(rackPinionLimitTeeth(25)).toBeCloseTo(11.2, 1);
    const twelve = roll(12);
    expect(twelve.overlap).toBeGreaterThan(0);
    expect(twelve.deepest).toBeGreaterThan(0.01);
    expect(twelve.deepest).toBeLessThan(0.03);
    const eight = roll(8);
    expect(eight.deepest).toBeGreaterThan(0.05);
  });

  /**
   * Ein weiterer Eingriffswinkel senkt die Grenze: Bei 25 Grad laeuft schon
   * ein Rad mit zwoelf Zaehnen sauber, das bei 20 Grad in den Fuss greift.
   * Das ist der Weg zu einem kleinen Rad, ohne den Zahnfuss auszuschneiden.
   */
  it("laesst bei 25 Grad schon zwoelf Zaehne sauber laufen", () => {
    const measured = roll(12, 25);
    expect(measured.overlap).toBe(0);
    expect(measured.widest).toBeLessThan(0.012);
  });

  /**
   * Und mit dem falschen Modul passt nichts: Dieselbe Stange, ein Rad mit
   * zehn Prozent mehr Modul - in keiner Stellung ohne Ueberdeckung. Ohne
   * diese Probe koennte die Zusage oben auch von einer Form kommen, die
   * einfach genug Luft laesst.
   */
  it("passt nicht zu einem Rad mit anderem Modul", () => {
    const rack = rackShape(module);
    const measures = rackMeasures(rack.width, rack.depth, rack);
    const rackPolygon: OutlinePoint[] = rackOutlineCorners(rack.width, rack.depth, rack);
    const wrong = pinionShape(module * 1.1, 18);
    const wrongRadius = involuteGearMeasures(wrong.width, wrong).pitchRadius;
    let least = Number.POSITIVE_INFINITY;
    for (let step = 0; step < 48; step += 1) {
      const centre = { x: (measures.pitch * step) / 48, z: measures.pitchLine + wrongRadius };
      const band = { from: centre.x - 1.5 * measures.pitch, to: centre.x + 1.5 * measures.pitch };
      least = Math.min(least, overlapCount(rackPolygon, pinionPolygon(wrong, 0, centre), band));
    }
    expect(least).toBeGreaterThan(0);
  });
});
