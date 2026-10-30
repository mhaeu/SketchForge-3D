import type { WorkplaneShape } from "@/types/sketchforge";

/*
 * Alle Felder einer Gridfinity-Form. Wer eine Form Feld fuer Feld kopiert
 * (sceneShape, der Fingerabdruck der Ansicht), nimmt sie von hier, damit
 * keine Einstellung unterwegs verloren geht.
 */
export const GRIDFINITY_FIELD_KEYS = [
  "gridfinityType",
  "gridfinityLip",
  "gridfinityMagnets",
  "gridfinityHalfGrid",
  "gridfinityLabelBack",
  "gridfinityLabelFront",
  "gridfinityLabelLeft",
  "gridfinityLabelRight",
  "gridfinityLabelBackWidth",
  "gridfinityLabelBackLength",
  "gridfinityLabelBackOffset",
  "gridfinityLabelFrontWidth",
  "gridfinityLabelFrontLength",
  "gridfinityLabelFrontOffset",
  "gridfinityLabelLeftWidth",
  "gridfinityLabelLeftLength",
  "gridfinityLabelLeftOffset",
  "gridfinityLabelRightWidth",
  "gridfinityLabelRightLength",
  "gridfinityLabelRightOffset",
  "gridfinityLabelCorner",
  "gridfinityLabelCornerSize",
  "gridfinityScoopBack",
  "gridfinityScoopFront",
  "gridfinityScoopLeft",
  "gridfinityScoopRight",
  "gridfinityScoopRadius",
  "gridfinityFloorHeight",
  "gridfinityOpenBack",
  "gridfinityOpenFront",
  "gridfinityOpenLeft",
  "gridfinityOpenRight",
  "gridfinityLipChamfer",
  "gridfinityWallThickness",
  "gridfinityPaddingBack",
  "gridfinityPaddingFront",
  "gridfinityPaddingLeft",
  "gridfinityPaddingRight",
  "gridfinityCornerRadius",
  "gridfinityBinCornerRadius",
  "gridfinityCompartmentsX",
  "gridfinityCompartmentsZ",
  "gridfinityDividerThickness",
  "gridfinityDividerPositionsX",
  "gridfinityDividerPositionsZ",
  "gridfinityCompartmentLabels",
  "gridfinityOpenings",
  "gridfinityOpeningCorner",
  "gridfinityOpeningCornerSize",
] as const satisfies ReadonlyArray<keyof WorkplaneShape>;

export type GridfinityFieldKey = (typeof GRIDFINITY_FIELD_KEYS)[number];

export function pickGridfinityFields(shape: Partial<WorkplaneShape>): Partial<Pick<WorkplaneShape, GridfinityFieldKey>> {
  const picked: Partial<Record<GridfinityFieldKey, unknown>> = {};
  for (const key of GRIDFINITY_FIELD_KEYS) if (shape[key] !== undefined) picked[key] = shape[key];
  return picked as Partial<Pick<WorkplaneShape, GridfinityFieldKey>>;
}
