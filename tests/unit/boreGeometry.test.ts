import { describe, expect, it } from "vitest";
import {
  counterboreProfile,
  countersinkConeDepth,
  countersinkProfile,
  createCounterboreGeometry,
  createCountersinkGeometry,
  createTeardropGeometry,
  DEFAULT_COUNTERSINK_ANGLE,
  DEFAULT_TEARDROP_TIP_ANGLE,
  normalizeBoreHeadDepth,
  normalizeBoreHeadDiameter,
  normalizeBoreSides,
  teardropApexDistance,
  teardropDepthFor,
  teardropSection,
} from "@/lib/boreGeometry";

/** Die Ausdehnung eines Netzes je Achse. */
function extent(geometry: { getAttribute: (name: string) => { array: ArrayLike<number>; count: number } }) {
  const position = geometry.getAttribute("position");
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let index = 0; index < position.count; index += 1) {
    for (let axis = 0; axis < 3; axis += 1) {
      const value = position.array[index * 3 + axis];
      min[axis] = Math.min(min[axis], value);
      max[axis] = Math.max(max[axis], value);
    }
  }
  return {
    x: max[0] - min[0],
    y: max[1] - min[1],
    z: max[2] - min[2],
    centreZ: (min[2] + max[2]) / 2,
  };
}

describe("Zylindersenkung", () => {
  it("setzt den weiten Teil oben und den Schaft unten", () => {
    const profile = counterboreProfile(10, 30, 18, 12);
    expect(profile).toEqual([
      { r: 0, y: 0 },
      { r: 5, y: 0 },
      { r: 5, y: 18 },
      { r: 9, y: 18 },
      { r: 9, y: 30 },
      { r: 0, y: 30 },
    ]);
  });

  /**
   * Das Profil beginnt und endet auf der Achse. Sonst waere der Drehkoerper
   * oben und unten offen - ein Abzugskoerper mit Loechern schneidet nicht.
   */
  it("beginnt und endet auf der Achse", () => {
    const profile = counterboreProfile(10, 30, 18, 12);
    expect(profile[0].r).toBe(0);
    expect(profile[profile.length - 1].r).toBe(0);
  });

  it("baut ein Netz, das in seinem Rahmen sitzt", () => {
    const size = extent(createCounterboreGeometry({ width: 10, depth: 10, height: 30, headDiameter: 18, headDepth: 12, sides: 48 }));
    expect(size.x).toBeCloseTo(18, 1);
    expect(size.y).toBeCloseTo(30, 6);
  });

  it("streckt eine abweichende Tiefe", () => {
    const size = extent(createCounterboreGeometry({ width: 10, depth: 20, height: 30, headDiameter: 18, headDepth: 12, sides: 48 }));
    expect(size.z).toBeCloseTo(size.x * 2, 1);
  });
});

describe("Senkung", () => {
  /**
   * Bei 90 Grad steht die Flanke unter 45 Grad zur Achse: Der Kegel ist dann
   * so tief, wie der Kopf breiter ist als der Schaft.
   */
  it("rechnet die Kegeltiefe aus dem Winkel", () => {
    expect(countersinkConeDepth(10, 20, 90)).toBeCloseTo(5, 6);
    // Ein flacherer Kegel wird tiefer, ein steilerer flacher.
    expect(countersinkConeDepth(10, 20, 60)).toBeGreaterThan(5);
    expect(countersinkConeDepth(10, 20, 120)).toBeLessThan(5);
  });

  it("laesst den Kegel oben enden", () => {
    const profile = countersinkProfile(10, 30, 20, 90);
    expect(profile[profile.length - 2]).toEqual({ r: 10, y: 30 });
    expect(profile[2]).toEqual({ r: 5, y: 25 });
  });

  /**
   * Ein Kegel, der tiefer waere als der Koerper, wuerde das Profil umklappen:
   * Der Schaft haette eine negative Hoehe.
   */
  it("klappt nicht um, wenn der Kegel tiefer als der Koerper waere", () => {
    const profile = countersinkProfile(10, 4, 60, 30);
    expect(profile.every((point) => point.y >= 0)).toBe(true);
    expect(profile[2].y).toBeCloseTo(0, 6);
  });

  it("baut ein Netz mit dem Kopf als groesster Breite", () => {
    const size = extent(createCountersinkGeometry({ width: 10, depth: 10, height: 30, headDiameter: 20, headAngle: 90, sides: 64 }));
    expect(size.x).toBeCloseTo(20, 1);
    expect(size.y).toBeCloseTo(30, 6);
  });
});

describe("Tropfenloch", () => {
  it("setzt die Spitze bei 90 Grad auf Wurzel zwei", () => {
    expect(teardropApexDistance(90)).toBeCloseTo(Math.SQRT2, 6);
    // Eine spitzere Spitze steht hoeher, eine stumpfere niedriger.
    expect(teardropApexDistance(60)).toBeGreaterThan(Math.SQRT2);
    expect(teardropApexDistance(120)).toBeLessThan(Math.SQRT2);
  });

  it("nennt die Tiefe aus Breite und Winkel", () => {
    // Loch samt Spitze: 10 nach unten, 14,14 nach oben.
    expect(teardropDepthFor(20, 90)).toBeCloseTo(10 * (1 + Math.SQRT2), 6);
  });

  it("legt jeden Bogenpunkt auf den Kreis und die Spitze darueber", () => {
    const section = teardropSection(90, 32);
    const apex = section[section.length - 1];
    expect(apex.x).toBeCloseTo(0, 6);
    expect(apex.y).toBeCloseTo(Math.SQRT2, 6);
    for (const point of section.slice(0, -1)) {
      expect(Math.hypot(point.x, point.y)).toBeCloseTo(1, 6);
    }
  });

  /**
   * Die Flanken muessen den Kreis beruehren und nicht schneiden: Der
   * Beruehrpunkt liegt dort, wo die Verbindung zur Spitze senkrecht auf dem
   * Radius steht.
   */
  it("setzt die Flanken als Tangenten an den Kreis", () => {
    const section = teardropSection(90, 24);
    const apex = section[section.length - 1];
    for (const touch of [section[0], section[section.length - 2]]) {
      const radius = { x: touch.x, y: touch.y };
      const flank = { x: apex.x - touch.x, y: apex.y - touch.y };
      expect(radius.x * flank.x + radius.y * flank.y).toBeCloseTo(0, 6);
    }
  });

  it("baut ein Netz, dessen Tiefe der gerechneten entspricht", () => {
    const size = extent(createTeardropGeometry({ width: 20, height: 40, tipAngle: 90, sides: 64 }));
    expect(size.x).toBeCloseTo(20, 1);
    expect(size.y).toBeCloseTo(40, 6);
    expect(size.z).toBeCloseTo(teardropDepthFor(20, 90), 1);
  });

  /**
   * Die Kreismitte ist nicht die Mitte der Form - die Spitze steht nur auf
   * einer Seite. Ohne Ausgleich sass der Koerper nicht in seinem Rahmen: Der
   * Auswahlkasten und alles, was mit Breite und Tiefe rechnet, waeren um die
   * halbe Spitzenhoehe daneben.
   */
  it("sitzt in seinem Rahmen und nicht um die Spitze daneben", () => {
    const size = extent(createTeardropGeometry({ width: 20, height: 40, tipAngle: 90, sides: 64 }));
    expect(size.centreZ).toBeCloseTo(0, 4);
  });
});

describe("Die Grenzen der Regler", () => {
  it("haelt die Seitenzahl in ganzen Zahlen und in den Grenzen", () => {
    expect(normalizeBoreSides(12.4)).toBe(12);
    expect(normalizeBoreSides(1)).toBe(3);
    expect(normalizeBoreSides(9999)).toBe(256);
    expect(normalizeBoreSides(undefined)).toBe(64);
  });

  it("haelt den Kopf groesser als den Schaft", () => {
    expect(normalizeBoreHeadDiameter(4, 10)).toBeCloseTo(10.5, 6);
    expect(normalizeBoreHeadDiameter(18, 10)).toBe(18);
    expect(normalizeBoreHeadDiameter(999, 10)).toBe(60);
  });

  it("nimmt einen Kopf von knapp unter der doppelten Breite, wenn keiner gesetzt ist", () => {
    expect(normalizeBoreHeadDiameter(undefined, 10)).toBeCloseTo(18, 6);
  });

  it("laesst die Kopftiefe im Koerper", () => {
    expect(normalizeBoreHeadDepth(12, 30)).toBe(12);
    expect(normalizeBoreHeadDepth(40, 30)).toBeCloseTo(28.5, 6);
    expect(normalizeBoreHeadDepth(0, 30)).toBeCloseTo(0.6, 6);
  });

  it("hat Vorgaben, die der Norm entsprechen", () => {
    expect(DEFAULT_COUNTERSINK_ANGLE).toBe(90);
    expect(DEFAULT_TEARDROP_TIP_ANGLE).toBe(90);
  });
});
