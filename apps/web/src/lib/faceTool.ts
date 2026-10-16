import type { CrossSection, ManifoldToplevel } from "manifold-3d";
import { CUTTER_END_PADDING } from "@/lib/cutterPadding";
import type { HolePatternFace } from "@/lib/holePattern";
import type { PlacementWorkplane } from "@/lib/placementWorkplane";
import type { SketchProfile } from "@/types/sketchforge";

/**
 * faceTool.ts
 *
 * Das Flaechenwerkzeug: eine flache Flaeche eines Koerpers herausziehen oder
 * als Tasche hineinschneiden, vom Rand eingezogen und mit runden Ecken.
 *
 * Eine dickere Wand, ein Polster oder eine Tasche an einem fertigen Teil
 * brauchte bisher eine Arbeitsebene auf der Flaeche, eine nachgezeichnete
 * Skizze, eine Hochziehung und ein Gruppieren - und an einer eingelesenen STL
 * ging es gar nicht anders. Hier ist es ein Schritt: Flaeche anklicken,
 * heraus oder hinein, Tiefe, Einzug und Eckenradius.
 *
 * Was entsteht, ist ein gewoehnlicher Skizzenkoerper, mit dem Koerper
 * gruppiert: Gruppe bearbeiten, Skizze bearbeiten und Rueckgaengig gehen wie
 * immer.
 *
 * Diese Datei ist die Rechnung am Umriss, ohne Zustand des Editors. Der Rand
 * der Flaeche kommt aus derselben Stelle wie beim Lochmuster
 * (`holePatternFaceFromLoops`): in den Koordinaten ihrer Arbeitsebene.
 *
 * Nach Layerling 1.80.0 (#404, beigetragen von @mlugo-apx).
 */

/** Heraus setzt Material auf die Flaeche, hinein schneidet eine Tasche. */
export type FaceToolDirection = "out" | "in";

export type FaceToolSettings = {
  direction: FaceToolDirection;
  /** Wie weit der Umriss innerhalb des Flaechenrands bleibt, in mm; 0 ist die ganze Flaeche. */
  inset: number;
  /** Auf welchen Radius die Ecken des Umrisses gerundet werden, in mm; 0 laesst sie, wie sie sind. */
  radius: number;
  /** Wie weit der neue Koerper aus der Flaeche steht oder die Tasche hineinreicht, in mm. */
  depth: number;
};

export const DEFAULT_FACE_TOOL: FaceToolSettings = { direction: "out", inset: 0, radius: 0, depth: 2 };
export const FACE_TOOL_MAX_INSET = 50;
export const FACE_TOOL_MAX_RADIUS = 30;
export const FACE_TOOL_MIN_DEPTH = 0.2;
export const FACE_TOOL_MAX_DEPTH = 100;

/**
 * Wie weit der neue Koerper in den alten hineinreicht - oder die Tasche aus
 * der Flaeche heraus -, damit beide ohne Haut dazwischen verschmelzen. Zwei
 * Koerper, die sich nur in einer Ebene beruehren, ergeben beim Vereinigen
 * eine doppelte Flaeche; eine Tasche, die genau an der Oberflaeche endet,
 * liesse dort eine Haut von null Dicke stehen.
 */
export const FACE_TOOL_OVERLAP = 0.2;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** Haelt jede Zahl der Einstellung in dem, was das Werkzeug anbietet. */
export function normalizeFaceTool(settings: Partial<FaceToolSettings>): FaceToolSettings {
  const number = (value: unknown, fallback: number) => (typeof value === "number" && Number.isFinite(value) ? value : fallback);
  return {
    direction: settings.direction === "in" ? "in" : "out",
    inset: clamp(number(settings.inset, DEFAULT_FACE_TOOL.inset), 0, FACE_TOOL_MAX_INSET),
    radius: clamp(number(settings.radius, DEFAULT_FACE_TOOL.radius), 0, FACE_TOOL_MAX_RADIUS),
    depth: clamp(number(settings.depth, DEFAULT_FACE_TOOL.depth), FACE_TOOL_MIN_DEPTH, FACE_TOOL_MAX_DEPTH),
  };
}

/**
 * Der Umriss der Flaeche um `inset` eingezogen, jede Ecke auf `radius`
 * gerundet - als Skizze aus Geraden, in den Koordinaten der Flaeche.
 * Oeffnungen in der Flaeche wachsen um den Einzug. `null`, wenn von der
 * Flaeche nichts uebrig bleibt.
 *
 * Gerundet wird mit drei Versaetzen: erst um Einzug plus Radius nach innen
 * (spitz, damit die Innenecken der Flaeche nicht schon dabei rund werden),
 * dann um den Radius nach aussen und wieder hinein, rund. Das erste Paar
 * rundet die Aussenecken, das zweite die Innenecken - so werden beide rund,
 * und der Umriss endet trotzdem genau `inset` innerhalb des Rands.
 */
export function insetFaceProfile(runtime: ManifoldToplevel, face: HolePatternFace, inset: number, radius = 0): SketchProfile | null {
  const loops = [face.outline, ...(face.openings ?? [])]
    .filter((loop) => loop.length >= 3)
    .map((loop) => loop.map((point): [number, number] => [point.x, point.z]));
  if (!loops.length) return null;
  const made: CrossSection[] = [];
  const keep = (section: CrossSection) => {
    made.push(section);
    return section;
  };
  let polygons: ReturnType<CrossSection["toPolygons"]>;
  try {
    const region = keep(new runtime.CrossSection(loops, "EvenOdd"));
    const shrink = inset + radius;
    const shrunk = shrink > 0 ? keep(region.offset(-shrink, "Miter", 2, 48)) : region;
    const rounded = radius > 0
      ? keep(keep(keep(shrunk.offset(radius, "Round", 2, 48)).offset(radius, "Round", 2, 48)).offset(-radius, "Round", 2, 48))
      : shrunk;
    const result = keep(rounded.simplify(1e-6));
    if (result.area() <= 1e-9) return null;
    polygons = result.toPolygons();
    if (!polygons.length) return null;
  } finally {
    new Set(made).forEach((section) => section.delete());
  }
  const points: SketchProfile["points"] = [];
  const segments: SketchProfile["segments"] = [];
  polygons.forEach((polygon, loopIndex) => {
    const ids = polygon.map((_, index) => `face-${loopIndex}-${index}`);
    polygon.forEach(([x, z], index) => points.push({ id: ids[index], x, z }));
    ids.forEach((id, index) => segments.push({ id: `face-${loopIndex}-s${index}`, startId: id, endId: ids[(index + 1) % ids.length], kind: "line", bulge: 0 }));
  });
  return { points, segments };
}

/** Die Einstellung, wie sie auf einer Flaeche gebaut wird: Eine Tasche geht nicht tiefer als der Koerper dahinter. */
export function faceToolSettingsOn(thickness: number, settings: FaceToolSettings): FaceToolSettings {
  if (settings.direction === "out" || settings.depth <= thickness) return settings;
  return { ...settings, depth: Math.max(FACE_TOOL_MIN_DEPTH, thickness) };
}

/**
 * Wo der neue Koerper steht und wie hoch er ist.
 *
 * Heraus beginnt er `FACE_TOOL_OVERLAP` im alten Koerper und reicht `depth`
 * darueber hinaus. Hinein ist er eine Aussparung, und eine Aussparung wird
 * beim Gruppieren an beiden Enden um `CUTTER_END_PADDING` verlaengert (siehe
 * cutterPadding.ts) - eine blinde Tasche kaeme so 0,05 mm zu tief heraus.
 * Gemessen an einer Tasche von 4 mm in einem Quader 40 x 20 x 10: 23,6 mm3
 * zu viel, genau 0,05 mm ueber ihre Flaeche. Darum beginnt sie um diese
 * Zugabe hoeher. Geht sie durch den ganzen Koerper, bleibt die Zugabe stehen:
 * Dort soll sie ueber die Rueckseite hinausreichen.
 */
export function faceToolBodyFrame(
  workplane: PlacementWorkplane,
  settings: Pick<FaceToolSettings, "direction" | "depth">,
  thickness: number,
): { workplane: PlacementWorkplane; height: number } {
  const through = settings.direction === "in" && settings.depth >= thickness - 1e-6;
  const padding = settings.direction === "in" && !through ? CUTTER_END_PADDING : 0;
  const shift = settings.direction === "out" ? -FACE_TOOL_OVERLAP : -(settings.depth - padding);
  const { origin, normal } = workplane;
  return {
    workplane: { ...workplane, origin: { x: origin.x + normal.x * shift, y: origin.y + normal.y * shift, z: origin.z + normal.z * shift } },
    height: settings.depth - padding + FACE_TOOL_OVERLAP,
  };
}
