"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { useLanguage } from "@/lib/useLanguage";
import { selectWholeValue } from "@/lib/numberField";
import {
  displayStepFromMillimeters,
  displayToMillimeters,
  formatMeasurementNumber,
  lengthDisplayUnit,
  millimetersToDisplay,
  parseMeasurementInput,
} from "@/lib/measurementUnits";
import type { WorkplaneWorkspaceSettings } from "@/types/sketchforge";

/**
 * Ein Regler mit Zahlenfeld, wie ihn die schwebenden Werkzeugfelder brauchen.
 *
 * Stand erst im Teilen-Feld und wird jetzt auch vom Aneinanderlegen gebraucht.
 * Zwei Abschriften waeren zwei Stellen zum Pflegen - und der Regler ist nicht
 * wenig: Anzeigeeinheit, Zahlenfeld mit eigenem Entwurf, Eingabe in
 * Millimeter zurueck, Grenzen, und die Reglerstellung als CSS-Wert.
 *
 * `children` sitzt neben der Einheit: dort steht beim Teilen der Knopf, mit
 * dem man die Ebene auf eine Flaeche legt.
 */
function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function ToolPanelSlider({
  label,
  value,
  min,
  max,
  step,
  unit,
  workspace,
  length = false,
  disabled = false,
  children,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  workspace: WorkplaneWorkspaceSettings;
  length?: boolean;
  disabled?: boolean;
  children?: ReactNode;
  onChange: (value: number) => void;
}) {
  const toDisplay = (millimetres: number) => (length ? millimetersToDisplay(millimetres, workspace) : millimetres);
  const toModel = (shown: number) => (length ? displayToMillimeters(shown, workspace) : shown);
  const shown = toDisplay(value);
  const shownMin = toDisplay(min);
  const shownMax = toDisplay(max);
  const shownStep = length ? displayStepFromMillimeters(step, workspace) : step;
  const position = ((clamp(shown, shownMin, shownMax) - shownMin) / Math.max(Number.EPSILON, shownMax - shownMin)) * 100;
  const text = formatMeasurementNumber(shown, workspace.accuracy, shownStep);
  useLanguage();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  useEffect(() => {
    if (!editing) setDraft(text);
  }, [editing, text]);
  return (
    <label className="edge-modifier-field edge-modifier-slider range-property" style={{ "--slider-pos": `${position}%` } as CSSProperties}>
      <span className="range-property-header">
        <span className="range-property-name">{label}</span>
        <span className="range-value-control">
          <input
            type="text"
            inputMode="decimal"
            value={editing ? draft : text}
            disabled={disabled}
            onFocus={(event) => { setDraft(text); setEditing(true); selectWholeValue(event.currentTarget); }}
            onChange={(event) => setDraft(event.currentTarget.value)}
            onBlur={() => {
              const parsed = parseMeasurementInput(draft);
              onChange(clamp(toModel(Number.isFinite(parsed) ? parsed : shown), min, max));
              setEditing(false);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") { setDraft(text); setEditing(false); }
            }}
          />
          {unit ? <span className="range-value-unit">{unit}</span> : (length ? <span className="range-value-unit">{lengthDisplayUnit(workspace).label}</span> : null)}
          {children}
        </span>
      </span>
      <div className="range-control">
        <input
          type="range"
          min={shownMin}
          max={shownMax}
          step={shownStep}
          value={clamp(shown, shownMin, shownMax)}
          disabled={disabled}
          onChange={(event) => onChange(clamp(toModel(Number(event.currentTarget.value)), min, max))}
        />
      </div>
    </label>
  );
}

