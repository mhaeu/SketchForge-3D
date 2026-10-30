/**
 * savedViews.ts
 *
 * Vier gespeicherte Ansichten je Entwurf: Umschalt+7, 8, 9 oder 0 merkt sich
 * die Ansicht genau so, wie sie ist (Blickwinkel, Verschiebung, Zoom, flach
 * oder perspektivisch), und dieselbe Ziffer allein holt sie zurueck. Gezaehlt
 * wird die Taste, nicht das Zeichen: Auf einer deutschen Tastatur macht
 * Umschalt aus der 7 einen Schraegstrich, und auf AZERTY braucht schon die
 * Ziffer Umschalt. Der Ziffernblock geht auch.
 *
 * Gespeichert wird im Browser neben den Einstellungen der Arbeitsflaeche,
 * nicht im Verlauf. Nach layerling 1.97.0 (#657).
 */

export const SAVED_VIEW_SLOTS = ["7", "8", "9", "0"] as const;
export type SavedViewSlot = (typeof SAVED_VIEW_SLOTS)[number];

export type SavedView = {
  position: [number, number, number];
  target: [number, number, number];
  up: [number, number, number];
  orthographic: boolean;
  zoom: number;
  /** Bei der flachen Ansicht: die halbe sichtbare Hoehe bei Zoom 1. */
  halfHeight?: number;
};

export type SavedViews = Partial<Record<SavedViewSlot, SavedView>>;

const STORAGE_PREFIX = "sketchforge.savedViews.";

/** Welcher Platz zu einer Taste gehoert, oder null. */
export function savedViewSlotForEvent(event: Pick<KeyboardEvent, "code" | "ctrlKey" | "metaKey" | "altKey">): SavedViewSlot | null {
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  const match = /^(?:Digit|Numpad)([0-9])$/.exec(event.code);
  if (!match) return null;
  return (SAVED_VIEW_SLOTS as readonly string[]).includes(match[1]) ? (match[1] as SavedViewSlot) : null;
}

function isTriple(value: unknown): value is [number, number, number] {
  return Array.isArray(value) && value.length === 3 && value.every((entry) => typeof entry === "number" && Number.isFinite(entry));
}

/** Eine gespeicherte Ansicht, wenn sie heil ist; sonst null. */
export function normalizeSavedView(value: unknown): SavedView | null {
  if (!value || typeof value !== "object") return null;
  const view = value as Record<string, unknown>;
  if (!isTriple(view.position) || !isTriple(view.target) || !isTriple(view.up)) return null;
  const zoom = typeof view.zoom === "number" && Number.isFinite(view.zoom) && view.zoom > 0 ? view.zoom : 1;
  const halfHeight = typeof view.halfHeight === "number" && Number.isFinite(view.halfHeight) && view.halfHeight > 0 ? view.halfHeight : undefined;
  return { position: view.position, target: view.target, up: view.up, orthographic: view.orthographic === true, zoom, ...(halfHeight ? { halfHeight } : {}) };
}

export function normalizeSavedViews(value: unknown): SavedViews {
  const result: SavedViews = {};
  if (!value || typeof value !== "object") return result;
  for (const slot of SAVED_VIEW_SLOTS) {
    const view = normalizeSavedView((value as Record<string, unknown>)[slot]);
    if (view) result[slot] = view;
  }
  return result;
}

export function readSavedViews(key: string | null | undefined): SavedViews {
  if (!key || typeof window === "undefined") return {};
  try {
    return normalizeSavedViews(JSON.parse(window.localStorage.getItem(`${STORAGE_PREFIX}${key}`) ?? "null"));
  } catch {
    return {};
  }
}

export function writeSavedView(key: string | null | undefined, slot: SavedViewSlot, view: SavedView) {
  if (!key || typeof window === "undefined") return false;
  try {
    const views = { ...readSavedViews(key), [slot]: view };
    window.localStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(views));
    return true;
  } catch {
    return false;
  }
}

/**
 * Eigene Startansicht (nach layerling #853): Neue Entwuerfe oeffnen darin, und
 * die Ausgangsansicht (Pos1, Haus am Wuerfel) kehrt dorthin zurueck. Gilt fuer
 * alle Entwuerfe in diesem Browser. Gespeichert wird sie so, wie die
 * perspektivische Kamera sie zeigt; die flache Ansicht rechnet ihren Zoom in den
 * Abstand um, der gleich viel zeigt. So sieht sie in beiden Projektionen gleich aus.
 */
export type StartView = Pick<SavedView, "position" | "target" | "up">;

const START_VIEW_STORAGE_KEY = "sketchforge.editor.startView";

/** Eine Startansicht, wenn die Kamera damit irgendwohin schauen kann; sonst null. */
export function normalizeStartView(value: unknown): StartView | null {
  const view = normalizeSavedView(value);
  if (!view) return null;
  const [px, py, pz] = view.position;
  const [tx, ty, tz] = view.target;
  if (Math.hypot(px - tx, py - ty, pz - tz) < 1e-6 || Math.hypot(...view.up) < 1e-6) return null;
  return { position: view.position, target: view.target, up: view.up };
}

/**
 * Der Abstand, in dem die perspektivische Kamera (Oeffnungswinkel fovDegrees)
 * so viel zeigt wie die flache Ansicht mit dieser halben Hoehe und diesem Zoom.
 */
export function perspectiveDistanceForFlatView(halfHeight: number, zoom: number, fovDegrees: number) {
  return halfHeight / Math.max(zoom, 1e-6) / Math.tan((fovDegrees * Math.PI) / 360);
}

export function readStartView(): StartView | null {
  if (typeof window === "undefined") return null;
  try {
    return normalizeStartView(JSON.parse(window.localStorage.getItem(START_VIEW_STORAGE_KEY) ?? "null"));
  } catch {
    return null;
  }
}

/** null nimmt wieder die Standardansicht. Gibt zurueck, ob gespeichert wurde. */
export function writeStartView(view: StartView | null) {
  if (typeof window === "undefined") return false;
  try {
    const kept = normalizeStartView(view);
    if (kept) window.localStorage.setItem(START_VIEW_STORAGE_KEY, JSON.stringify(kept));
    else window.localStorage.removeItem(START_VIEW_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
