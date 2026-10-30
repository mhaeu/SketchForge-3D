import type { CrossSection, ManifoldToplevel } from "manifold-3d";

/**
 * cookieCutter.ts
 *
 * Die Ausstechform: aus dem Grundriss einer Auswahl eine duenne Wand um ihre
 * Kontur und ein flacher Rand um den Fuss, in einem Stueck gedruckt. Gedruckt
 * wird auf dem Rand, zum Ausstechen umgedreht - darum wird der Grundriss
 * gespiegelt, sonst kaeme ein Text seitenverkehrt heraus. Oben laeuft die
 * Wand zu einer Schneide zusammen. Loecher im Grundriss (das Innere eines
 * "e") bekommen eigene Waende; Stege am Rand halten sie mit der Aussenwand
 * zusammen.
 *
 * In layerling (1.118 bis 1.121, #982) sind Wand und Rand Fuellarten einer
 * Skizze und bleiben einzeln aenderbar. Die gibt es hier nicht; die Form
 * wird darum direkt mit Manifold gebaut und ist danach ein Netz.
 *
 * Alle Masse in mm. Der Grundriss liegt in der x/y-Ebene von Manifold, die
 * Hoehe ist z ab 0 - der Aufrufer dreht ihn in die Szene.
 */

export type CookieCutterOptions = {
  wall: number;
  height: number;
  rim: number;
  rimHeight: number;
  edge: number;
  mirror: boolean;
  bridges: boolean;
  bridgeCount: number;
  bridgeWidth: number;
  bridgeHeight: number;
};

export const COOKIE_CUTTER_DEFAULTS: CookieCutterOptions = {
  wall: 1.2,
  height: 15,
  rim: 4,
  rimHeight: 2,
  edge: 0.4,
  mirror: true,
  bridges: true,
  bridgeCount: 2,
  bridgeWidth: 4,
  bridgeHeight: 3,
};

type CookieCutterNumber = Exclude<keyof CookieCutterOptions, "mirror" | "bridges">;

export const COOKIE_CUTTER_LIMITS: Record<CookieCutterNumber, readonly [number, number]> = {
  wall: [0.4, 10],
  height: [2, 100],
  rim: [0.5, 30],
  rimHeight: [0.4, 20],
  edge: [0, 10],
  bridgeCount: [1, 8],
  bridgeWidth: [0.8, 20],
  bridgeHeight: [0.4, 20],
};

/** Die Werte, mit fehlenden oder unpassenden durch den naechsten erlaubten ersetzt. */
export function normalizeCookieCutterOptions(value?: Partial<Record<keyof CookieCutterOptions, unknown>> | null): CookieCutterOptions {
  const result = { ...COOKIE_CUTTER_DEFAULTS };
  for (const key of Object.keys(COOKIE_CUTTER_LIMITS) as CookieCutterNumber[]) {
    const raw = value?.[key];
    if (typeof raw !== "number" || !Number.isFinite(raw)) continue;
    const [min, max] = COOKIE_CUTTER_LIMITS[key];
    const clamped = Math.min(max, Math.max(min, raw));
    result[key] = key === "bridgeCount" ? Math.round(clamped) : Math.round(clamped * 100) / 100;
  }
  if (typeof value?.mirror === "boolean") result.mirror = value.mirror;
  if (typeof value?.bridges === "boolean") result.bridges = value.bridges;
  // Die Schneide ist nie breiter als die Wand, der Rand nie hoeher als die Wand.
  result.edge = Math.min(result.edge, result.wall);
  result.rimHeight = Math.min(result.rimHeight, result.height);
  result.bridgeHeight = Math.min(result.bridgeHeight, result.height);
  return result;
}

/** Der Flaecheninhalt einer Kontur mit Vorzeichen: aussen positiv, Loecher negativ. */
function signedArea(contour: ReadonlyArray<readonly [number, number] | { x: number; y: number }>) {
  let area = 0;
  for (let i = 0; i < contour.length; i += 1) {
    const a = contour[i];
    const b = contour[(i + 1) % contour.length];
    const [ax, ay] = Array.isArray(a) ? a : [(a as { x: number }).x, (a as { y: number }).y];
    const [bx, by] = Array.isArray(b) ? b : [(b as { x: number }).x, (b as { y: number }).y];
    area += ax * by - bx * ay;
  }
  return area / 2;
}

/** Ob der Grundriss Loecher hat - dann braucht er Stege. */
export function footprintHasHoles(footprint: CrossSection) {
  return footprint.toPolygons().some((contour) => signedArea(contour) < 0);
}

/**
 * Die Ausstechform als Manifold, z von 0 (Rand) bis `height` (Schneide).
 * `footprint` ist der Grundriss in Druckrichtung, also schon gespiegelt,
 * wenn gespiegelt werden soll. Gibt null zurueck, wenn kein Grundriss da ist.
 */
export function buildCookieCutter(runtime: ManifoldToplevel, footprint: CrossSection, options: CookieCutterOptions) {
  const { CrossSection: Section, Manifold } = runtime;
  const created: Array<{ delete(): void }> = [];
  const keep = <T extends { delete(): void }>(item: T) => {
    created.push(item);
    return item;
  };
  try {
    if (footprint.isEmpty() || footprint.area() <= 0) return null;
    const region = keep(footprint.simplify(0.001));
    // Der Umriss ohne seine Loecher: um ihn herum laeuft der Rand.
    const outer = region.toPolygons().filter((contour) => signedArea(contour) > 0);
    const silhouette = keep(Section.ofPolygons(outer, "Positive"));
    const band = (from: number, to: number) => {
      const grown = keep(region.offset(to, "Round"));
      const inner = from > 0 ? keep(region.offset(from, "Round")) : region;
      return keep(grown.subtract(inner));
    };
    const parts: Array<InstanceType<ManifoldToplevel["Manifold"]>> = [];
    /*
     * Die Wand: ein Band der Breite `wall` ausserhalb der Kontur, also auch
     * innen in jedem Loch. Oben laeuft sie unter 45 Grad zur Schneide
     * zusammen, beidseitig gleich, in Stufen von 0,1 mm - so fein, dass der
     * Drucker sie als Schraege zeichnet.
     */
    const narrowing = Math.max(0, (options.wall - options.edge) / 2);
    const slope = Math.min(narrowing, options.height - options.rimHeight);
    const straight = options.height - slope;
    parts.push(keep(Manifold.extrude(band(0, options.wall), straight)));
    const steps = Math.ceil(slope / 0.1 - 1e-9);
    for (let step = 0; step < steps; step += 1) {
      const bottom = straight + (slope * step) / steps;
      const top = straight + (slope * (step + 1)) / steps;
      const inset = (narrowing * (step + 1)) / steps;
      const layer = band(inset, options.wall - inset);
      if (!layer.isEmpty()) parts.push(keep(Manifold.extrude(layer, top - bottom).translate([0, 0, bottom])));
    }
    // Der Rand: flach um den Fuss, ausserhalb der Wand.
    const rimOuter = keep(silhouette.offset(options.wall + options.rim, "Round"));
    const rimInner = keep(silhouette.offset(options.wall * 0.5, "Round"));
    parts.push(keep(Manifold.extrude(keep(rimOuter.subtract(rimInner)), options.rimHeight)));
    /*
     * Stege: Querbalken auf Randhoehe ueber den ganzen Grundriss, die die
     * Waende der Loecher an der Aussenwand halten. Nur wenn es Loecher gibt.
     */
    if (options.bridges && footprintHasHoles(region)) {
      const bounds = silhouette.bounds();
      const reach = keep(silhouette.offset(options.wall, "Round"));
      const span = bounds.max[1] - bounds.min[1];
      for (let index = 0; index < options.bridgeCount; index += 1) {
        const y = bounds.min[1] + (span * (index + 1)) / (options.bridgeCount + 1);
        const bar = keep(Section.square([bounds.max[0] - bounds.min[0] + 2 * options.wall + 2, options.bridgeWidth]).translate([bounds.min[0] - options.wall - 1, y - options.bridgeWidth / 2]));
        const clipped = keep(bar.intersect(reach));
        if (!clipped.isEmpty()) parts.push(keep(Manifold.extrude(clipped, options.bridgeHeight)));
      }
    }
    const result = Manifold.union(parts);
    return result.isEmpty() ? (result.delete(), null) : result;
  } finally {
    created.forEach((item) => item.delete());
  }
}
