"use client";

import { X } from "lucide-react";
import { t } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import { MAX_MATE_GAP, MIN_MATE_GAP, type MateMode } from "@/lib/mateFaces";
import { ToolPanelSlider } from "@/components/workplane/ToolPanelSlider";
import type { WorkplaneWorkspaceSettings } from "@/types/sketchforge";

/**
 * Das Bedienfeld fuer das Aneinanderlegen.
 *
 * Es hat keinen Fertig-Knopf: Das Werkzeug legt an, sobald die zweite Flaeche
 * angeklickt ist. Art und Spiel stehen vorher da, damit der Klick schon das
 * Richtige tut - und sie bleiben stehen, sodass das naechste Paar mit
 * derselben Einstellung zusammenfindet.
 *
 * Aussehen und Klassennamen kommen vom Kantenfeld, wie bei den anderen
 * Werkzeugfeldern.
 */
export function MateFacesPanel({
  mode,
  gap,
  hasSource,
  workspace,
  error,
  onModeChange,
  onGapChange,
  onRestart,
  onCancel,
}: {
  mode: MateMode;
  gap: number;
  /** Die erste Flaeche ist gezeigt, der zweite Klick fehlt noch. */
  hasSource: boolean;
  workspace: WorkplaneWorkspaceSettings;
  error: string | null;
  onModeChange: (mode: MateMode) => void;
  onGapChange: (gap: number) => void;
  onRestart: () => void;
  onCancel: () => void;
}) {
  useLanguage();
  return (
    <aside className="edge-modifier-panel mate-faces-panel" aria-label={t("mate.title")}>
      <div className="edge-modifier-header">
        <div>
          <strong>{t("mate.title")}</strong>
          <span>{hasSource ? t("mate.pickTarget") : t("mate.pickSource")}</span>
        </div>
        <button type="button" aria-label={t("common.cancel")} onClick={onCancel}><X size={20} /></button>
      </div>

      <div className="pattern-choice" role="radiogroup" aria-label={t("mate.mode")}>
        {(["against", "flush"] as const).map((candidate) => (
          <button
            key={candidate}
            type="button"
            role="radio"
            aria-checked={mode === candidate}
            className={mode === candidate ? "active" : ""}
            onClick={() => onModeChange(candidate)}
          >
            {t(candidate === "against" ? "mate.against" : "mate.flush")}
          </button>
        ))}
      </div>

      <ToolPanelSlider
        label={t("mate.gap")}
        value={gap}
        min={MIN_MATE_GAP}
        max={MAX_MATE_GAP}
        step={0.1}
        workspace={workspace}
        length
        onChange={onGapChange}
      />

      <p className="edge-modifier-hint">{t(mode === "against" ? "mate.againstHint" : "mate.flushHint")}</p>

      {error ? <p className="edge-modifier-error">{error}</p> : null}

      {hasSource ? (
        <div className="edge-modifier-footer">
          <span />
          <button type="button" onClick={onRestart}>{t("mate.restart")}</button>
        </div>
      ) : null}
    </aside>
  );
}
