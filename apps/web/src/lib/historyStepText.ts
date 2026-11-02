import { t, translate, type Language } from "@/lib/i18n";
import type { HistoryStepDescription, HistoryStepDetail } from "@/lib/historyStepDescription";
import type { LengthDisplayUnit } from "@/lib/measurementUnits";

/*
 * A step of the history as one line: its sentence and, where it set a measure, that measure in
 * brackets - "Rounded the edges of Box (5 mm)". The History view and the AI tools read it this way.
 * Nach Layerling; die Einheit kommt hier von den Arbeitsflaechen-Einstellungen.
 */

const MILLIMETRES: LengthDisplayUnit = { label: "mm", millimetersPerUnit: 1 };

/** A decimal without the zeros a fixed accuracy pads it with: 5.00 is 5, 2.50 is 2.5. */
function trimmed(value: string) {
  return /^-?\d+\.\d+$/.test(value) ? value.replace(/\.?0+$/, "") : value;
}

/** The measure in the given unit, millimetres when none is given. */
export function historyStepDetailText(detail: HistoryStepDetail, accuracy: number, unit: LengthDisplayUnit = MILLIMETRES): string {
  const length = (mm: number) => trimmed((mm / unit.millimetersPerUnit).toFixed(accuracy));
  if (detail.kind === "angle") return `${trimmed(detail.degrees.toFixed(Math.min(accuracy, 2)))}°`;
  if (detail.kind === "length") return `${length(detail.mm)} ${unit.label}`;
  return `${detail.mm.map(length).join(" × ")} ${unit.label}`;
}

/** The step in the interface's language, with its measure. */
export function historyStepText(step: HistoryStepDescription, accuracy: number, unit?: LengthDisplayUnit): string {
  const sentence = t(step.key, step.values);
  return step.detail ? `${sentence} (${historyStepDetailText(step.detail, accuracy, unit)})` : sentence;
}

/** The step in one language with its measure in millimetres, as AI tools read it. */
export function historyStepTextIn(language: Language, step: HistoryStepDescription): string {
  const sentence = translate(language, step.key, step.values);
  return step.detail ? `${sentence} (${historyStepDetailText(step.detail, 2)})` : sentence;
}
