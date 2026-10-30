"use client";

import { Check, LoaderCircle, X } from "lucide-react";
import { t } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";

/**
 * Das Bedienfeld fuer "Flaeche loeschen": Die Flaechen werden am Koerper
 * angeklickt, das Feld zaehlt sie, und jede Wahl zeigt gleich, wie der
 * Koerper ohne sie aussieht. Aussehen wie beim Aushoehlen. Nach layerling
 * 1.86.0 (#451).
 */
export function DeleteFacePanel({
  targetName,
  faceCount,
  preparing,
  busy,
  error,
  ready,
  onClear,
  onApply,
  onCancel,
}: {
  targetName: string;
  faceCount: number;
  /** Der Arbeiter liest noch die Flaechen des Koerpers. */
  preparing: boolean;
  busy: boolean;
  error: string | null;
  ready: boolean;
  onClear: () => void;
  onApply: () => void;
  onCancel: () => void;
}) {
  useLanguage();
  return (
    <aside className="edge-modifier-panel hollow-panel" aria-label={t("deleteFace.title")}>
      <div className="edge-modifier-header">
        <div>
          <strong>{t("deleteFace.title")}</strong>
          <span>{preparing ? t("deleteFace.preparing", { name: targetName }) : t("deleteFace.hint")}</span>
        </div>
        <button type="button" aria-label={t("common.cancel")} onClick={onCancel}><X size={20} /></button>
      </div>

      <div className="edge-modifier-field">
        <span>{t("deleteFace.count", { count: faceCount })}</span>
        <button type="button" disabled={faceCount === 0 || busy} onClick={onClear}>
          {t("deleteFace.clear")}
        </button>
      </div>

      {error ? <p className="edge-modifier-error">{error}</p> : null}

      <div className="edge-modifier-footer">
        <span>{busy || preparing ? <LoaderCircle size={15} className="spin" /> : null}</span>
        <button type="button" disabled={busy || !ready || faceCount === 0} onClick={onApply}>
          <Check size={16} />
          {t("deleteFace.apply")}
        </button>
      </div>
    </aside>
  );
}
