"use client";

import type { CSSProperties } from "react";
import { ArrowLeftRight, Check, LoaderCircle, X } from "lucide-react";
import { t } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import type { CadHollowJoin } from "@/lib/cadHollow";
import { CANNOT_OFFSET_MESSAGE, OFFSET_MAX_DISTANCE, OFFSET_MIN_DISTANCE } from "@/lib/cadOffset";
import {
  displayStepFromMillimeters,
  displayToMillimeters,
  formatMeasurementNumber,
  lengthDisplayUnit,
  millimetersToDisplay,
} from "@/lib/measurementUnits";
import type { WorkplaneWorkspaceSettings } from "@/types/sketchforge";

/**
 * Das Bedienfeld fuer den Versatz und fuer das Ausschneiden mit Spiel.
 *
 * Beim Versatz: Abstand, Richtung, Aussenecken und ob der Koerper selbst
 * versetzt oder eine versetzte Kopie als Loch daneben gelegt wird. Beim
 * Ausschneiden waechst die Kopie immer und wird gleich aus dem anderen
 * Koerper geschnitten; dann zeigt das Feld, was woraus geschnitten wird,
 * und einen Knopf zum Tauschen. Aussehen wie beim Aushoehlen.
 */
export function OffsetPanel({
  distance,
  shrink,
  join,
  keepOriginal,
  cutOut,
  workspace,
  busy,
  error,
  ready,
  onChange,
  onSwap,
  onApply,
  onCancel,
}: {
  distance: number;
  shrink: boolean;
  join: CadHollowJoin;
  keepOriginal: boolean;
  cutOut: { part: string; host: string } | null;
  workspace: WorkplaneWorkspaceSettings;
  busy: boolean;
  error: string | null;
  ready: boolean;
  onChange: (next: { distance?: number; shrink?: boolean; join?: CadHollowJoin; keepOriginal?: boolean }) => void;
  onSwap: () => void;
  onApply: () => void;
  onCancel: () => void;
}) {
  useLanguage();
  const step = 0.01;
  const shownMin = millimetersToDisplay(OFFSET_MIN_DISTANCE, workspace);
  const shownMax = millimetersToDisplay(OFFSET_MAX_DISTANCE, workspace);
  const clamped = Math.min(shownMax, Math.max(shownMin, millimetersToDisplay(distance, workspace)));
  // Die Schiene ist quadratisch geteilt: Die kleinen Abstaende einer Passung
  // (0,1 bis 0,5 mm) sollen nicht auf den ersten Millimeter gedraengt sein.
  const position = Math.sqrt((clamped - shownMin) / Math.max(Number.EPSILON, shownMax - shownMin)) * 100;
  const title = cutOut ? t("cutOut.title") : t("offset.title");

  return (
    <aside className="edge-modifier-panel hollow-panel" aria-label={title}>
      <div className="edge-modifier-header">
        <div>
          <strong>{title}</strong>
          <span>{cutOut ? t("cutOut.hint") : t("offset.hint")}</span>
        </div>
        <button type="button" aria-label={t("common.cancel")} onClick={onCancel}><X size={20} /></button>
      </div>

      {cutOut ? (
        <div className="edge-modifier-field">
          <span>{t("cutOut.pair", { part: cutOut.part, host: cutOut.host })}</span>
          <button type="button" disabled={busy} onClick={onSwap}>
            <ArrowLeftRight size={15} />
            {t("cutOut.swap")}
          </button>
        </div>
      ) : null}

      <label
        className="edge-modifier-field edge-modifier-slider range-property"
        style={{ "--slider-pos": `${position}%` } as CSSProperties}
      >
        <span className="range-property-header">
          <span className="range-property-name">{cutOut ? t("cutOut.clearance") : t("offset.distance")}</span>
          <span className="range-value-control">
            <span className="range-value-text">
              {formatMeasurementNumber(clamped, workspace.accuracy, displayStepFromMillimeters(step, workspace))}
            </span>
            <span className="range-value-unit">{lengthDisplayUnit(workspace).label}</span>
          </span>
        </span>
        <input
          type="range"
          min={0}
          max={1000}
          step={1}
          value={Math.round(position * 10)}
          onChange={(event) => {
            const ratio = Number(event.currentTarget.value) / 1000;
            const shown = shownMin + ratio * ratio * (shownMax - shownMin);
            onChange({ distance: displayToMillimeters(shown, workspace) });
          }}
        />
      </label>

      {cutOut ? null : (
        <div className="pattern-choice" role="radiogroup" aria-label={t("offset.direction")}>
          {([false, true] as const).map((choice) => (
            <button
              key={String(choice)}
              type="button"
              role="radio"
              aria-checked={shrink === choice}
              className={shrink === choice ? "active" : ""}
              onClick={() => onChange({ shrink: choice })}
            >
              {t(choice ? "offset.shrink" : "offset.grow")}
            </button>
          ))}
        </div>
      )}

      <div className="pattern-choice" role="radiogroup" aria-label={t("offset.corners")}>
        {(["round", "sharp"] as const).map((choice) => (
          <button
            key={choice}
            type="button"
            role="radio"
            aria-checked={join === choice}
            className={join === choice ? "active" : ""}
            onClick={() => onChange({ join: choice })}
          >
            {t(choice === "round" ? "hollow.join.round" : "hollow.join.sharp")}
          </button>
        ))}
      </div>

      {cutOut ? null : (
        <label className="edge-modifier-check">
          <input type="checkbox" checked={keepOriginal} onChange={(event) => onChange({ keepOriginal: event.currentTarget.checked })} />
          <span>{t("offset.keepOriginal")}</span>
        </label>
      )}

      {error ? <p className="edge-modifier-error">{error === CANNOT_OFFSET_MESSAGE ? t("status.offsetFailed") : error}</p> : null}

      <div className="edge-modifier-footer">
        <span>{busy ? <LoaderCircle size={15} className="spin" /> : null}</span>
        <button type="button" disabled={busy || !ready} onClick={onApply}>
          <Check size={16} />
          {t("offset.apply")}
        </button>
      </div>
    </aside>
  );
}
