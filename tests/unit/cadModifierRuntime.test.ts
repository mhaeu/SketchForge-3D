import { describe, expect, it } from "vitest";
import {
  CAD_MODIFIER_MAX_SHARP_ANGLE,
  CAD_MODIFIER_MAX_PREPARE_TIMEOUT_MS,
  CAD_MODIFIER_REQUEST_TIMEOUT_MS,
  CAD_MODIFIER_RUNTIME_BASE,
  cadModifierBaseDeflection,
  cadModifierCandidateEdge,
  cadModifierPrepareTimeoutMs,
  cadModifierTessellationDeflection,
  isCadModifierKernelExhausted,
  rescueSharpAngleForEdges,
  SKETCH_CAD_DEFLECTION,
  cadModifierTopologyEdgeIsSelectable,
  cadTransformRequiresGeneralTransform,
  cadModifierTimeoutMessage,
  defaultCadModifierTangentChain,
  edgeModifierSelectionStatus,
  isCadModifierWasmMemoryFault,
  selectableCadModifierEdge,
} from "@/lib/cadModifierRuntime";

describe("CAD modifier runtime state", () => {
  it("uses the build-managed OCCT runtime", () => {
    expect(CAD_MODIFIER_RUNTIME_BASE).toBe("/occt");
  });

  it("does not report zero edges before preparation finishes", () => {
    expect(edgeModifierSelectionStatus(false, 0, 0)).toBe("Preparing edges\u2026");
    expect(edgeModifierSelectionStatus(true, 0, 0)).toBe("0 of 0 sharp edges selected");
    expect(edgeModifierSelectionStatus(true, 2, 12)).toBe("2 of 12 sharp edges selected");
  });

  it("keeps exact CAD preparation short and gives imported meshes a bounded triangle-aware budget", () => {
    expect(CAD_MODIFIER_REQUEST_TIMEOUT_MS).toBeGreaterThanOrEqual(20_000);
    expect(CAD_MODIFIER_REQUEST_TIMEOUT_MS).toBeLessThanOrEqual(60_000);
    expect(cadModifierPrepareTimeoutMs(0)).toBe(CAD_MODIFIER_REQUEST_TIMEOUT_MS);
    expect(cadModifierPrepareTimeoutMs(Number.NaN)).toBe(CAD_MODIFIER_REQUEST_TIMEOUT_MS);
    expect(cadModifierPrepareTimeoutMs(10_000)).toBe(60_000);
    expect(cadModifierPrepareTimeoutMs(100_000)).toBe(120_000);
    expect(cadModifierPrepareTimeoutMs(180_000)).toBe(CAD_MODIFIER_MAX_PREPARE_TIMEOUT_MS);
    expect(cadModifierTimeoutMessage("prepare")).toContain("lower-detail STL");
    expect(cadModifierTimeoutMessage("prepare")).not.toContain("Firefox");
  });

  it("does not expose thresholds above the worker's folded edge-angle range", () => {
    expect(CAD_MODIFIER_MAX_SHARP_ANGLE).toBe(90);
  });

  it("recognizes browser-specific WebAssembly memory fault messages", () => {
    expect(isCadModifierWasmMemoryFault("toBREP: memory access out of bounds")).toBe(true);
    expect(isCadModifierWasmMemoryFault("toBREP: Out of bounds memory access (evaluating 'func(...args)')")).toBe(true);
    expect(isCadModifierWasmMemoryFault("Unreachable code reached", "RuntimeError")).toBe(true);
    expect(isCadModifierWasmMemoryFault("The selected edges cannot be filleted together", "Error")).toBe(false);
    expect(isCadModifierWasmMemoryFault("fillet: [object WebAssembly.Exception]", "OcctError")).toBe(false);
    expect(isCadModifierWasmMemoryFault("fillet: wasm exception", "OcctError")).toBe(false);
  });

  it("routes rotated non-uniform resize transforms through OCCT's general transform", () => {
    const angle = Math.PI / 4;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    const rotatedNonUniformResize = [
      2 * cosine, 0, 2 * sine, 12,
      0, 1, 0, 4,
      -sine, 0, cosine, -8,
    ];
    const rigidRotation = [
      cosine, 0, sine, 12,
      0, 1, 0, 4,
      -sine, 0, cosine, -8,
    ];

    expect(cadTransformRequiresGeneralTransform(rotatedNonUniformResize)).toBe(true);
    expect(cadTransformRequiresGeneralTransform(rigidRotation)).toBe(false);
  });

  it("does not auto-chain newly created edges after an applied edge treatment", () => {
    expect(defaultCadModifierTangentChain(0)).toBe(true);
    expect(defaultCadModifierTangentChain(1)).toBe(false);
    expect(defaultCadModifierTangentChain(2)).toBe(false);
  });

  it("keeps valid post-treatment edges selectable when normal outline display suppresses them", () => {
    const hiddenDetailEdge = {
      display: false,
      selectable: true,
      manifold: true,
      boundary: false,
      angle: 45,
      points: [0, 0, 0, 1, 0, 0],
    };

    expect(cadModifierTopologyEdgeIsSelectable(hiddenDetailEdge)).toBe(true);
    expect(selectableCadModifierEdge(hiddenDetailEdge, 25)).toBe(true);
    expect(selectableCadModifierEdge(hiddenDetailEdge, 60)).toBe(false);
  });
});

/**
 * Ein Koerper merkt sich die feinste Vernetzung, die eine seiner
 * Kantenbearbeitungen gebraucht hat. Ohne diese Untergrenze taste eine
 * spaetere Verrundung mit groesserem Halbmesser den ganzen Koerper groeber ab
 * als zuvor - im Netz sieht man das als Wellen.
 */
describe("tessellation deflection", () => {
  it("gets finer with the quality and with a smaller radius", () => {
    expect(cadModifierBaseDeflection("draft", 6).linear).toBeGreaterThan(cadModifierBaseDeflection("standard", 6).linear);
    expect(cadModifierBaseDeflection("standard", 6).linear).toBeGreaterThan(cadModifierBaseDeflection("fine", 6).linear);
    // Ein kleinerer Halbmesser loest feiner auf, solange er unter der
    // Obergrenze bleibt.
    expect(cadModifierBaseDeflection("fine", 0.4).linear).toBeLessThan(cadModifierBaseDeflection("fine", 0.8).linear);
    expect(cadModifierBaseDeflection("standard", 0.4).linear).toBeLessThan(cadModifierBaseDeflection("standard", 0.8).linear);
  });

  it("wird bei einem grossen Halbmesser nicht grober als die Obergrenze", () => {
    /*
     * Frueher stand hier eine Untergrenze statt einer Obergrenze: Je groesser
     * der Halbmesser, desto groeber durfte das Netz werden. Eine Verrundung
     * von zehn Millimetern kam facettiert heraus, waehrend die von einem
     * Millimeter daneben glatt war.
     */
    expect(cadModifierBaseDeflection("fine", 40).linear).toBeCloseTo(0.025, 9);
    expect(cadModifierBaseDeflection("standard", 40).linear).toBeCloseTo(0.05, 9);
    expect(cadModifierBaseDeflection("draft", 40).linear).toBeCloseTo(0.12, 9);
    // Und auch nicht feiner, als noch sinnvoll zu rechnen ist.
    expect(cadModifierBaseDeflection("fine", 0.0001).linear).toBeCloseTo(0.005, 9);
  });

  it("never gets coarser than what the body already needed", () => {
    const fine = cadModifierTessellationDeflection("fine", 1);
    const laterCoarse = cadModifierTessellationDeflection("standard", 6, fine);
    expect(laterCoarse.linear).toBeLessThanOrEqual(fine.linear);
    expect(laterCoarse.angular).toBeLessThanOrEqual(fine.angular);
    // Ohne Vorgeschichte bleibt es bei dem, was dieser Durchgang selbst waehlt.
    expect(cadModifierTessellationDeflection("standard", 6)).toEqual(cadModifierBaseDeflection("standard", 6));
  });

  it("still lets a later pass go finer", () => {
    const coarse = cadModifierTessellationDeflection("draft", 6);
    const later = cadModifierTessellationDeflection("fine", 1, coarse);
    expect(later.linear).toBeLessThan(coarse.linear);
  });

  it("starts a sketch body at the fineness the sketch itself was built with", () => {
    const afterFillet = cadModifierTessellationDeflection("standard", 6, SKETCH_CAD_DEFLECTION);
    expect(afterFillet.linear).toBeLessThanOrEqual(SKETCH_CAD_DEFLECTION.linear);
  });
});

/**
 * Eine Kante unterhalb der eingestellten Schwelle war frueher weder zu sehen
 * noch anzuklicken - der Klick verfiel stumm, bis man den Schieberegler von
 * Hand bewegte. Sie bleibt jetzt sichtbar (gedaempft) und waehlbar.
 */
describe("edges below the sharp-angle threshold", () => {
  const edge = (angle: number, extra: Partial<{ selectable: boolean; manifold: boolean; boundary: boolean }> = {}) => ({
    angle,
    selectable: true,
    manifold: true,
    boundary: false,
    ...extra,
  });

  it("counts every edge that could be treated at all", () => {
    expect(cadModifierCandidateEdge(edge(5))).toBe(true);
    expect(cadModifierCandidateEdge(edge(80))).toBe(true);
    expect(cadModifierCandidateEdge(edge(80, { selectable: false }))).toBe(false);
    expect(cadModifierCandidateEdge(edge(80, { manifold: false }))).toBe(false);
    expect(cadModifierCandidateEdge(edge(80, { boundary: true }))).toBe(false);
  });

  it("is wider than what the threshold currently shows", () => {
    const shallow = edge(12);
    expect(selectableCadModifierEdge(shallow, 30)).toBe(false);
    expect(cadModifierCandidateEdge(shallow)).toBe(true);
    // Ein Klick senkt die Schwelle auf den Winkel der Kante - danach zaehlt sie.
    const lowered = Math.max(1, Math.min(30, Math.floor(shallow.angle)));
    expect(selectableCadModifierEdge(shallow, lowered)).toBe(true);
  });
});

/**
 * Wenn bei der eingestellten Schwelle keine Kante uebrig bleibt, stand man vor
 * einem Werkzeug, das nichts hervorhebt und nichts sagt - dabei ist bekannt,
 * wie scharf die schaerfste Kante des Koerpers ist.
 */
describe("rescueSharpAngleForEdges", () => {
  const edge = (angle: number, extra: Partial<{ selectable: boolean; manifold: boolean; boundary: boolean }> = {}) => ({
    angle,
    selectable: true,
    manifold: true,
    boundary: false,
    ...extra,
  });

  it("laesst die Schwelle stehen, wenn eine Kante sie erreicht", () => {
    expect(rescueSharpAngleForEdges([edge(12), edge(40)], 25)).toBeNull();
  });

  it("senkt sie auf die schaerfste vorhandene Kante", () => {
    expect(rescueSharpAngleForEdges([edge(12), edge(18.7)], 25)).toBe(18);
  });

  it("zaehlt nur Kanten, die sich ueberhaupt bearbeiten lassen", () => {
    expect(rescueSharpAngleForEdges([edge(40, { boundary: true }), edge(9)], 25)).toBe(9);
    expect(rescueSharpAngleForEdges([edge(40, { manifold: false }), edge(40, { selectable: false })], 25)).toBeNull();
  });

  it("rettet nichts an einer tangentialen Kante", () => {
    // Fast null Grad ist keine Kante, die jemand verrunden will.
    expect(rescueSharpAngleForEdges([edge(0.4)], 25)).toBeNull();
    expect(rescueSharpAngleForEdges([], 25)).toBeNull();
  });
});

/**
 * Eine Ausnahme aus dem WebAssembly heraus heisst: der Kern selbst kann nicht
 * mehr. Ein gescheitertes Verrunden meldet sich dagegen woertlich und darf ihn
 * nicht kosten.
 */
describe("isCadModifierKernelExhausted", () => {
  it("erkennt eine Ausnahme aus dem WebAssembly", () => {
    expect(isCadModifierKernelExhausted("WebAssembly.Exception: tag 3")).toBe(true);
  });

  it("erkennt auch den Speicherfehler", () => {
    expect(isCadModifierKernelExhausted("memory access out of bounds")).toBe(true);
    expect(isCadModifierKernelExhausted("", "RuntimeError")).toBe(true);
  });

  it("laesst eine gewoehnliche Absage in Ruhe", () => {
    expect(isCadModifierKernelExhausted("fillet: radius too large for this edge")).toBe(false);
    expect(isCadModifierKernelExhausted("The chosen size creates invalid or overlapping edge geometry")).toBe(false);
  });
});
