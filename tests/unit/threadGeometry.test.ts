import { describe, expect, it } from "vitest";
import { makeShapeFromAsset, toolbarShapeAssets } from "@/lib/shapeCatalog";
import { canonicalizeShape } from "@/lib/workplaneShapes";
import {
  createThreadGeometry,
  defaultThreadPitch,
  normalizeThreadPitch,
  normalizeThreadQuality,
  threadNaturalFootprint,
  threadSettings,
  threadSizeFor,
  defaultThreadChamfer,
  defaultThreadHeadHeight,
  pitchToThreadsPerInch,
  threadUsesInchPitch,
  threadsPerInchToPitch,
  threadHeadDiameter,
  threadHeadChamferLimits,
  normalizeThreadHeadChamfer,
  threadDriveProfile,
  threadDriveSpec,
  threadSizeSpec,
  normalizeThreadDrive,
} from "@/lib/threadGeometry";
import type { ThreadDrive, ThreadRole } from "@/types/sketchforge";

type Position = {
  count: number;
  getX: (index: number) => number;
  getY: (index: number) => number;
  getZ: (index: number) => number;
};

/**
 * Jede Kante eines geschlossenen Koerpers gehoert genau zwei Dreiecken. Steht
 * irgendwo eine Eins, hat der Koerper ein Loch; steht dort eine Drei, liegen
 * Flaechen doppelt. Beides faellt beim Drucken auf, hier vorher.
 */
function edgeUseCounts(position: Position) {
  const uses = new Map<string, number>();
  const keyForPoint = (index: number) => [position.getX(index), position.getY(index), position.getZ(index)]
    .map((value) => value.toFixed(5))
    .join(",");
  for (let index = 0; index + 2 < position.count; index += 3) {
    const triangle = [keyForPoint(index), keyForPoint(index + 1), keyForPoint(index + 2)];
    if (triangle[0] === triangle[1] || triangle[1] === triangle[2] || triangle[0] === triangle[2]) continue;
    for (let edge = 0; edge < 3; edge += 1) {
      const a = triangle[edge];
      const b = triangle[(edge + 1) % 3];
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      uses.set(key, (uses.get(key) ?? 0) + 1);
    }
  }
  return uses;
}

/** Positiv heisst: die Dreiecke schauen nach aussen. */
function signedVolume(position: Position) {
  let total = 0;
  for (let index = 0; index + 2 < position.count; index += 3) {
    const ax = position.getX(index);
    const ay = position.getY(index);
    const az = position.getZ(index);
    const bx = position.getX(index + 1);
    const by = position.getY(index + 1);
    const bz = position.getZ(index + 1);
    const cx = position.getX(index + 2);
    const cy = position.getY(index + 2);
    const cz = position.getZ(index + 2);
    total += (ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx)) / 6;
  }
  return total;
}

function geometryFor(role: ThreadRole, height: number, overrides: Record<string, unknown> = {}) {
  const settings = threadSettings({ threadRole: role, threadDiameter: 6, threadPitch: 1, ...overrides });
  const footprint = threadNaturalFootprint(settings);
  return {
    settings,
    footprint,
    geometry: createThreadGeometry({
      width: footprint.width,
      depth: footprint.depth,
      height,
      threadRole: role,
      threadDiameter: 6,
      threadPitch: 1,
      ...overrides,
    }),
  };
}

describe("thread geometry", () => {
  it.each<[ThreadRole, number]>([["rod", 20], ["screw", 24], ["nut", 5], ["bore", 14]])(
    "creates a closed %s that fills the requested bounds",
    (role, height) => {
      const { geometry, footprint } = geometryFor(role, height);
      const position = geometry.getAttribute("position") as unknown as Position;

      expect(position.count).toBeGreaterThan(1000);
      expect([...edgeUseCounts(position).values()].every((uses) => uses === 2)).toBe(true);
      expect(signedVolume(position)).toBeGreaterThan(0);
      expect(geometry.boundingBox?.min.y).toBeCloseTo(0, 5);
      expect(geometry.boundingBox?.max.y).toBeCloseTo(height, 5);
      expect((geometry.boundingBox?.max.x ?? 0) - (geometry.boundingBox?.min.x ?? 0)).toBeCloseTo(footprint.width, 4);
      expect((geometry.boundingBox?.max.z ?? 0) - (geometry.boundingBox?.min.z ?? 0)).toBeCloseTo(footprint.depth, 4);
    },
  );

  it("stays closed on a left-hand thread and on a coarse pitch", () => {
    for (const overrides of [{ threadHand: "left" }, { threadPitch: 4 }, { threadPitch: 0.35 }]) {
      const { geometry } = geometryFor("rod", 12, overrides);
      const position = geometry.getAttribute("position") as unknown as Position;
      expect([...edgeUseCounts(position).values()].every((uses) => uses === 2)).toBe(true);
      expect(signedVolume(position)).toBeGreaterThan(0);
    }
  });

  it("stays closed for every screw head", () => {
    for (const threadHead of ["cylinder", "countersunk", "hex"]) {
      const { geometry } = geometryFor("screw", 24, { threadHead });
      const position = geometry.getAttribute("position") as unknown as Position;
      expect([...edgeUseCounts(position).values()].every((uses) => uses === 2)).toBe(true);
      expect(signedVolume(position)).toBeGreaterThan(0);
    }
  });

  it("cuts the thread between the minor and the major diameter", () => {
    const { geometry } = geometryFor("rod", 20);
    const position = geometry.getAttribute("position") as unknown as Position;
    let smallest = Number.POSITIVE_INFINITY;
    let largest = 0;
    for (let index = 0; index < position.count; index += 1) {
      const y = position.getY(index);
      // Die Deckel ziehen den Radius bis zur Mitte, deshalb nur die Mantelflaeche.
      if (y < 4 || y > 16) continue;
      const radius = Math.hypot(position.getX(index), position.getZ(index));
      if (radius < smallest) smallest = radius;
      if (radius > largest) largest = radius;
    }
    // M6 mit einem Millimeter Steigung: Aussenradius 3, Kernradius rund 2,46.
    expect(largest).toBeCloseTo(3, 3);
    expect(smallest).toBeCloseTo(3 - 0.5413, 3);
  });

  it("hollows the nut out and leaves the bore wider than the bolt", () => {
    const nut = geometryFor("nut", 5);
    const nutVolume = signedVolume(nut.geometry.getAttribute("position") as unknown as Position);
    const acrossFlats = nut.footprint.depth;
    const solidHexVolume = ((Math.sqrt(3) / 2) * acrossFlats * acrossFlats) * 5;
    expect(nutVolume).toBeGreaterThan(solidHexVolume * 0.4);
    expect(nutVolume).toBeLessThan(solidHexVolume * 0.85);

    const bore = geometryFor("bore", 14, { threadClearance: 0.4, threadChamfer: 0 });
    const rod = geometryFor("rod", 14, { threadChamfer: 0 });
    expect(bore.footprint.width).toBeCloseTo(rod.footprint.width + 0.4, 6);
    // Die Fase weitet das Schneidwerkzeug am Mund zur Ansenkung auf.
    const sunk = geometryFor("bore", 14, { threadClearance: 0.4, threadChamfer: 0.8 });
    expect(sunk.footprint.width).toBeCloseTo(bore.footprint.width + 1.6, 6);
  });

  it("keeps the standard sizes reachable and the free values in range", () => {
    expect(threadSizeFor(6, 1)?.id).toBe("M6");
    expect(threadSizeFor(6, 1.25)).toBeNull();
    expect(defaultThreadPitch(8)).toBe(1.25);
    // Eine Steigung groesser als der Durchmesser haette keinen Kern mehr uebrig.
    expect(normalizeThreadPitch(40, 6)).toBe(4.5);
    expect(normalizeThreadQuality(50)).toBe(48);
    expect(normalizeThreadQuality(1000)).toBe(96);
  });

  it("turns a pull on the handles into a diameter, never into an oval", () => {
    const asset = toolbarShapeAssets.find((entry) => entry.kind === "thread");
    const shape = makeShapeFromAsset(asset!, { x: 0, z: 0 });
    expect(shape.threadDiameter).toBe(6);
    expect(shape.width).toBeCloseTo(6, 6);

    // So schreibt der Anfasser im Arbeitsbereich: direkt in Breite und Tiefe.
    const dragged = canonicalizeShape({ ...shape, width: 12, depth: 9 });

    expect(dragged.width).toBeCloseTo(dragged.depth as number, 6);
    expect(dragged.threadDiameter).toBeCloseTo(10.5, 6);
    expect(dragged.width).toBeCloseTo(10.5, 6);
    // Die Steigung waechst mit, sonst haette der Koerper kein stimmiges Profil.
    expect(dragged.threadPitch).toBeCloseTo(1.75, 6);

    // Ohne Zug bleibt alles, wie es ist - sonst liefe jedes Speichern davon.
    const again = canonicalizeShape(dragged);
    expect(again.threadDiameter).toBeCloseTo(dragged.threadDiameter as number, 9);
    expect(again.width).toBeCloseTo(dragged.width as number, 9);
  });

  it("keeps the head height on its own and lets the countersunk crown follow it", () => {
    const screw = threadSettings({ threadRole: "screw", threadHead: "cylinder", threadDiameter: 6, threadPitch: 1 });
    expect(screw.headHeight).toBeCloseTo(defaultThreadHeadHeight(screw), 6);
    expect(screw.headHeight).toBeCloseTo(6, 6);

    const flatter = threadSettings({ threadRole: "screw", threadHead: "cylinder", threadDiameter: 6, threadPitch: 1, threadHeadHeight: 3 });
    expect(flatter.headHeight).toBeCloseTo(3, 6);
    // Der Zylinderkopf behaelt seinen Durchmesser, der Senkkopf nicht.
    expect(threadHeadDiameter(flatter)).toBeCloseTo(threadHeadDiameter(screw), 6);

    const sunk = threadSettings({ threadRole: "screw", threadHead: "countersunk", threadDiameter: 6, threadPitch: 1 });
    expect(sunk.headHeight).toBeCloseTo(3, 6);
    expect(threadHeadDiameter(sunk)).toBeCloseTo(12, 6);
    const sunkFlat = threadSettings({ threadRole: "screw", threadHead: "countersunk", threadDiameter: 6, threadPitch: 1, threadHeadHeight: 2 });
    expect(threadHeadDiameter(sunkFlat)).toBeCloseTo(10, 6);
    expect(threadNaturalFootprint(sunkFlat).width).toBeCloseTo(10, 6);

    // Der Kopf darf die Gewindelaenge nicht auffressen.
    const tall = createThreadGeometry({
      width: 10,
      depth: 10,
      height: 24,
      threadRole: "screw",
      threadDiameter: 6,
      threadPitch: 1,
      threadHeadHeight: 9,
    });
    expect(tall.boundingBox?.max.y).toBeCloseTo(24, 5);
    expect(tall.boundingBox?.min.y).toBeCloseTo(0, 5);
  });
  it("breaks the sharp edge at the ends and stays closed doing it", () => {
    const plain = geometryFor("rod", 16, { threadChamfer: 0 });
    const plainPosition = plain.geometry.getAttribute("position") as unknown as Position;
    expect([...edgeUseCounts(plainPosition).values()].every((uses) => uses === 2)).toBe(true);

    const chamfer = defaultThreadChamfer(1);
    const broken = geometryFor("rod", 16, { threadChamfer: chamfer });
    const position = broken.geometry.getAttribute("position") as unknown as Position;
    expect([...edgeUseCounts(position).values()].every((uses) => uses === 2)).toBe(true);
    expect(signedVolume(position)).toBeGreaterThan(0);
    expect(signedVolume(position)).toBeLessThan(signedVolume(plainPosition));

    // Bei einem freien Ende (hier: Stange) ist die Vorgabe eine volle
    // Steigung, damit die Kuppe spuerbar unter den Kerndurchmesser hinauslaeuft
    // statt nur die Kante zu brechen - die Stirnflaeche endet entsprechend bei
    // Aussenradius minus dieser Fase, nicht erst beim Kern.
    let widest = 0;
    for (let index = 0; index < position.count; index += 1) {
      if (position.getY(index) > 0.001) continue;
      widest = Math.max(widest, Math.hypot(position.getX(index), position.getZ(index)));
    }
    expect(widest).toBeCloseTo(3 - chamfer, 3);

    // Auf halber Hoehe darf die Fase nichts weggenommen haben.
    let middle = 0;
    for (let index = 0; index < position.count; index += 1) {
      const y = position.getY(index);
      if (y < 7 || y > 9) continue;
      middle = Math.max(middle, Math.hypot(position.getX(index), position.getZ(index)));
    }
    expect(middle).toBeCloseTo(3, 3);
  });

  /*
   * Fraterculas Meldung aus dem Forum: das freie Gewindeende einer Schraube
   * lief bis dahin als scharfe Messerkante aus - schlecht zum Einfaedeln ins
   * Gegengewinde und schlecht druckbar. Ursache war nicht die Mechanik (die
   * Fase hat immer schon einen sauberen 45-Grad-Kegel gezogen), sondern die
   * Vorgabe: eine halbe Steigung ist auf einem M8-Gewinde weniger als ein
   * Millimeter und damit kaum wahrnehmbar. Ein Innengewinde (Mutter,
   * Gewindeloch) entgratet dagegen nur eine Muendung und soll dabei nicht
   * unnoetig vom Gewinde selbst opfern - dort bleibt die alte, flachere
   * Vorgabe richtig.
   */
  it("gives a free thread end a full pitch of lead-in instead of a knife edge", () => {
    expect(defaultThreadChamfer(1.25, "v", "screw")).toBeCloseTo(1.25, 6);
    expect(defaultThreadChamfer(1.25, "v", "rod")).toBeCloseTo(1.25, 6);
    // Innengewinde: unveraendert an die Gewindetiefe gekoppelt.
    expect(defaultThreadChamfer(1.25, "v", "nut")).toBeCloseTo(1.25 * 0.5413, 3);
    expect(defaultThreadChamfer(1.25, "v", "bore")).toBeCloseTo(1.25 * 0.5413, 3);

    // Ohne eigene Angabe zieht eine frisch angelegte Schraube diese Vorgabe:
    // die Spitze muss spuerbar unter den Kerndurchmesser hinauslaufen, nicht
    // nur bis auf ihn.
    const tip = geometryFor("screw", 30, { threadHead: "hex", threadDiameter: 8, threadPitch: 1.25 });
    const major = tip.settings.diameter / 2;
    const minor = major - tip.settings.pitch * 0.5413;
    const position = tip.geometry.getAttribute("position") as unknown as Position;
    let tipRadius = Infinity;
    for (let index = 0; index < position.count; index += 1) {
      if (position.getY(index) < 29.999) continue;
      tipRadius = Math.min(tipRadius, Math.hypot(position.getX(index), position.getZ(index)));
    }
    expect(tipRadius).toBeLessThan(minor - 0.1);
  });

  /*
   * Fraterculas Meldung aus dem Forum: am Schraubenkopf sind alle Kanten
   * scharf, und die Kantenbearbeitung laeuft an der tessellierten Wendel in
   * die Zeitueberschreitung. Die Kopffase bricht die Kante dort, wo sie
   * hingehoert - im Erzeuger.
   */
  it("bricht die Kante des Schraubenkopfs und bleibt dabei dicht", () => {
    for (const threadHead of ["cylinder", "hex"]) {
      const scharf = geometryFor("screw", 24, { threadHead });
      // Der Hoechstwert haengt vom Kopf ab - beim Sechskant frisst der Kegel
      // an den Ecken mehr Hoehe. Also von der Grenze her messen, nicht raten.
      const grenze = threadHeadChamferLimits(scharf.settings).max;
      expect(grenze).toBeGreaterThan(0.3);
      const fase = grenze * 0.8;
      const gebrochen = geometryFor("screw", 24, { threadHead, threadHeadChamfer: fase });
      const kante = gebrochen.geometry.getAttribute("position") as unknown as Position;

      expect(gebrochen.settings.headChamfer).toBeCloseTo(fase, 6);
      expect([...edgeUseCounts(kante).values()].every((uses) => uses === 2)).toBe(true);
      // Eine Fase nimmt Material weg, sie fuegt keines hinzu.
      const scharfesVolumen = signedVolume(scharf.geometry.getAttribute("position") as unknown as Position);
      const gebrochenesVolumen = signedVolume(kante);
      expect(gebrochenesVolumen).toBeGreaterThan(0);
      expect(gebrochenesVolumen).toBeLessThan(scharfesVolumen);
      // Der Koerper behaelt seinen Platzbedarf: die Fase sitzt innen.
      expect(gebrochen.geometry.boundingBox?.min.y).toBeCloseTo(0, 5);
      expect(gebrochen.geometry.boundingBox?.max.y).toBeCloseTo(24, 5);
      expect(gebrochen.footprint.width).toBeCloseTo(scharf.footprint.width, 6);
    }
  });

  /*
   * Beide Kanten, nicht nur die untere. Der Koerper steht auf seinem Kopf -
   * die freie Flaeche liegt also auf der Ebene, und wer nur dort brechen
   * wuerde, haette einen Regler gebaut, dem man nichts ansieht.
   */
  it("zieht beide Enden des Kopfes genau um die Fase ein", () => {
    const fase = 0.8;
    const { geometry, settings } = geometryFor("screw", 24, { threadHead: "cylinder", threadHeadChamfer: fase });
    const position = geometry.getAttribute("position") as unknown as Position;
    const kopfhoehe = settings.headHeight;
    let amFreienEnde = 0;
    let amSchaftende = 0;
    for (let index = 0; index < position.count; index += 1) {
      const y = position.getY(index);
      const radius = Math.hypot(position.getX(index), position.getZ(index));
      if (Math.abs(y) < 1e-6) amFreienEnde = Math.max(amFreienEnde, radius);
      // Am Kopfende zaehlt nur der Kopf selbst, nicht der Schaft darueber.
      if (Math.abs(y - kopfhoehe) < 1e-6) amSchaftende = Math.max(amSchaftende, radius);
    }
    const eingezogen = threadHeadDiameter(settings) / 2 - fase;
    expect(amFreienEnde).toBeCloseTo(eingezogen, 4);
    expect(amSchaftende).toBeCloseTo(eingezogen, 4);
  });

  /*
   * Dasselbe an der Mutter: sie *ist* ihr Kopf, also ist die ganze Hoehe der
   * Platz fuer die beiden Kegel, und von innen frisst die Ansenkung der
   * Bohrung mit. Eine echte Mutter ist an beiden Seiten gefast.
   */
  it("bricht beide Aussenkanten der Mutter und bleibt dabei dicht", () => {
    const scharf = geometryFor("nut", 5);
    const grenze = threadHeadChamferLimits(scharf.settings).max;
    expect(grenze).toBeGreaterThan(0.3);
    const fase = grenze * 0.8;
    const gebrochen = geometryFor("nut", 5, { threadHeadChamfer: fase });
    const position = gebrochen.geometry.getAttribute("position") as unknown as Position;

    expect(gebrochen.settings.headChamfer).toBeCloseTo(fase, 6);
    expect([...edgeUseCounts(position).values()].every((uses) => uses === 2)).toBe(true);
    const scharfesVolumen = signedVolume(scharf.geometry.getAttribute("position") as unknown as Position);
    const gebrochenesVolumen = signedVolume(position);
    expect(gebrochenesVolumen).toBeGreaterThan(0);
    expect(gebrochenesVolumen).toBeLessThan(scharfesVolumen);
    // Der Platzbedarf bleibt: die Schluesselweite ist die Schluesselweite.
    expect(gebrochen.footprint.width).toBeCloseTo(scharf.footprint.width, 6);
    expect(gebrochen.geometry.boundingBox?.min.y).toBeCloseTo(0, 5);
    expect(gebrochen.geometry.boundingBox?.max.y).toBeCloseTo(5, 5);
  });

  it("zieht beide Stirnflaechen der Mutter ein und laesst die Bohrung frei", () => {
    const scharf = geometryFor("nut", 5);
    const fase = threadHeadChamferLimits(scharf.settings).max * 0.8;
    const { geometry, settings } = geometryFor("nut", 5, { threadHeadChamfer: fase });
    const position = geometry.getAttribute("position") as unknown as Position;
    const spec = threadSizeFor(settings.diameter, settings.pitch);
    const eingezogen = (spec?.acrossFlats ?? 0) / 2 - fase;
    let unten = 0;
    let oben = 0;
    let engste = Number.POSITIVE_INFINITY;
    for (let index = 0; index < position.count; index += 1) {
      const y = position.getY(index);
      const radius = Math.hypot(position.getX(index), position.getZ(index));
      if (Math.abs(y) < 1e-6) { unten = Math.max(unten, radius); engste = Math.min(engste, radius); }
      if (Math.abs(y - 5) < 1e-6) oben = Math.max(oben, radius);
    }
    expect(unten).toBeCloseTo(eingezogen, 4);
    expect(oben).toBeCloseTo(eingezogen, 4);
    /*
     * Die Fase kommt von aussen, die Bohrung bleibt unberuehrt: der engste
     * Punkt der Stirnflaeche ist nach wie vor das angesenkte Mundloch -
     * Flankendurchmesser plus halbes Spiel plus die Ansenkung.
     */
    expect(engste).toBeCloseTo(settings.diameter / 2 + settings.clearance / 2 + settings.chamfer, 4);
    // Und zwischen Mundloch und Fase bleibt eine ebene Stirnflaeche stehen.
    expect(unten).toBeGreaterThan(engste + 0.2);
  });

  it("schneidet die Fase nach, wenn die Mutter flacher gezogen wurde", () => {
    /*
     * Die Grenze rechnet mit dem Normmass, weil `threadSettings` die Hoehe des
     * Koerpers nicht kennt. Wer die Mutter halb so hoch zieht, haette sonst
     * zwei Kegel, die sich in der Mitte treffen - der Erzeuger schneidet den
     * Wert deshalb noch einmal nach.
     */
    const voll = threadHeadChamferLimits(geometryFor("nut", 5).settings).max;
    const flach = geometryFor("nut", 2, { threadHeadChamfer: voll });
    const position = flach.geometry.getAttribute("position") as unknown as Position;
    expect([...edgeUseCounts(position).values()].every((uses) => uses === 2)).toBe(true);
    expect(signedVolume(position)).toBeGreaterThan(0);
    expect(flach.geometry.boundingBox?.max.y).toBeCloseTo(2, 5);
  });

  it("gibt dem Senkkopf keine Fase - sein Kegel ist schon eine", () => {
    const senkkopf = { role: "screw", head: "countersunk", diameter: 6, pitch: 1, headHeight: 2 } as const;
    expect(threadHeadChamferLimits(senkkopf).max).toBe(0);
    expect(normalizeThreadHeadChamfer(2, senkkopf)).toBe(0);
    // Die Gewindestange hat gar keine Aussenkante, das Gewindeloch erst recht.
    expect(threadHeadChamferLimits({ role: "rod", head: "cylinder", diameter: 6, pitch: 1, headHeight: 0 }).max).toBe(0);
    expect(threadHeadChamferLimits({ role: "bore", head: "cylinder", diameter: 6, pitch: 1, headHeight: 0 }).max).toBe(0);
    // Die Mutter dagegen schon, und ihre Kopfform steht auf gar nichts.
    expect(threadHeadChamferLimits({ role: "nut", head: "cylinder", diameter: 6, pitch: 1, headHeight: 0 }).max).toBeGreaterThan(0.3);
  });

  it("laesst ein gespeichertes Projekt unveraendert, wenn es die Kopffase noch nicht kennt", () => {
    // Eine fehlende Angabe heisst scharfkantig - sonst saehe jede alte
    // Schraube nach dem Oeffnen anders aus.
    expect(threadSettings({ threadRole: "screw", threadDiameter: 6, threadPitch: 1 }).headChamfer).toBe(0);
  });

  it.each<["trapezoidal" | "round", ThreadRole, number]>([
    ["trapezoidal", "rod", 20],
    ["trapezoidal", "screw", 24],
    ["trapezoidal", "nut", 5],
    ["trapezoidal", "bore", 14],
    ["round", "rod", 20],
    ["round", "screw", 24],
    ["round", "nut", 5],
    ["round", "bore", 14],
  ])(
    "stays closed on a %s profile as a %s",
    (threadProfile, role, height) => {
      const { geometry } = geometryFor(role, height, { threadProfile });
      const position = geometry.getAttribute("position") as unknown as Position;
      expect(position.count).toBeGreaterThan(1000);
      expect([...edgeUseCounts(position).values()].every((uses) => uses === 2)).toBe(true);
      expect(signedVolume(position)).toBeGreaterThan(0);
    },
  );

  it("cuts a flatter trapezoidal and round profile than the ISO default", () => {
    // Dieselbe Pruefung wie beim Spitzgewinde, nur mit den Tiefen der beiden
    // neuen Profile - bewusst gewaehlte, dokumentierte Naeherungen an DIN 103
    // und DIN 405, keine geschaetzten Werte.
    const trapezoidal = geometryFor("rod", 20, { threadProfile: "trapezoidal" });
    const round = geometryFor("rod", 20, { threadProfile: "round" });
    const minorRadiusOf = (geometry: typeof trapezoidal.geometry) => {
      const position = geometry.getAttribute("position") as unknown as Position;
      let smallest = Number.POSITIVE_INFINITY;
      for (let index = 0; index < position.count; index += 1) {
        const y = position.getY(index);
        if (y < 4 || y > 16) continue;
        smallest = Math.min(smallest, Math.hypot(position.getX(index), position.getZ(index)));
      }
      return smallest;
    };
    expect(minorRadiusOf(trapezoidal.geometry)).toBeCloseTo(3 - 0.4815, 3);
    expect(minorRadiusOf(round.geometry)).toBeCloseTo(3 - 0.3, 3);
    // Beide Profile sind flacher als das scharfe ISO-Gewinde - genau der Punkt.
    expect(minorRadiusOf(trapezoidal.geometry)).toBeGreaterThan(3 - 0.5413);
    expect(minorRadiusOf(round.geometry)).toBeGreaterThan(3 - 0.5413);
  });

  it("carries the inch sizes with the same profile", () => {
    const quarterUnc = threadSizeFor(6.35, 25.4 / 20);
    expect(quarterUnc?.id).toBe('1/4"-20 UNC');
    expect(quarterUnc?.system).toBe("inch");
    const quarterUnf = threadSizeFor(6.35, 25.4 / 28);
    expect(quarterUnf?.id).toBe('1/4"-28 UNF');
    // Grob und fein teilen sich den Durchmesser, nur die Steigung trennt sie.
    expect(quarterUnf?.diameter).toBeCloseTo(quarterUnc?.diameter as number, 9);

    expect(threadUsesInchPitch(6.35)).toBe(true);
    expect(threadUsesInchPitch(6)).toBe(false);
    expect(pitchToThreadsPerInch(threadsPerInchToPitch(20))).toBeCloseTo(20, 9);
    expect(pitchToThreadsPerInch(1.27)).toBeCloseTo(20, 6);

    const { geometry, footprint } = geometryFor("rod", 20, { threadDiameter: 6.35, threadPitch: 25.4 / 20 });
    const position = geometry.getAttribute("position") as unknown as Position;
    expect([...edgeUseCounts(position).values()].every((uses) => uses === 2)).toBe(true);
    expect(footprint.width).toBeCloseTo(6.35, 6);
  });
});

/**
 * Der Angriff im Kopf: Innensechskant, Schlitz, Kreuz, Pozidriv oder Torx. Was
 * hier zaehlt, ist beides - dass der Koerper dicht bleibt, und dass die Groesse
 * die genormte ist. Ein T20 an einer M5 waere geometrisch tadellos und trotzdem
 * falsch.
 */
describe("thread drives", () => {
  const DRIVES: ThreadDrive[] = ["none", "hex", "slot", "phillips", "pozidriv", "torx"];

  it.each(DRIVES)("stays closed with a %s drive", (threadDrive) => {
    const { geometry } = geometryFor("screw", 24, { threadDrive });
    const position = geometry.getAttribute("position") as unknown as Position;
    expect([...edgeUseCounts(position).values()].every((uses) => uses === 2)).toBe(true);
    expect(signedVolume(position)).toBeGreaterThan(0);
  });

  it.each(DRIVES)("stays closed with a %s drive in a countersunk head", (threadDrive) => {
    const { geometry } = geometryFor("screw", 24, { threadDrive, threadHead: "countersunk" });
    const position = geometry.getAttribute("position") as unknown as Position;
    expect([...edgeUseCounts(position).values()].every((uses) => uses === 2)).toBe(true);
    expect(signedVolume(position)).toBeGreaterThan(0);
  });

  it("gives every drive the size its standard prescribes", () => {
    // ISO 4762 / 14579 / 7046 / 2380: M5 carries a 4 mm hex socket, a T25, a
    // PH2 and a 1.2 mm slot.
    const headHeight = 5;
    expect(threadDriveSpec("hex", 5, 0.8, headHeight)?.across).toBeCloseTo(threadSizeSpec(5, 0.8).socket, 6);
    expect(threadDriveSpec("hex", 5, 0.8, headHeight)?.across).toBeCloseTo(4, 6);
    expect(threadDriveSpec("torx", 5, 0.8, headHeight)?.label).toBe("T25");
    expect(threadDriveSpec("torx", 6, 1, 6)?.label).toBe("T30");
    expect(threadDriveSpec("phillips", 5, 0.8, headHeight)?.label).toBe("PH2");
    expect(threadDriveSpec("pozidriv", 8, 1.25, 8)?.label).toBe("PZ3");
    expect(threadDriveSpec("slot", 6, 1, 6)?.across).toBeCloseTo(1.6, 6);
    expect(threadDriveSpec("none", 5, 0.8, headHeight)).toBeNull();
  });

  it("scales a free diameter off the nearest standard instead of snapping to it", () => {
    const standard = threadDriveSpec("torx", 6, 1, 6);
    // 6,6 mm liegt naeher an der M6 als an der M8 - also waechst deren T30 mit.
    const free = threadDriveSpec("torx", 6.6, 1, 6.6);
    expect(free?.across).toBeCloseTo((standard?.across ?? 0) * 1.1, 6);
    expect(free?.label).toContain("T30");
  });

  it("keeps the recess inside the head", () => {
    for (const threadDrive of ["hex", "slot", "phillips", "pozidriv", "torx"] as ThreadDrive[]) {
      const settings = threadSettings({ threadRole: "screw", threadDiameter: 6, threadPitch: 1, threadDrive });
      const spec = threadDriveSpec(threadDrive, settings.diameter, settings.pitch, settings.headHeight);
      expect(spec).not.toBeNull();
      expect(spec!.depth).toBeLessThanOrEqual(settings.headHeight * 0.65 + 1e-9);
      const profile = threadDriveProfile(threadDrive, spec);
      const headRadius = threadHeadDiameter(settings) / 2;
      const rim = Math.max(0.12, settings.diameter * 0.03);
      for (let step = 0; step < 90; step += 1) {
        const angle = (step / 90) * Math.PI * 2;
        expect(Math.min(profile!.radiusAt(angle), headRadius - rim)).toBeLessThan(headRadius);
      }
    }
  });

  it("carves material out of the head instead of adding it", () => {
    const plain = geometryFor("screw", 24, { threadDrive: "none" });
    for (const threadDrive of ["hex", "slot", "phillips", "pozidriv", "torx"] as ThreadDrive[]) {
      const recessed = geometryFor("screw", 24, { threadDrive });
      const solid = signedVolume(plain.geometry.getAttribute("position") as unknown as Position);
      const hollow = signedVolume(recessed.geometry.getAttribute("position") as unknown as Position);
      expect(hollow).toBeLessThan(solid);
    }
  });

  it("leaves a hex head alone - it is gripped from the outside", () => {
    expect(threadSettings({ threadHead: "hex", threadDrive: "torx" }).drive).toBe("none");
    expect(threadSettings({ threadHead: "cylinder", threadDrive: "torx" }).drive).toBe("torx");
  });

  it("falls back to the hex socket for an unknown drive", () => {
    expect(normalizeThreadDrive("gibberish")).toBe("hex");
    expect(normalizeThreadDrive(undefined)).toBe("hex");
    expect(normalizeThreadDrive("pozidriv")).toBe("pozidriv");
  });
});
