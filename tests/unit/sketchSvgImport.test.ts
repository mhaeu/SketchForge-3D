import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { SKETCH_SVG_MAX_SIZE, sketchGeometryFromPaths, sketchProfileWithSvg } from "@/lib/sketchSvgImport";
import type { SketchProfile } from "@/types/sketchforge";

/**
 * Wie im Test des Koerper-Imports werden die Pfade von Hand gebaut: das
 * Zerlegen der XML-Datei braucht einen Browser, die Rechnung darueber nicht.
 */
function shapePath(
  contours: Array<{ points: Array<[number, number]>; closed?: boolean }>,
  style: Record<string, unknown> = {},
) {
  const path = new THREE.ShapePath();
  contours.forEach((contour) => {
    path.moveTo(contour.points[0][0], contour.points[0][1]);
    contour.points.slice(1).forEach(([x, y]) => path.lineTo(x, y));
    if (contour.closed !== false) path.currentPath!.autoClose = true;
  });
  (path as THREE.ShapePath & { userData: unknown }).userData = {
    style: { fill: "#000", fillOpacity: 1, opacity: 1, ...style },
  };
  return path;
}

const rectangle = (x: number, y: number, width: number, height: number, closed = true) => shapePath([
  { points: [[x, y], [x + width, y], [x + width, y + height], [x, y + height]], closed },
]);

/**
 * Eine SVG-Zeichnung in den Skizzenmodus holen heisst: ihre Umrisse werden zu
 * Punkten und Strecken, die man danach wie von Hand gezeichnete weiterzieht.
 * Die Fuellung interessiert dabei nicht - nur der Linienzug.
 */
describe("importing an SVG into the sketch plane", () => {
  it("turns a rectangle into a closed run of four points", () => {
    const geometry = sketchGeometryFromPaths([rectangle(10, 20, 40, 30)]);
    expect(geometry.contours).toBe(1);
    expect(geometry.points).toHaveLength(4);
    // Geschlossen heisst: so viele Strecken wie Punkte.
    expect(geometry.segments).toHaveLength(4);
    const ends = new Set(geometry.segments.flatMap((segment) => [segment.startId, segment.endId]));
    expect(ends.size).toBe(4);
    geometry.segments.forEach((segment) => expect(segment.kind).toBe("line"));
  });

  it("puts the drawing in the middle of the sketch plane and keeps its ratio", () => {
    const geometry = sketchGeometryFromPaths([rectangle(10, 20, 40, 30)]);
    const xs = geometry.points.map((point) => point.x);
    const zs = geometry.points.map((point) => point.z);
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(0, 6);
    expect((Math.min(...zs) + Math.max(...zs)) / 2).toBeCloseTo(0, 6);
    expect((Math.max(...xs) - Math.min(...xs)) / (Math.max(...zs) - Math.min(...zs))).toBeCloseTo(40 / 30, 6);
  });

  it("keeps a small drawing at its own size and shrinks a large one", () => {
    const small = sketchGeometryFromPaths([rectangle(0, 0, 40, 30)]);
    const width = (geometry: typeof small) =>
      Math.max(...geometry.points.map((point) => point.x)) - Math.min(...geometry.points.map((point) => point.x));
    expect(width(small)).toBeCloseTo(40, 4);
    expect(width(sketchGeometryFromPaths([rectangle(0, 0, 400, 300)]))).toBeCloseTo(SKETCH_SVG_MAX_SIZE, 4);
  });

  it("leaves an open stroke open", () => {
    const geometry = sketchGeometryFromPaths([shapePath(
      [{ points: [[0, 0], [40, 0], [40, 20]], closed: false }],
      { fill: "none", stroke: "#000", strokeOpacity: 1, strokeWidth: 2 },
    )]);
    expect(geometry.points).toHaveLength(3);
    // Drei Punkte, zwei Strecken - der Zug laeuft nicht zurueck.
    expect(geometry.segments).toHaveLength(2);
  });

  it("keeps the drawing upright: the sketch plane counts down, like SVG", () => {
    const geometry = sketchGeometryFromPaths([
      rectangle(10, 10, 80, 10),
      rectangle(40, 60, 20, 30),
    ]);
    // Der breite Balken stand oben; er muss auch in der Skizze oben liegen,
    // also bei kleinerem z.
    const wide = geometry.points.filter((point) => Math.abs(point.x) > 20);
    const narrow = geometry.points.filter((point) => Math.abs(point.x) <= 20);
    expect(Math.max(...wide.map((point) => point.z))).toBeLessThan(Math.min(...narrow.map((point) => point.z)));
  });

  it("reads several contours of one path and skips hidden ones", () => {
    const two = shapePath([
      { points: [[0, 0], [20, 0], [20, 20], [0, 20]] },
      { points: [[50, 50], [70, 50], [70, 70], [50, 70]] },
    ]);
    expect(sketchGeometryFromPaths([two]).contours).toBe(2);
    expect(sketchGeometryFromPaths([two, rectangle(0, 0, 5, 5)], 80).contours).toBe(3);
    expect(sketchGeometryFromPaths([rectangle(0, 0, 10, 10), shapePath([{ points: [[0, 0], [5, 0], [5, 5]] }], { visibility: "hidden" })]).contours).toBe(1);
  });

  it("refuses a drawing without visible lines", () => {
    expect(() => sketchGeometryFromPaths([])).toThrow();
    expect(() => sketchGeometryFromPaths([shapePath([{ points: [[0, 0], [1, 0]] }], { opacity: 0 })])).toThrow();
  });

  it("appends to a sketch that already holds geometry", () => {
    const existing: SketchProfile = { points: [{ id: "p", x: 0, z: 0 }], segments: [], images: [] };
    const merged = sketchProfileWithSvg(existing, sketchGeometryFromPaths([rectangle(0, 0, 10, 10)]));
    expect(merged.points).toHaveLength(5);
    expect(merged.points[0].id).toBe("p");
    expect(merged.images).toEqual([]);
  });
});
