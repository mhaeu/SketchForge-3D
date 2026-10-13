import { describe, expect, it } from "vitest";
import { gearOutlineCorners } from "@/lib/gearGeometry";
import { rackPinionLimitTeeth } from "@/lib/rackGeometry";
import {
  createRingGearGeometry,
  DEFAULT_RING_RIM_MODULES,
  normalizeRingRim,
  RING_GEAR_MIN_TEETH_DIFFERENCE,
  RING_GEAR_OUTER_SIDES,
  ringGearCentreDistance,
  ringGearInnerCorners,
  ringGearMeasures,
  ringGearModule,
  ringGearOuterDiameter,
} from "@/lib/ringGearGeometry";
import type { WorkplaneShape } from "@/types/sketchforge";
import { closestApproach, pointInPolygon, type OutlinePoint } from "./support/outlineOverlap";

/**
 * Das Hohlrad - und die Zusage, um die es geht: Ein Rad desselben Moduls
 * kaemmt darin, beim Achsabstand `Modul x (Zaehne_Hohlrad - Zaehne_Rad) / 2`.
 *
 * Gemessen wird wie bei den Zahnraedern, mit einem Unterschied, der leicht
 * uebersehen wird: Der innere Umriss ist eine geschlossene Kurve, und "innen"
 * heisst bei ihr **im Loch**. Ein Punkt des Rades steckt also genau dann im
 * Material des Ringes, wenn er ausserhalb dieser Kurve liegt. Wer das Zeichen
 * verwechselt, misst genau das Gegenteil.
 */

const MODULE = 2;
const RING_TEETH = 30;

function ringShape(teeth = RING_TEETH, overrides: Partial<WorkplaneShape> = {}): WorkplaneShape {
  const diameter = ringGearOuterDiameter(MODULE, teeth, undefined);
  return {
    id: "h",
    name: "Hohlrad",
    kind: "ringGear",
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
    gearPressureAngle: 20,
    gearBacklash: 0.2,
    ...overrides,
  } as WorkplaneShape;
}

function pinionShape(teeth: number): WorkplaneShape {
  const diameter = MODULE * (teeth + 2);
  return {
    id: "r",
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
    gearPressureAngle: 20,
    gearBacklash: 0.2,
  } as WorkplaneShape;
}

describe("Die Masse eines Hohlrades", () => {
  /**
   * Der Kopfkreis liegt **unter** dem Teilkreis und der Fusskreis darueber -
   * daran erkennt man ein Hohlrad in Zahlen. Dazu der Kranz, in der Vorgabe
   * anderthalb Modul.
   */
  it("legt den Kopfkreis nach innen und den Fusskreis nach aussen", () => {
    const shape = ringShape();
    const measures = ringGearMeasures(shape.width, shape);
    expect(measures.module).toBeCloseTo(MODULE, 9);
    expect(measures.pitchRadius).toBeCloseTo(30, 9);
    expect(measures.tipRadius).toBeCloseTo(28, 9);
    expect(measures.rootRadius).toBeCloseTo(32.5, 9);
    expect(measures.rim).toBeCloseTo(DEFAULT_RING_RIM_MODULES * MODULE, 9);
    expect(measures.outerRadius).toBeCloseTo(35.5, 9);
    expect(measures.baseRadius).toBeCloseTo(30 * Math.cos((20 * Math.PI) / 180), 9);
  });

  it("rechnet Aussendurchmesser und Modul ineinander um", () => {
    expect(ringGearOuterDiameter(2, 30, 3)).toBeCloseTo(71, 9);
    expect(ringGearModule(71, 30, 3)).toBeCloseTo(2, 9);
    // Ohne gesetzten Kranz haengt der selbst am Modul: d = m (z + 2,5 + 3).
    expect(ringGearModule(71, 30, undefined)).toBeCloseTo(2, 9);
    expect(normalizeRingRim(undefined, 2)).toBeCloseTo(3, 9);
    expect(normalizeRingRim(0.1, 2)).toBeCloseTo(0.4, 9);
  });

  /**
   * Der Achsabstand ist eine **Differenz**, nicht eine Summe - das ist der
   * eine Unterschied zum Paar aus zwei Raedern, und der ganze Grund, warum
   * ein Planetengetriebe aufgeht.
   */
  it("nimmt den Achsabstand aus der Differenz der Teilkreise", () => {
    expect(ringGearCentreDistance(2, 30, 18)).toBeCloseTo(12, 9);
    expect(ringGearCentreDistance(2, 30, 12)).toBeCloseTo(18, 9);
    expect(ringGearCentreDistance(1.5, 40, 20)).toBeCloseTo(15, 9);
  });

  /**
   * Der innere Umriss bleibt zwischen Kopf- und Fusskreis, trifft beide, und
   * seine Winkel laufen rundherum - ein Umriss, der zurueckspringt, haette
   * eine Schleife, und daraus wird kein Koerper.
   */
  it("bleibt zwischen Kopf und Fuss und laeuft rundherum", () => {
    const shape = ringShape();
    const measures = ringGearMeasures(shape.width, shape);
    const corners = ringGearInnerCorners(shape.width, shape);
    const radii = corners.map(({ x, z }) => Math.hypot(x, z));
    expect(Math.min(...radii)).toBeCloseTo(measures.tipRadius, 6);
    expect(Math.max(...radii)).toBeCloseTo(measures.rootRadius, 6);
    const angles = corners.map(({ x, z }) => Math.atan2(z, x));
    let turns = 0;
    angles.forEach((angle, index) => {
      if (index === 0) return;
      let step = angle - angles[index - 1];
      while (step > Math.PI) step -= Math.PI * 2;
      while (step < -Math.PI) step += Math.PI * 2;
      expect(step).toBeGreaterThan(-1e-9);
      turns += step;
    });
    // Einmal herum, bis auf das letzte Stueck zurueck zum Anfang.
    expect(turns).toBeLessThan(Math.PI * 2);
    expect(turns).toBeGreaterThan(Math.PI * 1.9);
  });

  /**
   * Die Luecke ist am Teilkreis so breit wie der Zahn eines Rades dick ist,
   * plus die halbe Spielbreite - dann hat das Paar genau das eingestellte
   * Spiel. Gemessen am Umriss: der Bogen zwischen den beiden Flanken, dort wo
   * sie den Teilkreis kreuzen.
   */
  it("macht die Luecke um die halbe Spielbreite weiter", () => {
    const spaceOf = (backlash: number) => {
      const shape = ringShape(RING_TEETH, { gearBacklash: backlash });
      const measures = ringGearMeasures(shape.width, shape);
      const corners = ringGearInnerCorners(shape.width, shape);
      const near = corners
        .slice(0, Math.floor(corners.length / RING_TEETH))
        .map((corner) => ({ angle: Math.atan2(corner.z, corner.x), distance: Math.abs(Math.hypot(corner.x, corner.z) - measures.pitchRadius) }))
        .sort((one, other) => one.distance - other.distance);
      const other = near.find((corner) => Math.abs(corner.angle - near[0].angle) > 0.02)!;
      return Math.abs(near[0].angle - other.angle) * measures.pitchRadius;
    };
    expect(spaceOf(0)).toBeCloseTo((Math.PI * MODULE) / 2, 1);
    expect(spaceOf(0.4) - spaceOf(0)).toBeCloseTo(0.2, 1);
  });

  it("zieht den Ring auf die Hoehe hoch, mit einem Loch darin", () => {
    const shape = ringShape();
    const geometry = createRingGearGeometry({ width: shape.width, height: shape.height, ...shape });
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    const measures = ringGearMeasures(shape.width, shape);
    expect(box.max.x - box.min.x).toBeCloseTo(measures.outerRadius * 2, 1);
    expect(box.min.y).toBeCloseTo(0, 6);
    expect(box.max.y).toBeCloseTo(shape.height, 6);
    /*
     * Und der Rauminhalt ist genau der, den die beiden Umrisse einschliessen:
     * die Flaeche des Aussenvielecks minus die des Lochs, mal die Hoehe. Das
     * prueft Deckel und Waende in einer Zahl - ein Deckel mit falschem
     * Umlaufsinn oder eine fehlende Wand faellt sofort auf, und genau das ist
     * mir hier zweimal passiert.
     */
    // Einmal in eine Zahlenreihe, nicht je Dreieck: `Array.from` auf dem
    // ganzen Feld in der Schleife hat diese Pruefung zwoelf Sekunden gekostet.
    const positions = Array.from(geometry.getAttribute("position").array as ArrayLike<number>);
    let volume = 0;
    for (let index = 0; index + 8 < positions.length; index += 9) {
      const [ax, ay, az, bx, by, bz, cx, cy, cz] = positions.slice(index, index + 9);
      volume += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
    }
    const ringArea = (points: ReadonlyArray<{ x: number; z: number }>) => {
      let area = 0;
      points.forEach((point, index) => {
        const next = points[(index + 1) % points.length];
        area += point.x * next.z - next.x * point.z;
      });
      return Math.abs(area) / 2;
    };
    const outerArea = (RING_GEAR_OUTER_SIDES / 2) * measures.outerRadius ** 2 * Math.sin((Math.PI * 2) / RING_GEAR_OUTER_SIDES);
    const holeArea = ringArea(ringGearInnerCorners(shape.width, shape));
    // Auf drei Stellen: Das Netz fuehrt seine Punkte als einfache
    // Gleitkommazahlen, und das sind bei 6.629 mm^3 zwei Zehntausendstel.
    expect(volume).toBeCloseTo((outerArea - holeArea) * shape.height, 3);
    // Und er liegt, wie er muss, zwischen dem Ring bis zum Fuss- und dem bis
    // zum Kopfkreis: Die Zahnreihe fuellt das Band dazwischen etwa zur Haelfte.
    const band = (radius: number) => Math.PI * (measures.outerRadius ** 2 - radius ** 2) * shape.height;
    expect(volume).toBeGreaterThan(band(measures.rootRadius));
    expect(volume).toBeLessThan(band(measures.tipRadius));
    geometry.dispose();
  });
});

/**
 * Ein Rad, das im Hohlrad kaemmt.
 *
 * Bei Innenverzahnung laufen beide in derselben Richtung, und zwar im
 * Verhaeltnis ihrer Zaehnezahlen: Dreht der Ring um `phi`, dreht das Rad um
 * `phi x z_Ring / z_Rad`. Genau diese Bewegung wird abgefahren - mit dem
 * anderen Vorzeichen steckt das Rad sofort im Ring, und das ist die Probe
 * darauf, dass hier wirklich gewaelzt wird und nicht nur gepasst.
 */
describe("Ein Rad, das im Hohlrad kaemmt", () => {
  /*
   * Die Messung ist dieselbe fuer jede Pruefung, die dasselbe Paar ansieht,
   * und sie kostet: Flankenabstaende ueber Vielecke mit tausend Punkten. Sie
   * wird darum einmal je Paar gerechnet und behalten.
   */
  const measured = new Map<string, ReturnType<typeof measure>>();
  const mesh = (pinionTeeth: number, ringTeeth = RING_TEETH) => {
    const key = `${ringTeeth}/${pinionTeeth}`;
    const found = measured.get(key) ?? measure(pinionTeeth, ringTeeth);
    measured.set(key, found);
    return found;
  };

  function measure(pinionTeeth: number, ringTeeth = RING_TEETH) {
    const ring = ringShape(ringTeeth);
    const pinion = pinionShape(pinionTeeth);
    const measures = ringGearMeasures(ring.width, ring);
    const ringCorners = ringGearInnerCorners(ring.width, ring);
    const pinionCorners = gearOutlineCorners(pinion.width, pinion.depth, pinion);
    const distance = ringGearCentreDistance(MODULE, ringTeeth, pinionTeeth);
    const ratio = ringTeeth / pinionTeeth;
    const pinionPitch = (Math.PI * 2) / pinionTeeth;
    const band = { from: distance - MODULE * 2, to: measures.outerRadius + 1 };

    const fitAt = (phase: number, ringTurn: number, sign = 1, further = 0) => {
      const centre = { x: distance + further, z: 0 };
      const ringPolygon: OutlinePoint[] = ringCorners.map(({ x, z }) => ({
        x: x * Math.cos(ringTurn) - z * Math.sin(ringTurn),
        z: x * Math.sin(ringTurn) + z * Math.cos(ringTurn),
      }));
      const turn = phase + sign * ringTurn * ratio;
      const pinionPolygon: OutlinePoint[] = pinionCorners.map(({ angle, radiusX, radiusZ }) => ({
        x: Math.cos(angle + turn) * radiusX + centre.x,
        z: Math.sin(angle + turn) * radiusZ + centre.z,
      }));
      const inBand = (point: OutlinePoint) => point.x > band.from && point.x < band.to;
      // Hier steckt das Zeichen: ausserhalb der inneren Kurve ist Material.
      const inRing = pinionPolygon.filter((point) => inBand(point) && !pointInPolygon(point, ringPolygon));
      const inPinion = ringPolygon.filter((point) => inBand(point) && pointInPolygon(point, pinionPolygon));
      const contact = pinionPolygon.filter((point) => inBand(point) && Math.abs(point.z) < MODULE * 2);
      return {
        overlap: inRing.length + inPinion.length,
        deepest: Math.max(
          0,
          ...inRing.map((point) => closestApproach([point], ringPolygon)),
          ...inPinion.map((point) => closestApproach([point], pinionPolygon)),
        ),
        gap: contact.length > 0 ? closestApproach(contact, ringPolygon) : Number.POSITIVE_INFINITY,
      };
    };

    const search = (further = 0) => {
      let best = { overlap: Number.POSITIVE_INFINITY, gap: Number.POSITIVE_INFINITY, deepest: 0, phase: 0 };
      const look = (phase: number) => {
        const fit = fitAt(phase, 0, 1, further);
        if (fit.overlap > best.overlap) return;
        if (fit.overlap < best.overlap || fit.gap < best.gap) best = { ...fit, phase };
      };
      for (let step = 0; step < 48; step += 1) look((pinionPitch * step) / 48);
      const coarse = best.phase;
      for (let step = -10; step <= 10; step += 1) look(coarse + (pinionPitch * step) / 480);
      return best;
    };

    const start = search();
    const rolls = new Map<number, { overlap: number; deepest: number; widest: number }>();
    const roll = (sign: number) => {
      const found = rolls.get(sign);
      if (found) return found;
      let overlap = 0;
      let deepest = 0;
      let widest = 0;
      const ringPitch = (Math.PI * 2) / ringTeeth;
      for (let step = 0; step <= 12; step += 1) {
        const fit = fitAt(start.phase, (ringPitch * step) / 12, sign);
        overlap = Math.max(overlap, fit.overlap);
        deepest = Math.max(deepest, fit.deepest);
        if (Number.isFinite(fit.gap)) widest = Math.max(widest, fit.gap);
      }
      const result = { overlap, deepest, widest };
      rolls.set(sign, result);
      return result;
    };
    return { start, roll, closer: search(1), distance };
  }

  /**
   * Die Zusage: Beim Achsabstand aus der Differenz der Teilkreise waelzt das
   * Rad im Ring ab - ueber eine ganze Zahnteilung des Ringes, ohne
   * Ueberdeckung, und die Flanken bleiben beieinander.
   *
   * "Beieinander" heisst 0,06 mm, und das ist die Feinheit der beiden
   * Vielecke, kein Spalt: Beide sind mit zwoelf Punkten je Flanke gezeichnet,
   * und an der Beruehrung liegt der naechste Punkt des einen nicht genau auf
   * der Kurve des anderen.
   */
  it("waelzt eine ganze Zahnteilung ab, ohne zu klemmen", () => {
    const measured = mesh(18);
    expect(measured.distance).toBeCloseTo(12, 9);
    expect(measured.start.overlap).toBe(0);
    expect(measured.start.gap).toBeLessThan(0.06);
    const rolled = measured.roll(1);
    expect(rolled.overlap).toBe(0);
    expect(rolled.widest).toBeLessThan(0.06);
  }, 30000);

  /**
   * Die Gegenprobe zur Drehrichtung: Bei Innenverzahnung laufen Ring und Rad
   * in **derselben** Richtung. Mit dem anderen Vorzeichen steckt das Rad
   * sofort im Ring - also ist die Zusage oben nicht einfach "passt irgendwie".
   */
  it("laeuft nur in derselben Richtung wie der Ring", () => {
    expect(mesh(18).roll(-1).overlap).toBeGreaterThan(20);
  });

  /** Und einen Millimeter weiter aussen gibt es keine Stellung ohne Ueberdeckung. */
  it("klemmt, wenn man das Rad einen Millimeter weiter aussen stellt", () => {
    expect(mesh(18).closer.overlap).toBeGreaterThan(20);
  });

  /**
   * Die Grenze, die zwei Raeder nicht haben: Liegen die Zaehnezahlen zu nah
   * beieinander, stossen die Zahnkoepfe aneinander. Gemessen bei einem Ring
   * mit 30 Zaehnen und einem Rad mit 24 (Unterschied 6): 0,24 mm Eindringen.
   * Darum nennt das Eigenschaftsfeld die Spanne, in der ein Rad passt.
   */
  it("stoesst an, wenn sich die Zaehnezahlen zu wenig unterscheiden", () => {
    expect(RING_GEAR_MIN_TEETH_DIFFERENCE).toBe(10);
    const tight = mesh(24);
    expect(tight.roll(1).deepest).toBeGreaterThan(0.1);
  }, 30000);

  /**
   * Und die Grenze nach unten ist dieselbe wie bei der Zahnstange: Ein Rad
   * mit zu wenigen Zaehnen ist unterschnitten, und der Zahnkopf des Ringes
   * greift in seinen Fuss. Gemessen bei 12 Zaehnen im 30er-Ring: 0,096 mm.
   */
  it("greift in den Fuss eines Rades mit zu wenigen Zaehnen", () => {
    expect(rackPinionLimitTeeth(20)).toBeCloseTo(17.1, 1);
    expect(mesh(12).roll(1).deepest).toBeGreaterThan(0.05);
  });

  /**
   * Und in der Spanne dazwischen laeuft es sauber, auch bei einem groesseren
   * Ring: 40 Zaehne mit einem Rad von 28 (Unterschied 12, und 28 liegt weit
   * ueber der Unterschnittgrenze).
   */
  it("laeuft in der Spanne sauber, auch bei einem groesseren Ring", () => {
    const measured = mesh(28, 40);
    expect(measured.start.overlap).toBe(0);
    const rolled = measured.roll(1);
    expect(rolled.overlap).toBe(0);
    expect(rolled.widest).toBeLessThan(0.06);
  }, 30000);
});
