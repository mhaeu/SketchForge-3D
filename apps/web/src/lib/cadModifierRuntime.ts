import type { CadModifierDeflection, CadModifierEdge, CadModifierQuality } from "@/lib/cadModifierTypes";
import { t } from "@/lib/i18n";

export const CAD_MODIFIER_RUNTIME_BASE = "/occt";

/**
 * Die Abweichung, mit der eine Skizze das eine Mal vernetzt wird, wenn aus ihr
 * ein Koerper entsteht (sketchCad.worker.ts). Kantenbearbeitungen danach
 * nehmen diesen Wert als Untergrenze mit, damit eine spaetere Verrundung mit
 * groesserem Halbmesser keine Stelle groeber nachvernetzt, die die Skizze
 * selbst schon feiner gebraucht hat.
 */
export const SKETCH_CAD_DEFLECTION: CadModifierDeflection = { linear: 0.05, angular: 0.16 };

/** Wie fein eine einzelne Kantenbearbeitung den ganzen Koerper vernetzt - ohne Untergrenze. */
export function cadModifierBaseDeflection(quality: CadModifierQuality, amount: number): CadModifierDeflection {
  if (quality === "draft") return { linear: Math.max(0.12, amount / 3), angular: 0.42 };
  if (quality === "fine") return { linear: Math.max(0.025, amount / 12), angular: 0.1 };
  return { linear: Math.max(0.055, amount / 7), angular: 0.2 };
}

/**
 * Ein Koerper merkt sich die feinste Vernetzung, die eine seiner bisherigen
 * Kantenbearbeitungen gebraucht hat. Ohne diese Untergrenze sucht sich eine
 * spaetere Verrundung mit groesserem Halbmesser eine groebere Abweichung fuer
 * den GANZEN Koerper und tastet eine laengst fein gerundete Stelle neu ab -
 * das sind die Wellen im Netz, die nach mehreren Verrundungen nacheinander
 * auftauchen.
 */
export function cadModifierTessellationDeflection(
  quality: CadModifierQuality,
  amount: number,
  minDeflection?: CadModifierDeflection,
): CadModifierDeflection {
  const base = cadModifierBaseDeflection(quality, amount);
  if (!minDeflection) return base;
  return {
    linear: Math.min(base.linear, minDeflection.linear),
    angular: Math.min(base.angular, minDeflection.angular),
  };
}
export const CAD_MODIFIER_REQUEST_TIMEOUT_MS = 30_000;
export const CAD_MODIFIER_MAX_PREPARE_TIMEOUT_MS = 180_000;
export const CAD_MODIFIER_MAX_SHARP_ANGLE = 90;

export type CadModifierRequestPhase = "prepare" | "preview";

export function cadTransformRequiresGeneralTransform(transform: number[]) {
  if (transform.length !== 12 || !transform.every(Number.isFinite)) {
    return false;
  }

  const x = [transform[0], transform[4], transform[8]];
  const y = [transform[1], transform[5], transform[9]];
  const z = [transform[2], transform[6], transform[10]];
  const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const xLengthSquared = dot(x, x);
  const yLengthSquared = dot(y, y);
  const zLengthSquared = dot(z, z);
  const scaleSquared = Math.max(xLengthSquared, yLengthSquared, zLengthSquared);
  if (scaleSquared <= 1e-18) {
    return true;
  }

  const tolerance = scaleSquared * 1e-9;
  return (
    Math.abs(dot(x, y)) > tolerance ||
    Math.abs(dot(x, z)) > tolerance ||
    Math.abs(dot(y, z)) > tolerance ||
    Math.abs(xLengthSquared - yLengthSquared) > tolerance ||
    Math.abs(xLengthSquared - zLengthSquared) > tolerance ||
    Math.abs(yLengthSquared - zLengthSquared) > tolerance
  );
}

export function isCadModifierWasmMemoryFault(message: string, errorName = "") {
  return (
    /memory access out of bounds|out of bounds memory access|\babort(?:ed)?\b/i.test(message) ||
    /^(?:WebAssembly\.)?RuntimeError$/i.test(errorName)
  );
}

export function defaultCadModifierTangentChain(appliedFeatureCount: number) {
  return appliedFeatureCount === 0;
}

export function cadModifierTopologyEdgeIsSelectable(
  edge: Pick<CadModifierEdge, "manifold" | "boundary" | "points">,
) {
  return edge.manifold && !edge.boundary && edge.points.length >= 6;
}

export function selectableCadModifierEdge(
  edge: Pick<CadModifierEdge, "display" | "selectable" | "manifold" | "boundary" | "angle">,
  sharpAngle: number,
) {
  return edge.selectable && edge.manifold && !edge.boundary && edge.angle + 1e-3 >= sharpAngle;
}

/**
 * Dieselbe Kante, ohne die Schwelle: jede, die sich grundsaetzlich bearbeiten
 * laesst - unabhaengig davon, ob der Schieberegler sie gerade zeigt. So bleibt
 * eine feinere Kante im Bild sicht- und anklickbar, statt bis zum Verschieben
 * des Reglers unsichtbar zu sein.
 */
export function cadModifierCandidateEdge(
  edge: Pick<CadModifierEdge, "selectable" | "manifold" | "boundary">,
) {
  return edge.selectable && edge.manifold && !edge.boundary;
}

export function edgeModifierSelectionStatus(prepared: boolean, selectedCount: number, availableCount: number) {
  return prepared
    ? t("edge.selectionStatus", { selected: selectedCount, available: availableCount })
    : t("edge.preparing");
}

export function cadModifierPrepareTimeoutMs(meshTriangleCount: number) {
  if (!Number.isFinite(meshTriangleCount) || meshTriangleCount <= 0) {
    return CAD_MODIFIER_REQUEST_TIMEOUT_MS;
  }
  const normalizedTriangleCount = Math.max(0, Math.floor(meshTriangleCount));
  const meshPreparationBudget = 45_000 + normalizedTriangleCount * 0.75;
  return Math.min(
    CAD_MODIFIER_MAX_PREPARE_TIMEOUT_MS,
    Math.max(60_000, Math.ceil(meshPreparationBudget)),
  );
}

export function cadModifierTimeoutMessage(phase: CadModifierRequestPhase) {
  if (phase === "preview") {
    return "The edge preview timed out. Cancel the tool and try again.";
  }
  return "Edge preparation timed out. This mesh needs more CAD processing than the interactive limit allows. Try a repaired or lower-detail STL.";
}

export function cadModifierWorkerFailureMessage() {
  return "The CAD worker could not start. Update to Firefox 121+, Chrome/Brave 114+, or Safari 17.2+, then try again.";
}


/**
 * Start- und Endradius für den variablen Fillet. flipTaper vertauscht sie, weil
 * die Laufrichtung einer Kante aus der OCCT-Parametrisierung stammt und in der
 * Oberfläche nicht sichtbar ist.
 *
 * In cadModifierRuntime, weil Worker (Anwendung) und UI (Vorschau/Anzeige) es
 * teilen und es hier isoliert testbar ist.
 */
export function variableFilletRadii(params: { amount: number; endAmount: number; flipTaper: boolean }) {
  return params.flipTaper
    ? { startRadius: params.endAmount, endRadius: params.amount }
    : { startRadius: params.amount, endRadius: params.endAmount };
}

/**
 * Der variable Fillet arbeitet auf genau einer Kante: OCCTs filletVariable
 * liefert einen neuen Koerper, wodurch die Verweise weiterer Kanten ungueltig
 * wuerden. Diese Pruefung teilen Worker und UI, damit Ablehnung und
 * Button-Sperre dieselbe Regel benutzen.
 */
export function variableFilletRejectsMultiEdge(selectedCount: number) {
  return selectedCount > 1;
}
