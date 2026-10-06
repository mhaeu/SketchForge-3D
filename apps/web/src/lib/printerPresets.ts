/**
 * printerPresets.ts
 *
 * Den Drucker auswaehlen, statt seine Masse abzutippen.
 *
 * Die Zahlen selbst stehen in `printerPresets.generated.ts` und kommen aus den
 * Druckerprofilen von OrcaSlicer - denselben, mit denen der Entwurf spaeter
 * geschnitten wird. Hier steht nur, wie man eines davon wiederfindet.
 *
 * Nach Layerling 1.35.0.
 */

import { clampBuildHeight } from "@/lib/buildVolume";
import { PRINTER_PRESETS, type PrinterPreset } from "@/lib/printerPresets.generated";

export { PRINTER_PRESETS, PRINTER_PRESETS_SOURCE } from "@/lib/printerPresets.generated";
export type { PrinterPreset } from "@/lib/printerPresets.generated";

/** Die Hersteller in der Reihenfolge, in der ihre Geraete in der Liste stehen. */
export const PRINTER_VENDORS: readonly string[] = [...new Set(PRINTER_PRESETS.map((preset) => preset.vendor))];

export function printerPresetById(id: string | undefined | null): PrinterPreset | null {
  if (!id) return null;
  return PRINTER_PRESETS.find((preset) => preset.id === id) ?? null;
}

/**
 * Nur eine Kennung, die es wirklich gibt, bleibt stehen.
 *
 * Ein Projekt kann mit einem Drucker gespeichert worden sein, den eine spaetere
 * Liste nicht mehr fuehrt - dann steht dort wieder nichts, und die Masse der
 * Arbeitsebene bleiben, wie sie sind. Sie sind ohnehin mitgespeichert.
 */
export function normalizePrinterId(value: unknown): string {
  return typeof value === "string" && printerPresetById(value) ? value : "";
}

/**
 * Was die Wahl eines Druckers an den Einstellungen aendert.
 *
 * Alle drei Masse zusammen: Platte und Bauhoehe gehoeren zum selben Geraet,
 * und wer sein Geraet auswaehlt, will die Hoehe nicht nachtragen. Die
 * Plattengroesse heisst danach "Custom" - sie ist keiner unserer runden
 * Vorgabewerte mehr.
 *
 * Ohne Geraet ("Eigene Masse") wird *nur* die Kennung geleert: Die Masse, die
 * dastehen, bleiben stehen. Sie zurueckzusetzen wuerde eine Arbeitsebene
 * zerstoeren, die vielleicht von Hand eingetragen wurde.
 */
export function workspaceForPrinter(id: string | undefined | null) {
  const printer = printerPresetById(id);
  if (!printer) return { printer: "" };
  return {
    printer: printer.id,
    width: printer.width,
    depth: printer.depth,
    buildHeight: clampBuildHeight(printer.height),
    sizePreset: "Custom",
  };
}
