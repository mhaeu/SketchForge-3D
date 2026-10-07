"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { MousePointerClick, X } from "lucide-react";
import { t } from "@/lib/i18n";
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
import { SPLIT_AXIS_DISPLAY_ORDER, splitAxisLabel, splitRotationAxes, type SplitRotation } from "@/lib/modelSplit";
import type { AlignAxis, WorkplaneWorkspaceSettings } from "@/types/sketchforge";

/**
 * Das Bedienfeld fuer das Teilen.
 *
 * Aussehen und Klassennamen kommen vom Kantenfeld, wie beim Muster: Es ist
 * dasselbe schwebende Werkzeugfeld, und ein zweiter Satz gleicher Regeln waere
 * nur eine zweite Stelle zum Pflegen.
 */

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Ein Regler mit Zahlenfeld. Dasselbe wie beim Muster, aber mit eigenen
 * Grenzen je Regler - die Lage der Ebene reicht nur so weit wie die Auswahl.
 */
function SplitSlider({
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
  children?: React.ReactNode;
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

export function SplitPanel({
  axis,
  rotation,
  position,
  min,
  max,
  targetCount,
  workspace,
  busy,
  error,
  picking,
  onPickToggle,
  onAxisChange,
  onRotationChange,
  onPositionChange,
  onApply,
  onCancel,
}: {
  axis: AlignAxis;
  rotation: SplitRotation;
  position: number;
  min: number;
  max: number;
  targetCount: number;
  workspace: WorkplaneWorkspaceSettings;
  busy: boolean;
  error: string | null;
  /** Der naechste Klick auf eine Flaeche legt die Ebene dorthin. */
  picking: boolean;
  onPickToggle: () => void;
  onAxisChange: (axis: AlignAxis) => void;
  onRotationChange: (index: 0 | 1, rotation: number) => void;
  onPositionChange: (position: number) => void;
  onApply: () => void;
  onCancel: () => void;
}) {
  useLanguage();
  const rotationAxes = splitRotationAxes(axis);
  const tooThin = max - min <= 0.0001;
  return (
    <aside className="edge-modifier-panel split-panel" aria-label={t("split.title")}>
      <div className="edge-modifier-header">
        <div>
          <strong>{t("split.title")}</strong>
          <span>{targetCount === 1 ? t("split.targetOne") : t("split.targetMany", { count: targetCount })}</span>
        </div>
        <button type="button" aria-label={t("common.cancel")} disabled={busy} onClick={onCancel}><X size={20} /></button>
      </div>

      <div className="pattern-choice" role="radiogroup" aria-label={t("split.orientation")}>
        {SPLIT_AXIS_DISPLAY_ORDER.map((candidate) => (
          <button
            key={candidate}
            type="button"
            role="radio"
            aria-checked={axis === candidate}
            className={axis === candidate ? "active" : ""}
            disabled={busy}
            onClick={() => onAxisChange(candidate)}
          >
            {splitAxisLabel(candidate)}
          </button>
        ))}
      </div>

      <SplitSlider
        label={t("split.position")}
        value={position}
        min={min}
        max={max}
        step={0.1}
        workspace={workspace}
        length
        disabled={busy || tooThin}
        onChange={onPositionChange}
      >
        <button
          type="button"
          className={`split-pick-face ${picking ? "active" : ""}`}
          aria-pressed={picking}
          aria-label={t("split.pickFace")}
          title={t("split.pickFaceHint")}
          disabled={busy}
          onClick={onPickToggle}
        >
          <MousePointerClick size={16} />
        </button>
      </SplitSlider>

      {rotationAxes.map((rotationAxis, index) => (
        <SplitSlider
          key={rotationAxis}
          label={t("split.rotation", { axis: splitAxisLabel(rotationAxis) })}
          value={rotation[index]}
          min={-90}
          max={90}
          step={1}
          unit="°"
          workspace={workspace}
          disabled={busy}
          onChange={(value) => onRotationChange(index as 0 | 1, value)}
        />
      ))}

      <p className="edge-modifier-hint">{t("split.help")}</p>
      {error ? <div className="edge-modifier-error" role="alert">{error}</div> : null}

      <div className="edge-modifier-footer">
        <span>{busy ? t("split.applying") : t("split.hint")}</span>
        <button type="button" disabled={busy || tooThin || targetCount === 0} onClick={onApply}>{t("split.apply")}</button>
      </div>
    </aside>
  );
}
