"use client";

import { MousePointerClick, X } from "lucide-react";
import { t } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import {
  HOLE_PATTERN_KINDS,
  holePatternHasLength,
  MAX_HOLE_PATTERN_COUNT,
  MAX_HOLE_PATTERN_SIZE,
  MIN_HOLE_PATTERN_SIZE,
  minHolePatternSpacing,
  type HolePatternArrangement,
  type HolePatternSettings,
} from "@/lib/holePattern";
import { ToolPanelSlider } from "@/components/workplane/ToolPanelSlider";
import type { WorkplaneWorkspaceSettings } from "@/types/sketchforge";

/**
 * Das Bedienfeld fuer das Lochmuster.
 *
 * Aussehen und Klassennamen kommen vom Teilen-Feld, wie beim Muster und beim
 * Aneinanderlegen: dasselbe schwebende Werkzeugfeld, und ein zweiter Satz
 * gleicher Regeln waere nur eine zweite Stelle zum Pflegen.
 *
 * Die Zahl der Loecher steht im Fuss, nicht als Zusage, sondern als Messung:
 * Sie kommt aus demselben Durchlauf, der die Loecher spaeter setzt. So sieht
 * man am Regler, ob eine Teilung noch eine Reihe mehr hergibt.
 */
export function HolePatternPanel({
  settings,
  count,
  depth,
  through,
  maxDepth,
  workspace,
  busy,
  error,
  picking,
  onPickToggle,
  onSettingsChange,
  onDepthChange,
  onThroughChange,
  onApply,
  onCancel,
}: {
  settings: HolePatternSettings;
  count: number;
  depth: number;
  through: boolean;
  maxDepth: number;
  workspace: WorkplaneWorkspaceSettings;
  busy: boolean;
  error: string | null;
  /** Der naechste Klick auf eine Flaeche waehlt sie. */
  picking: boolean;
  onPickToggle: () => void;
  onSettingsChange: (patch: Partial<HolePatternSettings>) => void;
  onDepthChange: (depth: number) => void;
  onThroughChange: (through: boolean) => void;
  onApply: () => void;
  onCancel: () => void;
}) {
  useLanguage();
  const hasLength = holePatternHasLength(settings.kind);
  const minimumSpacing = minHolePatternSpacing(settings);
  const countLabel = count === 0
    ? t("holePattern.countNone")
    : count >= MAX_HOLE_PATTERN_COUNT
      ? t("holePattern.countLimit", { count })
      : t("holePattern.count", { count });

  return (
    <aside className="edge-modifier-panel split-panel" aria-label={t("holePattern.title")}>
      <div className="edge-modifier-header">
        <div>
          <strong>{t("holePattern.title")}</strong>
          <span>{countLabel}</span>
        </div>
        <button type="button" aria-label={t("common.cancel")} disabled={busy} onClick={onCancel}><X size={20} /></button>
      </div>

      <div className="pattern-choice" role="radiogroup" aria-label={t("holePattern.kind")}>
        {HOLE_PATTERN_KINDS.map((kind) => (
          <button
            key={kind}
            type="button"
            role="radio"
            aria-checked={settings.kind === kind}
            className={settings.kind === kind ? "active" : ""}
            disabled={busy}
            onClick={() => onSettingsChange({ kind })}
          >
            {t(`holePattern.kind.${kind}`)}
          </button>
        ))}
      </div>

      <ToolPanelSlider
        label={t("holePattern.size")}
        value={settings.size}
        min={MIN_HOLE_PATTERN_SIZE}
        max={Math.min(MAX_HOLE_PATTERN_SIZE, 60)}
        step={0.1}
        workspace={workspace}
        length
        disabled={busy}
        onChange={(size) => onSettingsChange({ size })}
      >
        <button
          type="button"
          className={`split-pick-face ${picking ? "active" : ""}`}
          aria-pressed={picking}
          aria-label={t("holePattern.pickFace")}
          title={t("holePattern.pickingHint")}
          disabled={busy}
          onClick={onPickToggle}
        >
          <MousePointerClick size={16} />
        </button>
      </ToolPanelSlider>

      {hasLength ? (
        <ToolPanelSlider
          label={t("holePattern.length")}
          value={settings.length ?? settings.size}
          min={settings.size}
          max={Math.min(MAX_HOLE_PATTERN_SIZE, 120)}
          step={0.1}
          workspace={workspace}
          length
          disabled={busy}
          onChange={(length) => onSettingsChange({ length })}
        />
      ) : null}

      <ToolPanelSlider
        label={t("holePattern.spacing")}
        value={settings.spacing}
        min={minimumSpacing}
        max={Math.min(MAX_HOLE_PATTERN_SIZE * 2, 120)}
        step={0.1}
        workspace={workspace}
        length
        disabled={busy}
        onChange={(spacing) => onSettingsChange({ spacing })}
      />

      <div className="pattern-choice" role="radiogroup" aria-label={t("holePattern.arrangement")}>
        {(["grid", "staggered"] as HolePatternArrangement[]).map((arrangement) => (
          <button
            key={arrangement}
            type="button"
            role="radio"
            aria-checked={settings.arrangement === arrangement}
            className={settings.arrangement === arrangement ? "active" : ""}
            disabled={busy}
            onClick={() => onSettingsChange({ arrangement })}
          >
            {t(`holePattern.arrangement.${arrangement}`)}
          </button>
        ))}
      </div>

      <ToolPanelSlider
        label={t("holePattern.margin")}
        value={settings.margin}
        min={0}
        max={40}
        step={0.1}
        workspace={workspace}
        length
        disabled={busy}
        onChange={(margin) => onSettingsChange({ margin })}
      />

      <ToolPanelSlider
        label={t("holePattern.angle")}
        value={settings.angle ?? 0}
        min={-90}
        max={90}
        step={1}
        unit="°"
        workspace={workspace}
        disabled={busy}
        onChange={(angle) => onSettingsChange({ angle })}
      />

      <label className="edge-modifier-check">
        <input type="checkbox" checked={through} disabled={busy} onChange={(event) => onThroughChange(event.currentTarget.checked)} />
        <span>{t("holePattern.depthThrough")}</span>
      </label>

      {through ? null : (
        <ToolPanelSlider
          label={t("holePattern.depth")}
          value={depth}
          min={0.2}
          max={Math.max(0.4, maxDepth)}
          step={0.1}
          workspace={workspace}
          length
          disabled={busy}
          onChange={onDepthChange}
        />
      )}

      <p className="edge-modifier-hint">{t("holePattern.help")}</p>
      {error ? <div className="edge-modifier-error" role="alert">{error}</div> : null}

      <div className="edge-modifier-footer">
        <span>{picking ? t("holePattern.pickingHint") : countLabel}</span>
        <button type="button" disabled={busy || count === 0} onClick={onApply}>{t("holePattern.apply")}</button>
      </div>
    </aside>
  );
}
