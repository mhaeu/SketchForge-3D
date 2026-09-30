"use client";

import { X } from "lucide-react";
import { t, type MessageKey } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import { SNAP_TARGETS, type SnapTarget } from "@/lib/pointSnap";

/**
 * Das Bedienfeld fuer die Vorgabe: Was soll ein Klick fassen?
 *
 * Es gilt fuer alle drei Zeigewerkzeuge - Drehpunkt, Punkt auf Punkt, Punkt
 * auf die Arbeitsebene -, denn die Frage ist bei allen dieselbe. Es steht
 * genau dann da, wenn eines von ihnen auf einen Klick wartet; die Vorgabe
 * bleibt zwischen zwei Werkzeugen erhalten.
 *
 * Aussehen und Klassennamen kommen vom Kantenfeld, wie beim Musterfeld auch.
 */

const LABELS: Record<SnapTarget, MessageKey> = {
  auto: "pointTarget.auto",
  corner: "pointTarget.corner",
  edge: "pointTarget.edge",
  edgeMiddle: "pointTarget.edgeMiddle",
  face: "pointTarget.face",
  surface: "pointTarget.surface",
};

const HINTS: Record<SnapTarget, MessageKey> = {
  auto: "pointTarget.hint.auto",
  corner: "pointTarget.hint.corner",
  edge: "pointTarget.hint.edge",
  edgeMiddle: "pointTarget.hint.edgeMiddle",
  face: "pointTarget.hint.face",
  surface: "pointTarget.hint.surface",
};

const TOOLS = {
  pivot: "pointTarget.tool.pivot",
  point: "pointTarget.tool.point",
  workplane: "pointTarget.tool.workplane",
} as const satisfies Record<string, MessageKey>;

export function PointTargetPanel({
  target,
  tool,
  onChange,
  onCancel,
}: {
  target: SnapTarget;
  /** Welches Werkzeug gerade zeigt - steht als Unterzeile im Kopf. */
  tool: keyof typeof TOOLS;
  onChange: (target: SnapTarget) => void;
  onCancel: () => void;
}) {
  useLanguage();
  return (
    <aside className="edge-modifier-panel point-target-panel" aria-label={t("pointTarget.title")}>
      <div className="edge-modifier-header">
        <div>
          <strong>{t("pointTarget.title")}</strong>
          <span>{t(TOOLS[tool])}</span>
        </div>
        <button type="button" aria-label={t("common.cancel")} onClick={onCancel}><X size={20} /></button>
      </div>

      <div className="pattern-choice point-target-choice" role="radiogroup" aria-label={t("pointTarget.title")}>
        {SNAP_TARGETS.map((choice) => (
          <button
            key={choice}
            type="button"
            role="radio"
            aria-checked={target === choice}
            className={target === choice ? "active" : ""}
            onClick={() => onChange(choice)}
          >
            {t(LABELS[choice])}
          </button>
        ))}
      </div>

      <div className="edge-modifier-footer point-target-footer">
        <span>{t(HINTS[target])}</span>
      </div>
    </aside>
  );
}
