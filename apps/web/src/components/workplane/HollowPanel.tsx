"use client";

import type { CSSProperties } from "react";
import { Check, LoaderCircle, X } from "lucide-react";
import { t, type MessageKey } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import { HOLLOW_SIDES, hollowWallLimits, toggleHollowSide, type CadHollowJoin, type CadHollowOpening, type HollowSide } from "@/lib/cadHollow";
import {
  displayStepFromMillimeters,
  displayToMillimeters,
  formatMeasurementNumber,
  lengthDisplayUnit,
  millimetersToDisplay,
} from "@/lib/measurementUnits";
import type { WorkplaneWorkspaceSettings } from "@/types/sketchforge";

/**
 * Das Bedienfeld fuers Aushoehlen.
 *
 * Drei Angaben, mehr braucht es nicht: Wie dick die Wand wird, welche Seiten
 * offen bleiben und ob die Waende innen rund oder scharf aufeinandertreffen.
 * Gerechnet wird bei jeder Aenderung neu, darum steht der Fortschritt im Fuss
 * und nicht als eigene Meldung.
 *
 * Aussehen und Klassennamen kommen vom Kantenfeld, wie bei den anderen
 * Werkzeugfeldern.
 */

const SIDE_LABELS: Record<HollowSide, MessageKey> = {
  top: "hollow.opening.top",
  bottom: "hollow.opening.bottom",
  front: "hollow.opening.front",
  back: "hollow.opening.back",
  left: "hollow.opening.left",
  right: "hollow.opening.right",
};

export function HollowPanel({
  wall,
  opening,
  join,
  dimensions,
  workspace,
  busy,
  error,
  ready,
  onChange,
  onApply,
  onCancel,
}: {
  wall: number;
  opening: CadHollowOpening;
  join: CadHollowJoin;
  dimensions: { width: number; depth: number; height: number };
  workspace: WorkplaneWorkspaceSettings;
  busy: boolean;
  error: string | null;
  ready: boolean;
  onChange: (next: { wall?: number; opening?: CadHollowOpening; join?: CadHollowJoin }) => void;
  onApply: () => void;
  onCancel: () => void;
}) {
  useLanguage();
  const limits = hollowWallLimits(dimensions, opening);
  const step = 0.1;
  const shown = millimetersToDisplay(wall, workspace);
  const shownMin = millimetersToDisplay(limits.min, workspace);
  const shownMax = millimetersToDisplay(limits.max, workspace);
  const clamped = Math.min(shownMax, Math.max(shownMin, shown));
  const position = ((clamped - shownMin) / Math.max(Number.EPSILON, shownMax - shownMin)) * 100;

  return (
    <aside className="edge-modifier-panel hollow-panel" aria-label={t("hollow.title")}>
      <div className="edge-modifier-header">
        <div>
          <strong>{t("hollow.title")}</strong>
          <span>{t("hollow.hint")}</span>
        </div>
        <button type="button" aria-label={t("common.cancel")} onClick={onCancel}><X size={20} /></button>
      </div>

      <label
        className="edge-modifier-field edge-modifier-slider range-property"
        style={{ "--slider-pos": `${position}%` } as CSSProperties}
      >
        <span className="range-property-header">
          <span className="range-property-name">{t("hollow.wall")}</span>
          <span className="range-value-control">
            <span className="range-value-text">
              {formatMeasurementNumber(clamped, workspace.accuracy, displayStepFromMillimeters(step, workspace))}
            </span>
            <span className="range-value-unit">{lengthDisplayUnit(workspace).label}</span>
          </span>
        </span>
        <input
          type="range"
          min={shownMin}
          max={shownMax}
          step={displayStepFromMillimeters(step, workspace)}
          value={clamped}
          onChange={(event) => onChange({ wall: displayToMillimeters(Number(event.currentTarget.value), workspace) })}
        />
      </label>

      {/* Ein Schalter je Seite, in beliebiger Mischung: vorn allein ist ein
          Schubfach, links und rechts ein Tunnel, keiner ein geschlossener
          Koerper. Darum Schalter und keine Auswahl unter mehreren. */}
      <div className="pattern-choice hollow-choice" role="group" aria-label={t("hollow.opening")}>
        {HOLLOW_SIDES.map((side) => (
          <button
            key={side}
            type="button"
            aria-pressed={opening.includes(side)}
            className={opening.includes(side) ? "active" : ""}
            onClick={() => onChange({ opening: toggleHollowSide(opening, side) })}
          >
            {t(SIDE_LABELS[side])}
          </button>
        ))}
      </div>

      <div className="pattern-choice" role="radiogroup" aria-label={t("hollow.join")}>
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

      {error ? <p className="edge-modifier-error">{error}</p> : null}

      <div className="edge-modifier-footer">
        <span>{busy ? <LoaderCircle size={15} className="spin" /> : null}</span>
        <button type="button" disabled={busy || !ready} onClick={onApply}>
          <Check size={16} />
          {t("hollow.apply")}
        </button>
      </div>
    </aside>
  );
}
