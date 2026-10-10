// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";
import { buildSvgExtrusionFromPaths } from "@/lib/svgImport";

/**
 * Ein Loch im Umriss bleibt ein Loch.
 *
 * Inkscape schliesst einen Umriss aus Boegen etwa 0,0000002 mm vor seinem
 * Anfang. Dieser Splitter blieb beim Aufraeumen stehen, weil die Schranke
 * fest bei 1e-20 lag - und eine Strecke der Laenge null liegt auf der Geraden
 * durch sich selbst, also hielt die Kreuzungspruefung jeden Punkt fuer darauf
 * liegend. Das Loch "kreuzte" damit den Umriss und kam als eigener voller
 * Koerper herein, statt ausgeschnitten zu werden.
 *
 * Der Pfad ist der des Melders bei Layerling (#197), unveraendert - ein
 * Scheibchen auf zwei Beinen mit einem runden Loch darin.
 */
const OUTLINE_WITH_HOLE = `<svg xmlns="http://www.w3.org/2000/svg" width="60mm" height="80mm" viewBox="0 0 60 80">
  <g transform="translate(0,-217)">
    <path d="M 30.000236 217 A 30 30 0 0 0 0 247.00024 A 30 30 0 0 0 14.850256 272.89375 L 14.850256 296.99977 L 19.849951 296.99977 L 19.849951 271.99974 L 40.150004 271.99974 L 40.150004 296.99977 L 45.150216 296.99977 L 45.150216 272.89375 A 30 30 0 0 0 59.999955 247.00024 A 30 30 0 0 0 30.000236 217 z M 30.000236 226.99991 A 20 20 0 0 1 50.000049 247.00024 A 20 20 0 0 1 30.000236 267.00005 A 20 20 0 0 1 9.9999064 247.00024 A 20 20 0 0 1 30.000236 226.99991 z " />
  </g>
</svg>`;

describe("Der SVG-Import und seine Loecher", () => {
  it("schneidet das runde Loch aus einem Umriss, der ein Haar zu kurz geschlossen ist", () => {
    const parsed = new SVGLoader().parse(OUTLINE_WITH_HOLE);
    const { analysis } = buildSvgExtrusionFromPaths(parsed.paths);
    const area = analysis.volume / analysis.height;
    const disc = Math.PI * 30 * 30;
    const hole = Math.PI * 20 * 20;
    /*
     * Die Flaeche muss um fast das ganze Loch kleiner sein als die Scheibe.
     * Bliebe das Loch gefuellt, laege sie darueber - und zwar um 1.257 mm^2.
     */
    expect(area).toBeLessThan(disc - hole * 0.9 + 400);
    expect(area).toBeGreaterThan(disc - hole - 50);
    // Und der Koerper ist zu: kein Rand, an dem nur ein Dreieck haengt.
    expect(analysis.boundaryEdges).toBe(0);
  });
});
