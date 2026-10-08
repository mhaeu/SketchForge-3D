"use client";

import { MousePointerClick, X } from "lucide-react";
import { t } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import { SPLIT_AXIS_DISPLAY_ORDER, splitAxisLabel, splitRotationAxes, type SplitRotation } from "@/lib/modelSplit";
import { ToolPanelSlider } from "@/components/workplane/ToolPanelSlider";
import type { AlignAxis, WorkplaneWorkspaceSettings } from "@/types/sketchforge";

/**
 * Das Bedienfeld fuer das Teilen.
 *
 * Aussehen und Klassennamen kommen vom Kantenfeld, wie beim Muster: Es ist
 * dasselbe schwebende Werkzeugfeld, und ein zweiter Satz gleicher Regeln waere
 * nur eine zweite Stelle zum Pflegen.
 */

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

      <ToolPanelSlider
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
      </ToolPanelSlider>

      {rotationAxes.map((rotationAxis, index) => (
        <ToolPanelSlider
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
