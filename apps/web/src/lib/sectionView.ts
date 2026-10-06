/**
 * sectionView.ts
 *
 * Die Schnittansicht: eine Ebene, die den Blick freilegt, ohne etwas
 * wegzunehmen.
 *
 * Sie beantwortet die Fragen, die man einem Koerper von aussen nicht ansehen
 * kann - sitzt der Hohlraum richtig, ist die Wand dick genug, trifft die
 * Bohrung die Mitte. Bisher blieb dafuer nur, einen Abzugskoerper durch die
 * Zeichnung zu schieben, zu schauen und das Ganze zurueckzunehmen.
 *
 * Geschnitten wird nur in der Anzeige: Die Koerper bleiben, wie sie sind, und
 * was ausgeblendet ist, laesst sich auch nicht anklicken - sonst griffe man
 * beim Blick ins Innere immer wieder die Wand davor.
 *
 * Nach Layerling 1.33.0.
 */

export type SectionAxis = "x" | "y" | "z";

export const SECTION_AXES: readonly SectionAxis[] = ["x", "y", "z"];

export type SectionView = {
  axis: SectionAxis;
  /** Wo die Ebene steht, in Millimetern auf dieser Achse. */
  offset: number;
  /** Welche Haelfte stehen bleibt. */
  flipped: boolean;
  /** Ob die Schnittebene selbst im Bild liegt. */
  showPlane: boolean;
};

export type SectionPoint = { x: number; y: number; z: number };
export type SectionBounds = { min: SectionPoint; max: SectionPoint };

/**
 * Die Ebene, wie three.js sie braucht: Sichtbar bleibt, wo
 * `normal · p + constant >= 0` gilt.
 *
 * Ohne Umschlagen zeigt die Normale **gegen** die Achse: Stehen bleibt dann,
 * was unter dem Schnitt liegt, und weggeschnitten wird, was davor steht - so
 * blickt man von der Achse her hinein. Umgeschlagen gilt das Umgekehrte.
 */
export function sectionPlane(view: Pick<SectionView, "axis" | "offset" | "flipped">) {
  const sign = view.flipped ? 1 : -1;
  return {
    normal: {
      x: view.axis === "x" ? sign : 0,
      y: view.axis === "y" ? sign : 0,
      z: view.axis === "z" ? sign : 0,
    },
    constant: -sign * view.offset,
  };
}

/** Ob dieser Punkt weggeschnitten ist - er liegt auf der verborgenen Seite. */
export function pointIsCutAway(point: SectionPoint, view: Pick<SectionView, "axis" | "offset" | "flipped">) {
  const plane = sectionPlane(view);
  const distance = plane.normal.x * point.x + plane.normal.y * point.y + plane.normal.z * point.z + plane.constant;
  // Genau auf der Ebene zaehlt als sichtbar: Dort liegt die Schnittflaeche,
  // und die soll man anklicken koennen.
  return distance < -1e-6;
}

/**
 * Wie weit die Ebene wandern darf: ueber die Ausdehnung dessen, was im Bild
 * steht, hinaus hat sie nichts mehr zu schneiden.
 *
 * Ein Finger breit Luft an beiden Enden bleibt trotzdem: Steht die Ebene genau
 * auf der Aussenflaeche, ist nicht zu sehen, ob sie schon schneidet oder noch
 * nicht.
 */
export function sectionOffsetLimits(bounds: SectionBounds, axis: SectionAxis) {
  const min = bounds.min[axis];
  const max = bounds.max[axis];
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    return { min: -100, max: 100 };
  }
  const air = Math.max(0.5, (max - min) * 0.02);
  return { min: min - air, max: max + air };
}

export function clampSectionOffset(offset: number, bounds: SectionBounds, axis: SectionAxis) {
  const limits = sectionOffsetLimits(bounds, axis);
  const wanted = Number.isFinite(offset) ? offset : (limits.min + limits.max) / 2;
  return Math.min(limits.max, Math.max(limits.min, wanted));
}

/** Die Mitte dessen, was im Bild steht - die erste Stelle, an der man schneidet. */
export function sectionCentre(bounds: SectionBounds, axis: SectionAxis) {
  const min = bounds.min[axis];
  const max = bounds.max[axis];
  return Number.isFinite(min) && Number.isFinite(max) ? (min + max) / 2 : 0;
}

/**
 * Der Rahmen um mehrere Koerper, aus ihren eigenen Rahmen.
 *
 * Leer kommt ein Rahmen heraus, der nichts einschliesst - `sectionOffsetLimits`
 * faengt das ab und gibt dann einen brauchbaren Bereich.
 */
export function sectionBoundsOf(boxes: ReadonlyArray<SectionBounds>): SectionBounds {
  const bounds: SectionBounds = {
    min: { x: Number.POSITIVE_INFINITY, y: Number.POSITIVE_INFINITY, z: Number.POSITIVE_INFINITY },
    max: { x: Number.NEGATIVE_INFINITY, y: Number.NEGATIVE_INFINITY, z: Number.NEGATIVE_INFINITY },
  };
  boxes.forEach((box) => {
    SECTION_AXES.forEach((axis) => {
      bounds.min[axis] = Math.min(bounds.min[axis], box.min[axis]);
      bounds.max[axis] = Math.max(bounds.max[axis], box.max[axis]);
    });
  });
  return bounds;
}
