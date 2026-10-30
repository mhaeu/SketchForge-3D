"use client";

import { X } from "lucide-react";
import { t } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import { COOKIE_CUTTER_LIMITS, type CookieCutterOptions } from "@/lib/cookieCutter";
import { ToolPanelSlider } from "@/components/workplane/ToolPanelSlider";
import type { WorkplaneWorkspaceSettings } from "@/types/sketchforge";

/**
 * Das Bedienfeld der Ausstechform: Wand, Hoehe, Rand, Schneide, Spiegeln und
 * Stege. Gerechnet wird erst beim Klick auf "Erstellen"; die Form ersetzt
 * dann die Auswahl, und Rueckgaengig holt sie zurueck.
 */
export function CookieCutterPanel({
  options,
  workspace,
  busy,
  error,
  onChange,
  onApply,
  onCancel,
}: {
  options: CookieCutterOptions;
  workspace: WorkplaneWorkspaceSettings;
  busy: boolean;
  error: string | null;
  onChange: (patch: Partial<CookieCutterOptions>) => void;
  onApply: () => void;
  onCancel: () => void;
}) {
  useLanguage();
  const slider = (key: Exclude<keyof CookieCutterOptions, "mirror" | "bridges" | "bridgeCount">, label: string, step = 0.1) => (
    <ToolPanelSlider
      label={label}
      value={options[key]}
      min={COOKIE_CUTTER_LIMITS[key][0]}
      max={COOKIE_CUTTER_LIMITS[key][1]}
      step={step}
      workspace={workspace}
      length
      disabled={busy}
      onChange={(value) => onChange({ [key]: value })}
    />
  );

  return (
    <aside className="edge-modifier-panel split-panel" aria-label={t("cookieCutter.title")}>
      <div className="edge-modifier-header">
        <div>
          <strong>{t("cookieCutter.title")}</strong>
          <span>{t("cookieCutter.hint")}</span>
        </div>
        <button type="button" aria-label={t("common.cancel")} disabled={busy} onClick={onCancel}><X size={20} /></button>
      </div>

      {slider("wall", t("cookieCutter.wall"))}
      {slider("height", t("cookieCutter.height"), 0.5)}
      {slider("edge", t("cookieCutter.edge"))}
      {slider("rim", t("cookieCutter.rim"), 0.5)}
      {slider("rimHeight", t("cookieCutter.rimHeight"))}

      <label className="edge-modifier-check">
        <input type="checkbox" checked={options.mirror} disabled={busy} onChange={(event) => onChange({ mirror: event.currentTarget.checked })} />
        <span>{t("cookieCutter.mirror")}</span>
      </label>
      <label className="edge-modifier-check">
        <input type="checkbox" checked={options.bridges} disabled={busy} onChange={(event) => onChange({ bridges: event.currentTarget.checked })} />
        <span>{t("cookieCutter.bridges")}</span>
      </label>
      {options.bridges ? (
        <>
          <ToolPanelSlider
            label={t("cookieCutter.bridgeCount")}
            value={options.bridgeCount}
            min={COOKIE_CUTTER_LIMITS.bridgeCount[0]}
            max={COOKIE_CUTTER_LIMITS.bridgeCount[1]}
            step={1}
            whole
            workspace={workspace}
            disabled={busy}
            onChange={(bridgeCount) => onChange({ bridgeCount })}
          />
          {slider("bridgeWidth", t("cookieCutter.bridgeWidth"))}
          {slider("bridgeHeight", t("cookieCutter.bridgeHeight"))}
        </>
      ) : null}

      {error ? <div className="edge-modifier-error" role="alert">{error}</div> : null}

      <div className="edge-modifier-footer">
        <span />
        <button type="button" disabled={busy} onClick={onApply}>{t("cookieCutter.apply")}</button>
      </div>
    </aside>
  );
}
