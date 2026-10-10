import type { MeasurementAccuracy, WorkplaneWorkspaceSettings } from "@/types/sketchforge";
import { t, type MessageKey } from "@/lib/i18n";

const MILLIMETERS_PER_INCH = 25.4;
const MILLIMETERS_PER_FOOT = 304.8;
const MILLIMETERS_PER_STUD = 8;

type WorkspaceScaleOption = {
  label: string;
  displayLabel: string;
  millimetersPerDisplayUnit: number;
};

const METRIC_SCALE_OPTIONS: WorkspaceScaleOption[] = [
  { label: "1:1 (millimeters)", displayLabel: "mm", millimetersPerDisplayUnit: 1 },
  { label: "1:10 (centimeters)", displayLabel: "cm", millimetersPerDisplayUnit: 10 },
  { label: "1:1000 (meters)", displayLabel: "m", millimetersPerDisplayUnit: 1000 },
];

const IMPERIAL_SCALE_OPTIONS: WorkspaceScaleOption[] = [
  { label: "1:1 (inches)", displayLabel: "in", millimetersPerDisplayUnit: MILLIMETERS_PER_INCH },
  { label: "1:1 (feet)", displayLabel: "ft", millimetersPerDisplayUnit: MILLIMETERS_PER_FOOT },
];

const BRICK_SCALE_OPTIONS: WorkspaceScaleOption[] = [
  { label: "1:1 (studs)", displayLabel: "stud", millimetersPerDisplayUnit: MILLIMETERS_PER_STUD },
];


/**
 * Unit, scale and grid names are stored in the project and compared by value,
 * so the English wording stays put. This maps a stored value to what a person
 * reads.
 */
const OPTION_LABEL_KEYS: Record<string, MessageKey> = {
  "Metric (Default)": "units.metric",
  Imperial: "units.imperial",
  Bricks: "units.bricks",
  "1:1 (millimeters)": "scale.millimeters",
  "1:10 (centimeters)": "scale.centimeters",
  "1:1000 (meters)": "scale.meters",
  "1:1 (inches)": "scale.inches",
  "1:1 (feet)": "scale.feet",
  "1:1 (studs)": "scale.studs",
  Off: "grid.off",
  Brick: "grid.brick",
  Custom: "inspector.custom",
};

export function measurementOptionLabel(option: string): string {
  const key = OPTION_LABEL_KEYS[option];
  return key ? t(key) : option;
}

export const WORKSPACE_UNIT_OPTIONS = ["Metric (Default)", "Imperial", "Bricks"] as const;

export type LengthDisplayUnit = {
  label: string;
  millimetersPerUnit: number;
};

function scaleEntriesForUnits(units: string) {
  if (units === "Imperial") return IMPERIAL_SCALE_OPTIONS;
  if (units === "Bricks") return BRICK_SCALE_OPTIONS;
  return METRIC_SCALE_OPTIONS;
}

export function scaleOptionsForUnits(units: string) {
  return scaleEntriesForUnits(units).map((option) => option.label);
}

export function defaultScaleForUnits(units: string) {
  return scaleEntriesForUnits(units)[0].label;
}

export function normalizeScaleForUnits(units: string, scale: string) {
  const options = scaleEntriesForUnits(units);
  const normalizedScale = units !== "Imperial" && units !== "Bricks" && scale === "1:100 (meters)" ? "1:1000 (meters)" : scale;
  return options.some((option) => option.label === normalizedScale) ? normalizedScale : options[0].label;
}

function scaleEntryForWorkspace(workspace: Pick<WorkplaneWorkspaceSettings, "units" | "scale">) {
  const options = scaleEntriesForUnits(workspace.units);
  const normalizedScale = normalizeScaleForUnits(workspace.units, workspace.scale);
  return options.find((option) => option.label === normalizedScale) ?? options[0];
}

export function lengthDisplayUnit(workspace: Pick<WorkplaneWorkspaceSettings, "units" | "scale">): LengthDisplayUnit {
  const scale = scaleEntryForWorkspace(workspace);
  return { label: scale.displayLabel, millimetersPerUnit: scale.millimetersPerDisplayUnit };
}

export function millimetersToDisplay(value: number, workspace: Pick<WorkplaneWorkspaceSettings, "units" | "scale">) {
  return value / lengthDisplayUnit(workspace).millimetersPerUnit;
}

export function displayToMillimeters(value: number, workspace: Pick<WorkplaneWorkspaceSettings, "units" | "scale">) {
  return value * lengthDisplayUnit(workspace).millimetersPerUnit;
}

export function displayStepFromMillimeters(step: number, workspace: Pick<WorkplaneWorkspaceSettings, "units" | "scale">) {
  return step / lengthDisplayUnit(workspace).millimetersPerUnit;
}

/**
 * Eine einzelne Zahl, mit Punkt oder Komma als Dezimalzeichen.
 *
 * Welches von beiden es ist, entscheidet das letzte: "1.234,5" ist
 * deutsch geschrieben, "1,234.5" englisch. Steht nur ein Komma da, ist es das
 * Dezimalzeichen - "12,5" sind zwoelfeinhalb und nicht zwoelftausendfuenf.
 */
function decimalNumber(token: string) {
  const commaIndex = token.lastIndexOf(",");
  const dotIndex = token.lastIndexOf(".");
  let normalized = token;
  if (commaIndex >= 0 && dotIndex >= 0) {
    normalized = commaIndex > dotIndex
      ? token.replace(/\./g, "").replace(",", ".")
      : token.replace(/,/g, "");
  } else if (commaIndex >= 0) {
    normalized = token.replace(",", ".");
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

type MeasurementToken = { kind: "number"; value: number } | { kind: "symbol"; value: "+" | "-" | "*" | "/" | "(" | ")" };

/**
 * Die Eingabe in Zahlen und Zeichen zerlegt. `null`, wenn etwas darin steht,
 * was in einem Massfeld nichts zu suchen hat - dann behaelt das Feld seinen
 * Wert, statt eine geratene Zahl zu uebernehmen.
 *
 * `x` gilt als Malzeichen: "15x3" ist, wie man eine Groesse von Hand
 * hinschreibt.
 */
function measurementTokens(compact: string): MeasurementToken[] | null {
  const tokens: MeasurementToken[] = [];
  let index = 0;
  while (index < compact.length) {
    const character = compact[index];
    if (/[0-9.,]/.test(character)) {
      let end = index;
      while (end < compact.length && /[0-9.,]/.test(compact[end])) end += 1;
      const value = decimalNumber(compact.slice(index, end));
      if (Number.isNaN(value)) return null;
      tokens.push({ kind: "number", value });
      index = end;
      continue;
    }
    if (character === "x" || character === "X" || character === "*") {
      tokens.push({ kind: "symbol", value: "*" });
    } else if (character === "+" || character === "-" || character === "/" || character === "(" || character === ")") {
      tokens.push({ kind: "symbol", value: character });
    } else {
      return null;
    }
    index += 1;
  }
  return tokens;
}

/**
 * Eine Zahl oder eine Rechnung aus einem Massfeld.
 *
 * Gerechnet wird mit Plus, Minus, Mal (`*` oder `x`), Geteilt und Klammern,
 * nach Punkt-vor-Strich: "120-2*4" sind 112, "(40+2)/2" sind 21. Das ist
 * keine Bequemlichkeit, sondern wie man an einem Teil rechnet - die halbe
 * Breite, drei Loecher auf eine Strecke, zwei Wandstaerken abgezogen.
 *
 * Gerechnet wird von Hand und nicht mit `eval`: Eine Eingabe aus einem
 * Textfeld ist kein Programm, das wir ausfuehren wollen.
 *
 * NaN, wenn die Eingabe keine Rechnung ist - der Aufrufer behaelt dann seinen
 * alten Wert.
 */
export function parseMeasurementInput(value: string | number) {
  if (typeof value === "number") return Number.isFinite(value) ? value : Number.NaN;
  const compact = value.trim().replace(/[\s\u00a0]/g, "");
  if (!compact) return Number.NaN;
  const tokens = measurementTokens(compact);
  if (!tokens || tokens.length === 0) return Number.NaN;

  let position = 0;
  const peek = () => tokens[position];
  const takeSymbol = (...wanted: string[]) => {
    const token = peek();
    if (token && token.kind === "symbol" && wanted.includes(token.value)) {
      position += 1;
      return token.value;
    }
    return null;
  };

  /** Eine Zahl, eine Klammer, oder ein Vorzeichen davor. */
  const readFactor = (): number => {
    const sign = takeSymbol("+", "-");
    if (sign) return sign === "-" ? -readFactor() : readFactor();
    if (takeSymbol("(")) {
      const inner = readSum();
      if (!takeSymbol(")")) return Number.NaN;
      return inner;
    }
    const token = peek();
    if (!token || token.kind !== "number") return Number.NaN;
    position += 1;
    return token.value;
  };

  const readProduct = (): number => {
    let result = readFactor();
    for (let symbol = takeSymbol("*", "/"); symbol; symbol = takeSymbol("*", "/")) {
      const next = readFactor();
      result = symbol === "*" ? result * next : result / next;
    }
    return result;
  };

  function readSum(): number {
    let result = readProduct();
    for (let symbol = takeSymbol("+", "-"); symbol; symbol = takeSymbol("+", "-")) {
      const next = readProduct();
      result = symbol === "+" ? result + next : result - next;
    }
    return result;
  }

  const parsed = readSum();
  // Bleibt etwas uebrig, war die Eingabe keine Rechnung: "12 34" oder "5)".
  if (position !== tokens.length) return Number.NaN;
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export function formatMeasurementNumber(value: number, accuracy: MeasurementAccuracy, _step?: number) {
  let decimals = accuracy;
  while (decimals < 6 && value !== 0 && Math.abs(value) < 0.5 * 10 ** -decimals) {
    decimals += 1;
  }
  const zeroThreshold = 0.5 * 10 ** -decimals;
  return (Math.abs(value) < zeroThreshold ? 0 : value).toFixed(decimals);
}
