"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { X } from "lucide-react";
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
import {
  PATTERN_MAX_COUNT,
  PATTERN_MIN_COUNT,
  clampPatternCount,
  type PatternSettings,
} from "@/lib/shapePattern";
import type { WorkplaneWorkspaceSettings } from "@/types/sketchforge";

/**
 * Das Bedienfeld fuer Muster.
 *
 * Aussehen und Klassennamen kommen vom Kantenfeld - beide sind dasselbe
 * schwebende Werkzeugfeld, und ein zweiter Satz gleicher Regeln waere nur eine
 * zweite Stelle, die man pflegen muesste. Eigen sind nur die Knopfreihen fuer
 * Art und Achse (`pattern-*`).
 */

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function PatternSlider({
  label,
  value,
  min,
  max,
  step,
  unit,
  workspace,
  length = false,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: ReactNode;
  workspace: WorkplaneWorkspaceSettings;
  length?: boolean;
  onChange: (value: number) => void;
}) {
  const toDisplay = (millimetres: number) => (length ? millimetersToDisplay(millimetres, workspace) : millimetres);
  const toModel = (shown: number) => (length ? displayToMillimeters(shown, workspace) : shown);
  const shown = toDisplay(value);
  const shownMin = toDisplay(min);
  const shownMax = toDisplay(max);
  const shownStep = length ? displayStepFromMillimeters(step, workspace) : step;
  const position = ((clamp(shown, shownMin, shownMax) - shownMin) / Math.max(Number.EPSILON, shownMax - shownMin)) * 100;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const text = formatMeasurementNumber(shown, workspace.accuracy, shownStep);
  return (
    <label className="edge-modifier-field edge-modifier-slider range-property" style={{ "--slider-pos": `${position}%` } as CSSProperties}>
      <span className="range-property-header">
        <span className="range-property-name">{label}</span>
        <span className="range-value-control">
          <input
            type="text"
            inputMode="decimal"
            value={editing ? draft : text}
            onFocus={(event) => { setDraft(text); setEditing(true); selectWholeValue(event.currentTarget); }}
            onChange={(event) => setDraft(event.currentTarget.value)}
            onBlur={() => {
              const parsed = parseMeasurementInput(draft);
              onChange(clamp(toModel(Number.isFinite(parsed) ? parsed : shown), min, max));
              setEditing(false);
            }}
            onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
          />
          {unit ?? (length ? <span className="range-value-unit">{lengthDisplayUnit(workspace).label}</span> : null)}
        </span>
      </span>
      <div className="range-control">
        <input
          type="range"
          min={shownMin}
          max={shownMax}
          step={shownStep}
          value={clamp(shown, shownMin, shownMax)}
          onChange={(event) => onChange(clamp(toModel(Number(event.currentTarget.value)), min, max))}
        />
      </div>
    </label>
  );
}

export function PatternPanel({
  settings,
  selectedCount,
  workspace,
  onChange,
  onCreate,
  onCancel,
}: {
  settings: PatternSettings;
  selectedCount: number;
  workspace: WorkplaneWorkspaceSettings;
  onChange: (next: PatternSettings) => void;
  onCreate: () => void;
  onCancel: () => void;
}) {
  useLanguage();
  const pieces = clampPatternCount(settings.count);
  const copies = (pieces - 1) * Math.max(1, selectedCount);
  return (
    <aside className="edge-modifier-panel pattern-panel" aria-label={t("pattern.title")}>
      <div className="edge-modifier-header">
        <div>
          <strong>{t("pattern.title")}</strong>
          <span>{t("pattern.selected", { count: selectedCount })}</span>
        </div>
        <button type="button" aria-label={t("common.cancel")} onClick={onCancel}><X size={20} /></button>
      </div>

      <div className="pattern-choice" role="radiogroup" aria-label={t("pattern.mode")}>
        {(["row", "circle"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={settings.mode === mode}
            className={settings.mode === mode ? "active" : ""}
            onClick={() => onChange({ ...settings, mode })}
          >
            {t(mode === "row" ? "pattern.row" : "pattern.circle")}
          </button>
        ))}
      </div>

      <PatternSlider
        label={t("pattern.count")}
        value={pieces}
        min={PATTERN_MIN_COUNT}
        max={PATTERN_MAX_COUNT}
        step={1}
        workspace={workspace}
        onChange={(value) => onChange({ ...settings, count: clampPatternCount(value) })}
      />

      {settings.mode === "row" ? (
        <>
          {/* Drei Strecken statt einer Achse und einer Strecke: Eine Reihe
              laengs X ist weiter eine Zahl in einem Feld; zwei davon geben
              eine schraege Reihe, mit der Hoehe eine Treppe. */}
          <PatternSlider
            label={t("pattern.spacingX")}
            value={settings.spacingX}
            min={-400}
            max={400}
            step={0.1}
            workspace={workspace}
            length
            onChange={(spacingX) => onChange({ ...settings, spacingX })}
          />
          <PatternSlider
            label={t("pattern.spacingY")}
            value={settings.spacingY}
            min={-400}
            max={400}
            step={0.1}
            workspace={workspace}
            length
            onChange={(spacingY) => onChange({ ...settings, spacingY })}
          />
          <PatternSlider
            label={t("pattern.spacingZ")}
            value={settings.spacingZ}
            min={-400}
            max={400}
            step={0.1}
            workspace={workspace}
            length
            onChange={(spacingZ) => onChange({ ...settings, spacingZ })}
          />
        </>
      ) : (
        <>
          <PatternSlider
            label={t("pattern.angle")}
            value={settings.angle}
            min={-360}
            max={360}
            step={1}
            unit={<span className="range-value-unit">°</span>}
            workspace={workspace}
            onChange={(angle) => onChange({ ...settings, angle })}
          />
          <PatternSlider
            label={t("pattern.centreX")}
            value={settings.centreX}
            min={-400}
            max={400}
            step={0.1}
            workspace={workspace}
            length
            onChange={(centreX) => onChange({ ...settings, centreX })}
          />
          <PatternSlider
            label={t("pattern.centreZ")}
            value={settings.centreZ}
            min={-400}
            max={400}
            step={0.1}
            workspace={workspace}
            length
            onChange={(centreZ) => onChange({ ...settings, centreZ })}
          />
          <PatternSlider
            label={t("pattern.rise")}
            value={settings.rise}
            min={-200}
            max={200}
            step={0.1}
            workspace={workspace}
            length
            onChange={(rise) => onChange({ ...settings, rise })}
          />
          <PatternSlider
            label={t("pattern.radiusChange")}
            value={settings.radiusChange}
            min={-100}
            max={100}
            step={0.1}
            workspace={workspace}
            length
            onChange={(radiusChange) => onChange({ ...settings, radiusChange })}
          />
          <label className="edge-modifier-check">
            <input
              type="checkbox"
              checked={settings.turnCopies}
              onChange={(event) => onChange({ ...settings, turnCopies: event.currentTarget.checked })}
            />
            <span>{t("pattern.turnCopies")}</span>
          </label>
        </>
      )}

      <div className="edge-modifier-footer">
        <span>{t("pattern.willAdd", { count: copies })}</span>
        <button type="button" disabled={selectedCount === 0} onClick={onCreate}>{t("pattern.create")}</button>
      </div>
    </aside>
  );
}
