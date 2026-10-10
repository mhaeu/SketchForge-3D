import { describe, expect, it } from "vitest";
import {
  createKnurlGeometry,
  knurlCorners,
  knurlWave,
  knurlSettings,
  knurlTwist,
  maxKnurlChamfer,
  maxKnurlCount,
  maxKnurlDepth,
  normalizeKnurlAngle,
  normalizeKnurlCount,
  normalizeKnurlPattern,
} from "@/lib/knurlGeometry";
import { validateClosedSolidTriangleSoup } from "@/lib/svgImport";
import { roundWaveRadiusAt } from "@/lib/roundWave";

function soup(geometry: ReturnType<typeof createKnurlGeometry>) {
  return Array.from(geometry.getAttribute("position").array as Float32Array);
}

/**
 * Der Rauminhalt aus dem Dreieckshaufen selbst (Divergenzsatz). Bei einem
 * offenen oder nach innen gewendeten Netz kommt er falsch oder negativ
 * heraus - er ist also zugleich die Probe darauf, dass der Koerper zu ist.
 */
function signedVolume(positions: number[]) {
  let volume = 0;
  for (let i = 0; i < positions.length; i += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = positions.slice(i, i + 9);
    volume += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  }
  return volume;
}

function radii(positions: number[]) {
  const values: number[] = [];
  for (let i = 0; i < positions.length; i += 3) values.push(Math.hypot(positions[i], positions[i + 2]));
  return values;
}

describe("Der Querschnitt der Raendelung", () => {
  it("setzt Grate auf den aeusseren Halbmesser und Rillengruende dazwischen", () => {
    const corners = knurlCorners(20, 30, 0.6);
    // Je Rille zwei Ecken: ein Grat und ein Grund.
    expect(corners).toHaveLength(60);
    expect(corners[0]).toEqual({ angle: 0, radius: 10 });
    expect(corners[1].radius).toBeCloseTo(9.4, 9);
    expect(corners[1].angle).toBeCloseTo(Math.PI / 30, 9);
    // Und jeder zweite liegt wieder aussen.
    expect(corners.filter(({ radius }) => radius === 10)).toHaveLength(30);
  });

  /**
   * Die Rillenzahl haengt am Durchmesser, nicht am Wunsch: Enger als 0,8 mm
   * ringsherum zeigt kein Schmelzschichtdrucker, weil die Duese breiter ist
   * als die Rille. Auf 20 mm Umfang passen 78, auf 6 mm nur 23.
   */
  it("laesst keine Rille enger werden, als ein Drucker sie zeigt", () => {
    expect(maxKnurlCount(20)).toBe(78);
    expect(maxKnurlCount(6)).toBe(23);
    expect(normalizeKnurlCount(999, 20)).toBe(78);
    expect(normalizeKnurlCount(999, 6)).toBe(23);
    // Ohne Durchmesser bleibt nur die Obergrenze der Form selbst.
    expect(normalizeKnurlCount(999)).toBe(180);
    expect(normalizeKnurlCount(2)).toBe(6);
  });

  it("haelt Tiefe, Winkel und Muster in ihren Grenzen", () => {
    expect(maxKnurlDepth(20)).toBeCloseTo(10 / 3, 9);
    expect(knurlSettings({ width: 20, height: 10, knurlDepth: 50 }).depth).toBeCloseTo(10 / 3, 9);
    expect(knurlSettings({ width: 20, height: 10, knurlDepth: 0 }).depth).toBe(0.1);
    expect(normalizeKnurlAngle(90)).toBe(60);
    expect(normalizeKnurlAngle(1)).toBe(10);
    expect(normalizeKnurlPattern("diamond")).toBe("diamond");
    expect(normalizeKnurlPattern("quer")).toBe("straight");
    expect(knurlSettings({ width: 20, height: 10 }).pattern).toBe("straight");
  });

  it("dreht eine gekreuzte Rille um Hoehe mal tan(Winkel) durch Halbmesser", () => {
    expect(knurlTwist(20, 10, 45)).toBeCloseTo(1, 9);
    // Steiler heisst mehr Drehung, und der Winkel wird vorher begrenzt.
    expect(knurlTwist(20, 10, 60)).toBeGreaterThan(knurlTwist(20, 10, 30));
    expect(knurlTwist(20, 10, 90)).toBeCloseTo(knurlTwist(20, 10, 60), 9);
  });
});

describe("Der Koerper der Raendelung", () => {
  for (const pattern of ["straight", "diamond"] as const) {
    it(`ist bei "${pattern}" zu, nach aussen gewendet und bleibt in seinen Massen`, () => {
      const positions = soup(createKnurlGeometry({ width: 20, height: 12, knurlPattern: pattern, knurlCount: 24, knurlDepth: 0.8, knurlAngle: 30 }));
      expect(() => validateClosedSolidTriangleSoup(positions, pattern)).not.toThrow();
      const volume = signedVolume(positions);
      // Zwischen dem Zylinder der Rillengruende und dem vollen.
      expect(volume).toBeGreaterThan(Math.PI * 9.2 * 9.2 * 12);
      expect(volume).toBeLessThan(Math.PI * 100 * 12);
      const r = radii(positions).filter((value) => value > 1);
      expect(Math.max(...r)).toBeLessThanOrEqual(10 + 1e-5);
      expect(Math.min(...r)).toBeGreaterThanOrEqual(9.2 - 1e-5);
      const ys = positions.filter((_, index) => index % 3 === 1);
      expect(Math.min(...ys)).toBeCloseTo(0, 6);
      expect(Math.max(...ys)).toBeCloseTo(12, 5);
    });
  }

  /**
   * Gekreuzt nimmt mehr weg als gerade: Dort schneiden zwei Scharen von
   * Rillen uebereinander, und uebrig bleibt, was beide stehen lassen.
   */
  it("nimmt gekreuzt mehr weg als gerade", () => {
    const fields = { width: 20, height: 12, knurlCount: 24, knurlDepth: 0.8, knurlAngle: 30 };
    const straight = signedVolume(soup(createKnurlGeometry({ ...fields, knurlPattern: "straight" })));
    const diamond = signedVolume(soup(createKnurlGeometry({ ...fields, knurlPattern: "diamond" })));
    expect(diamond).toBeLessThan(straight);
  });

  /**
   * Die gerade Raendelung ohne Fase braucht keine Zwischenreihen: zwei Ringe
   * und die Deckel. 24 Rillen heissen 48 Ecken, also 96 Dreiecke am Mantel
   * und 96 an den beiden Deckeln. Wer hier Reihen einzieht, macht das Netz
   * ohne Gewinn groesser.
   */
  it("baut die gerade Raendelung ohne Fase aus zwei Ringen", () => {
    const geometry = createKnurlGeometry({ width: 20, height: 12, knurlPattern: "straight", knurlCount: 24, knurlDepth: 0.8 });
    expect(geometry.getAttribute("position").count / 3).toBe(48 * 2 + 48 * 2);
  });

  /**
   * Und ein langer, steiler Griff mit so vielen Rillen, wie hineingehen,
   * bleibt bezahlbar: Die Spaltenzahl je Flanke faellt, nicht die Rillenzahl.
   */
  it("haelt einen langen, steilen Griff unter 300.000 Dreiecken", () => {
    const geometry = createKnurlGeometry({ width: 20, height: 160, knurlPattern: "diamond", knurlCount: 180, knurlDepth: 0.4, knurlAngle: 60 });
    expect(geometry.getAttribute("position").count / 3).toBeLessThan(300_000);
    expect(signedVolume(soup(geometry))).toBeGreaterThan(0);
  });
});

describe("Die Fase an den Enden", () => {
  for (const pattern of ["straight", "diamond"] as const) {
    it(`bricht bei "${pattern}" beide Enden unter 45 Grad und bleibt zu`, () => {
      const positions = soup(createKnurlGeometry({ width: 20, height: 12, knurlPattern: pattern, knurlCount: 24, knurlDepth: 0.8, knurlChamfer: 1.5 }));
      expect(() => validateClosedSolidTriangleSoup(positions, pattern)).not.toThrow();
      expect(signedVolume(positions)).toBeGreaterThan(0);
      // Nichts reicht ueber den Kegel hinaus: Halbmesser minus Fase, plus dem
      // Abstand zum naeheren Ende.
      for (let i = 0; i < positions.length; i += 3) {
        const y = positions[i + 1];
        expect(Math.hypot(positions[i], positions[i + 2])).toBeLessThanOrEqual(10 - 1.5 + Math.min(y, 12 - y) + 1e-4);
      }
    });
  }

  /**
   * Die beiden Fasen duerfen sich in der Mitte nicht treffen, und breiter als
   * ein Viertel des Durchmessers wird keine - sonst bleibt vom Griff eine
   * Spitze uebrig.
   */
  it("bleibt kurz vor der Mitte und innerhalb eines Viertels des Durchmessers", () => {
    expect(maxKnurlChamfer(20, 4)).toBeCloseTo(1.95, 9);
    expect(knurlSettings({ width: 20, height: 4, knurlChamfer: 9 }).chamfer).toBeCloseTo(1.95, 9);
    expect(knurlSettings({ width: 8, height: 40, knurlChamfer: 9 }).chamfer).toBeCloseTo(2, 9);
    // Ohne Angabe gibt es keine Fase - die Voreinstellung der Form setzt sie.
    expect(knurlSettings({ width: 20, height: 10 }).chamfer).toBe(0);
  });
});

describe("Die runde Raendelung", () => {
  const round = { width: 20, height: 15, knurlPattern: "round" as const, knurlCount: 24, knurlDepth: 0.8 };

  /**
   * Runde Rillen koennen nicht so tief wie V-Kerben: Zwei Boegen je Teilung
   * bauchen am Fuss aus, wenn sie tiefer stehen als etwa die halbe Teilung -
   * die Rille waere dort breiter als ihre Muendung. Bei 24 Rillen auf 20 mm
   * ist die Teilung 2,618 mm, also bleibt die Tiefe unter 1,178.
   */
  it("bleibt flacher als 0,45 der Teilung", () => {
    const pitch = (Math.PI * 20) / 24;
    expect(maxKnurlDepth(20, 24, "round")).toBeCloseTo(pitch * 0.45, 9);
    expect(maxKnurlDepth(20, 24, "straight")).toBeCloseTo(10 / 3, 9);
    // Eine tiefere Angabe gibt nach.
    expect(knurlSettings({ ...round, knurlDepth: 5 }).depth).toBeCloseTo(pitch * 0.45, 9);
  });

  it("ist ein geschlossener, nach aussen gewendeter Koerper", () => {
    const positions = soup(createKnurlGeometry(round));
    expect(() => validateClosedSolidTriangleSoup(positions, "round")).not.toThrow();
    const volume = signedVolume(positions);
    expect(volume).toBeGreaterThan(Math.PI * 9.2 * 9.2 * 15);
    expect(volume).toBeLessThan(Math.PI * 100 * 15);
  });

  it("und bleibt mit Fase in seinen Massen", () => {
    const positions = soup(createKnurlGeometry({ ...round, knurlChamfer: 1.5 }));
    expect(() => validateClosedSolidTriangleSoup(positions, "round chamfered")).not.toThrow();
    for (let i = 0; i < positions.length; i += 3) {
      const y = positions[i + 1];
      expect(Math.hypot(positions[i], positions[i + 2])).toBeLessThanOrEqual(10 - 1.5 + Math.min(y, 15 - y) + 1e-4);
    }
  });

  /**
   * Die Welle hat zwei Beschreibungen - die Ecken des Umrisses und den
   * Halbmesser in einer Richtung - und sie muessen dieselbe Form meinen.
   * Die eine zeichnet das Netz ohne Fase, die andere mit; wichen sie
   * voneinander ab, waere der Griff mit Fase ein anderer als ohne.
   */
  it("beschreibt dieselbe Welle, ob abgefahren oder abgetastet", () => {
    const wave = knurlWave(20, 24, 0.8);
    let worst = 0;
    knurlCorners(20, 24, 0.8, "round").forEach(({ angle, radius }) => {
      worst = Math.max(worst, Math.abs(roundWaveRadiusAt(wave, angle) - radius));
    });
    expect(worst).toBeLessThan(1e-9);
  });

  /** Rund nimmt weniger weg als eine V-Kerbe derselben Tiefe: der Grat ist breiter. */
  it("nimmt weniger weg als eine V-Kerbe derselben Tiefe", () => {
    const straight = signedVolume(soup(createKnurlGeometry({ ...round, knurlPattern: "straight" })));
    expect(signedVolume(soup(createKnurlGeometry(round)))).toBeGreaterThan(straight);
  });
});
