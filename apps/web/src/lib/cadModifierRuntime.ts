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

/**
 * Wie fein eine einzelne Kantenbearbeitung den ganzen Koerper vernetzt.
 *
 * Die zulaessige Abweichung ist nach **oben** begrenzt, nicht nach unten. Das
 * war vorher andersherum, und daran lag ein sichtbarer Fehler: Je groesser
 * der Halbmesser, desto groeber durfte das Netz werden - eine Verrundung von
 * zehn Millimetern kam facettiert heraus, waehrend die von einem Millimeter
 * daneben glatt war. Umgekehrt ist es richtig: Ein grosser Halbmesser darf
 * nie gruober werden als die Obergrenze, ein kleiner geht darunter, damit
 * feine Stellen aufgeloest werden.
 */
export function cadModifierBaseDeflection(quality: CadModifierQuality, amount: number): CadModifierDeflection {
  const safeAmount = Math.max(0.01, Number.isFinite(amount) ? amount : 1);
  if (quality === "draft") return { linear: Math.min(0.12, Math.max(0.03, safeAmount / 10)), angular: 0.35 };
  if (quality === "fine") return { linear: Math.min(0.025, Math.max(0.005, safeAmount / 40)), angular: 0.1 };
  return { linear: Math.min(0.05, Math.max(0.01, safeAmount / 20)), angular: 0.16 };
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

/**
 * Nach genug Kantenarbeit in einer Sitzung weigert sich der Kern, ein
 * gespeichertes B-Rep noch einmal zu lesen - dieselbe Zeichenkette, die er eben
 * noch verstanden hat. Der Dienst baut ihn dann ab; der naechste Anlauf bekommt
 * einen frischen und kommt durch. Diese Meldung ist das Signal dafuer.
 */
export const CAD_MODIFIER_KERNEL_RESTART_MESSAGE =
  "The CAD kernel ran out of room and was restarted. Wait a moment, then start the edge tool again; no page refresh is needed.";

/**
 * Eine Ausnahme aus dem WebAssembly heraus heisst: nicht dieser eine Aufruf ist
 * schiefgegangen, sondern der Kern selbst kann nicht mehr. Ein gescheitertes
 * Verrunden - "dieser Halbmesser passt hier nicht" - kommt dagegen als
 * gewoehnliche Meldung und darf den Kern nicht kosten.
 */
export function isCadModifierKernelExhausted(message: string, errorName = "") {
  return message.includes("WebAssembly.Exception") || isCadModifierWasmMemoryFault(message, errorName);
}

export function isCadModifierWasmMemoryFault(message: string, errorName = "") {
  return (
    /memory access out of bounds|out of bounds memory access|\babort(?:ed)?\b/i.test(message) ||
    /^(?:WebAssembly\.)?RuntimeError$/i.test(errorName)
  );
}

/**
 * Jede Kante bringt ihren Winkel mit; die Schwelle filtert erst im Browser.
 * Bleibt bei der Voreinstellung nichts uebrig, steht man vor einem Werkzeug,
 * das nichts hervorhebt und nichts sagt - dabei ist bekannt, wie scharf die
 * schaerfste Kante hier ueberhaupt ist. Genau dorthin darf die Schwelle
 * rutschen. Nur eine tangentiale Kante (fast 0 Grad) ist keine, die man
 * verrunden will.
 */
export function rescueSharpAngleForEdges(
  edges: Pick<CadModifierEdge, "angle" | "manifold" | "boundary" | "selectable">[],
  sharpAngle: number,
) {
  const usable = edges.filter((edge) => edge.selectable && edge.manifold && !edge.boundary);
  if (usable.some((edge) => edge.angle + 1e-3 >= sharpAngle)) return null;
  const sharpest = usable.reduce((largest, edge) => Math.max(largest, edge.angle), 0);
  if (sharpest < 1) return null;
  return Math.max(1, Math.floor(sharpest));
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
