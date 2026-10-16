"use client";

import { MousePointerClick, X } from "lucide-react";
import { t } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import {
  FACE_TOOL_MAX_DEPTH,
  FACE_TOOL_MAX_INSET,
  FACE_TOOL_MAX_RADIUS,
  FACE_TOOL_MIN_DEPTH,
  type FaceToolDirection,
  type FaceToolSettings,
} from "@/lib/faceTool";
import { ToolPanelSlider } from "@/components/workplane/ToolPanelSlider";
import type { WorkplaneWorkspaceSettings } from "@/types/sketchforge";

/**
 * Das Bedienfeld des Flaechenwerkzeugs.
 *
 * Gleiches Kleid wie das Lochmuster, weil es dieselbe Frage zuerst stellt:
 * welche Flaeche? Die Tiefe einer Tasche reicht nur bis zur Rueckseite des
 * Koerpers - der Regler endet dort, und was darueber hinaus ginge, sagt die
 * Zeile darunter.
 */
export function FaceToolPanel({
  settings,
  hasFace,
  maxDepth,
  workspace,
  busy,
  error,
  picking,
  onPickToggle,
  onSettingsChange,
  onApply,
  onCancel,
}: {
  settings: FaceToolSettings;
  /** Ist schon eine Flaeche gewaehlt? */
  hasFace: boolean;
  /** Wie dick der Koerper hinter der Flaeche ist - so tief geht eine Tasche hoechstens. */
  maxDepth: number;
  workspace: WorkplaneWorkspaceSettings;
  busy: boolean;
  error: string | null;
  picking: boolean;
  onPickToggle: () => void;
  onSettingsChange: (patch: Partial<FaceToolSettings>) => void;
  onApply: () => void;
  onCancel: () => void;
}) {
  useLanguage();
  const pocket = settings.direction === "in";
  const depthMax = pocket ? Math.max(FACE_TOOL_MIN_DEPTH * 2, Math.min(FACE_TOOL_MAX_DEPTH, maxDepth)) : 40;

  return (
    <aside className="edge-modifier-panel split-panel" aria-label={t("faceTool.title")}>
      <div className="edge-modifier-header">
        <div>
          <strong>{t("faceTool.title")}</strong>
          <span>{hasFace ? (pocket ? t("faceTool.statusIn") : t("faceTool.statusOut")) : t("faceTool.pickingHint")}</span>
        </div>
        <button type="button" aria-label={t("common.cancel")} disabled={busy} onClick={onCancel}><X size={20} /></button>
      </div>

      <div className="pattern-choice" role="radiogroup" aria-label={t("faceTool.direction")}>
        {(["out", "in"] as FaceToolDirection[]).map((direction) => (
          <button
            key={direction}
            type="button"
            role="radio"
            aria-checked={settings.direction === direction}
            className={settings.direction === direction ? "active" : ""}
            disabled={busy}
            onClick={() => onSettingsChange({ direction })}
          >
            {t(direction === "out" ? "faceTool.out" : "faceTool.in")}
          </button>
        ))}
      </div>

      <ToolPanelSlider
        label={pocket ? t("faceTool.pocketDepth") : t("faceTool.height")}
        value={pocket ? Math.min(settings.depth, depthMax) : settings.depth}
        min={FACE_TOOL_MIN_DEPTH}
        max={depthMax}
        step={0.1}
        workspace={workspace}
        length
        disabled={busy}
        onChange={(depth) => onSettingsChange({ depth })}
      >
        <button
          type="button"
          className={`split-pick-face ${picking ? "active" : ""}`}
          aria-pressed={picking}
          aria-label={t("faceTool.pickFace")}
          title={t("faceTool.pickingHint")}
          disabled={busy}
          onClick={onPickToggle}
        >
          <MousePointerClick size={16} />
        </button>
      </ToolPanelSlider>

      <ToolPanelSlider
        label={t("faceTool.inset")}
        value={settings.inset}
        min={0}
        max={FACE_TOOL_MAX_INSET}
        step={0.1}
        workspace={workspace}
        length
        disabled={busy}
        onChange={(inset) => onSettingsChange({ inset })}
      />

      <ToolPanelSlider
        label={t("faceTool.radius")}
        value={settings.radius}
        min={0}
        max={FACE_TOOL_MAX_RADIUS}
        step={0.1}
        workspace={workspace}
        length
        disabled={busy}
        onChange={(radius) => onSettingsChange({ radius })}
      />

      <p className="edge-modifier-hint">{t("faceTool.help")}</p>
      {error ? <div className="edge-modifier-error" role="alert">{error}</div> : null}

      <div className="edge-modifier-footer">
        <span>{picking ? t("faceTool.pickingHint") : ""}</span>
        <button type="button" disabled={busy || !hasFace} onClick={onApply}>{t("faceTool.apply")}</button>
      </div>
    </aside>
  );
}
