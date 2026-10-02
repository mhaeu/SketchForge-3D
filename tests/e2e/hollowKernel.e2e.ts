import { beforeAll, describe, expect, it, vi } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Der Probelauf fuer das Aushoehlen: Kann der Kern eine Schale bauen?
 *
 * `shell` und `offset` sind in OpenCascade die beiden Rechnungen, aus denen ein
 * Hohlkoerper entsteht. Beide hingen an einer Sache, die erst in occt-wasm
 * 5.4.0 dazukam (die Verbindungsart an den Kanten, andymai/occt-wasm#366) -
 * davor fielen sie an scharfen Ecken aus oder gaben Unsinn zurueck. Darum
 * steht hier zuerst die Frage, ob es ueberhaupt rechnet, und erst danach wird
 * Bedienung gebaut.
 *
 * Wie beim STEP-Durchlauf laeuft der echte Kern aus node_modules, nicht aus
 * dem Browser.
 */
vi.mock("@/lib/brepKernel", async () => {
  const brep = await import("brepjs");
  const { OcctKernel } = await import("occt-wasm");
  const wasm = join(dirname(fileURLToPath(import.meta.resolve("occt-wasm"))), "occt-wasm.wasm");
  let ready: Promise<typeof brep> | null = null;
  return {
    loadBrepWithOcct: () =>
      (ready ??= (async () => {
        const kernel = await OcctKernel.init({ wasm });
        brep.registerKernel("occt-wasm", brep.OcctWasmAdapter.fromKernel(kernel));
        return brep;
      })()),
  };
});

let brep: typeof import("brepjs");

beforeAll(async () => {
  const { loadBrepWithOcct } = await import("@/lib/brepKernel");
  brep = await loadBrepWithOcct();
}, 180000);

describe("Der Kern kann aushoehlen", () => {
  /**
   * Zuerst die Masse, und zwar scharf: `box` nimmt seine Zahlen der Reihe nach
   * und nicht als Feld. Ein Aufruf mit einem Feld baut einen Koerper aus
   * lauter `undefined` - und `shell` rechnet daran minutenlang, ohne je fertig
   * zu werden. Faellt diese Pruefung, ist der Aufruf falsch und nicht der Kern.
   */
  it("baut einen Kasten mit dem Volumen, das er haben soll", () => {
    expect(brep.shape(brep.box(20, 20, 20)).volume()).toBeCloseTo(8000, 0);
  });

  it("macht aus einem Kasten eine Schale mit offener Oberseite", () => {
    const solid = brep.shape(brep.box(20, 20, 20));
    const faces = solid.faces();
    expect(faces.length).toBe(6);
    // Die oberste Flaeche bleibt offen.
    const top = faces.reduce((highest, face) => (
      brep.faceCenter(face)[1] > brep.faceCenter(highest)[1] ? face : highest
    ), faces[0]);

    const hollow = solid.shell([top], 2).volume();
    // 8000 minus dem Hohlraum von 16 * 16 * 18 = 4608, also etwa 3392.
    expect(hollow).toBeGreaterThan(3000);
    expect(hollow).toBeLessThan(4000);
  }, 120000);

  it("schiebt alle Flaechen nach innen", () => {
    // 16 * 16 * 16 = 4096.
    expect(brep.shape(brep.box(20, 20, 20)).offset(-2).volume()).toBeCloseTo(4096, 0);
  }, 120000);

  /**
   * Der Fall, an dem die alte Fassung scheiterte: ein Koerper mit einer
   * gekruemmten und mehreren scharfen Kanten. Genau dafuer brauchte es die
   * Verbindungsart aus 5.4.0.
   */
  it("hoehlt auch einen Zylinder aus", () => {
    const solid = brep.shape(brep.cylinder(10, 30));
    const faces = solid.faces();
    expect(faces.length).toBe(3);
    /*
     * Der Kern baut nach CAD-Sitte mit Z nach oben - der Deckel ist also die
     * Flaeche mit der groessten Z-Mitte und nicht der groessten Y-Mitte. Beim
     * Kasten war das gleichgueltig, hier nicht: Wer statt des Deckels den
     * Mantel oeffnet, verlangt etwas, das es nicht gibt, und bekommt
     * SHELL_FAILED.
     */
    const top = faces.reduce((highest, face) => (
      brep.faceCenter(face)[2] > brep.faceCenter(highest)[2] ? face : highest
    ), faces[0]);
    const full = solid.volume();
    const hollow = solid.shell([top], 2).volume();
    expect(hollow).toBeGreaterThan(full * 0.2);
    expect(hollow).toBeLessThan(full * 0.8);
  }, 120000);
});
