/**
 * printEstimate.ts
 *
 * Wie viel Material ein Druck braucht, wenn er massiv gedruckt wird: Volumen,
 * Gewicht und Filamentlaenge.
 *
 * Es ist eine Obergrenze und keine Vorhersage: Der Schneider druckt mit Waenden
 * und Fuellung und braucht darum weniger - dafuer kommen Stuetzen und Floss
 * dazu, die hier fehlen. Zum Vergleichen zweier Entwuerfe und zum Abschaetzen,
 * ob die Rolle reicht, taugt die Zahl trotzdem.
 *
 * Nach Layerling 1.33.0.
 */

export const PRINT_MATERIALS = ["pla", "petg", "abs", "asa", "tpu", "pa"] as const;
export type PrintMaterial = (typeof PRINT_MATERIALS)[number];

/** Dichte in g/cm3, uebliche Herstellerangaben. */
export const PRINT_MATERIAL_DENSITY: Record<PrintMaterial, number> = {
  pla: 1.24,
  petg: 1.27,
  abs: 1.04,
  asa: 1.07,
  tpu: 1.21,
  pa: 1.14,
};

export const DEFAULT_PRINT_MATERIAL: PrintMaterial = "pla";

/** Der uebliche Durchmesser; 2,85 mm kommt in Schreibtischdruckern kaum vor. */
export const FILAMENT_DIAMETER_MM = 1.75;

export function normalizePrintMaterial(value: unknown): PrintMaterial {
  return typeof value === "string" && (PRINT_MATERIALS as readonly string[]).includes(value)
    ? value as PrintMaterial
    : DEFAULT_PRINT_MATERIAL;
}

export type PrintEstimate = {
  material: PrintMaterial;
  volumeMm3: number;
  volumeCm3: number;
  grams: number;
  filamentMeters: number;
};

export function printEstimate(volumeMm3: number, material: PrintMaterial = DEFAULT_PRINT_MATERIAL): PrintEstimate {
  const volume = Math.max(0, Number.isFinite(volumeMm3) ? volumeMm3 : 0);
  const volumeCm3 = volume / 1000;
  const radius = FILAMENT_DIAMETER_MM / 2;
  return {
    material,
    volumeMm3: volume,
    volumeCm3,
    // Ein Kubikzentimeter ist ein Milliliter, und die Dichte steht in g/cm3.
    grams: volumeCm3 * PRINT_MATERIAL_DENSITY[material],
    // Der Faden ist ein Zylinder: Volumen durch Querschnitt gibt seine Laenge.
    filamentMeters: volume / (Math.PI * radius * radius) / 1000,
  };
}
