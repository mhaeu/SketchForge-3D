"use client";

import { useRef } from "react";
import { Eye, EyeOff, Lock, LockOpen, X } from "lucide-react";
import { t } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import type { WorkplaneShape } from "@/types/sketchforge";

/**
 * Die Objektliste.
 *
 * Auswaehlen im Bild ist muehsam, sobald etwas hinter etwas anderem steckt
 * oder ausgeblendet ist - ein ausgeblendeter Koerper ist im Bild ueberhaupt
 * nicht zu treffen. Die Liste nennt jeden Koerper beim Namen und traegt seine
 * beiden Schalter gleich mit: Auge und Schloss.
 *
 * Bewusst schmal gehalten: Sie liegt neben dem Bild und soll es nicht
 * verdecken. Umbenannt wird weiter in den Eigenschaften - dort sucht man den
 * Namen, und zwei Stellen fuer dasselbe waeren eine zu viel.
 *
 * Nach Layerling 1.20.0.
 */

/** Was in der Liste steht: Art und Anzahl der Teile, wenn es eine Gruppe ist. */
function describe(shape: WorkplaneShape) {
  const parts = shape.groupedShapes?.length ?? 0;
  if (parts > 0) return t("objectList.parts", { count: parts });
  if (shape.hole) return t("objectList.hole");
  return "";
}

export function ObjectListPanel({
  shapes,
  selectedIds,
  onSelect,
  onSetHidden,
  onSetLocked,
  onClose,
}: {
  /** Alle Koerper, in der Reihenfolge der Szene; der Bezugspunkt ist schon heraus. */
  shapes: ReadonlyArray<WorkplaneShape>;
  selectedIds: ReadonlyArray<string>;
  onSelect: (id: string | string[], mode: "replace" | "toggle") => void;
  onSetHidden: (id: string, hidden: boolean) => void;
  onSetLocked: (id: string, locked: boolean) => void;
  onClose: () => void;
}) {
  useLanguage();
  /*
   * Der Anker fuer die Bereichsauswahl: die Zeile, auf die zuletzt ohne
   * Umschalttaste geklickt wurde. Shift waehlt von dort bis hierher - so, wie
   * man es aus jeder Liste kennt. Strg schaltet eine einzelne Zeile dazu oder
   * ab; vorher tat Shift dasselbe wie Strg, und eine Reihe von zwanzig
   * Koerpern musste man zwanzigmal anklicken.
   */
  const anchorRef = useRef<string | null>(null);
  const clickRow = (id: string, event: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }) => {
    const anchor = anchorRef.current;
    if (event.shiftKey && anchor && anchor !== id) {
      const from = shapes.findIndex((shape) => shape.id === anchor);
      const to = shapes.findIndex((shape) => shape.id === id);
      if (from >= 0 && to >= 0) {
        const range = shapes.slice(Math.min(from, to), Math.max(from, to) + 1).map((shape) => shape.id);
        onSelect(range, "replace");
        return;
      }
    }
    if (event.ctrlKey || event.metaKey) {
      onSelect(id, "toggle");
      // Der Anker wandert mit: Von hier aus geht die naechste Reihe los.
      anchorRef.current = id;
      return;
    }
    anchorRef.current = id;
    onSelect(id, "replace");
  };
  return (
    <aside className="object-list-panel" aria-label={t("objectList.title")}>
      <div className="edge-modifier-header">
        <div>
          <strong>{t("objectList.title")}</strong>
          <span>{t("objectList.count", { count: shapes.length })}</span>
        </div>
        <button type="button" aria-label={t("common.cancel")} onClick={onClose}><X size={20} /></button>
      </div>
      {shapes.length === 0 ? (
        <p className="object-list-empty">{t("objectList.empty")}</p>
      ) : (
        <ul className="object-list">
          {shapes.map((shape) => {
            const selected = selectedIds.includes(shape.id);
            const note = describe(shape);
            return (
              <li key={shape.id} className={`object-list-row ${selected ? "selected" : ""} ${shape.hidden ? "hidden-shape" : ""}`}>
                <button
                  type="button"
                  className="object-list-name"
                  aria-pressed={selected}
                  title={shape.name}
                  // Strg waehlt einzeln dazu, Shift einen ganzen Bereich.
                  onClick={(event) => clickRow(shape.id, event)}
                >
                  <span className="object-list-swatch" style={{ background: shape.color }} aria-hidden="true" />
                  <span className="object-list-label">{shape.name}</span>
                  {note ? <span className="object-list-note">{note}</span> : null}
                </button>
                <button
                  type="button"
                  className="object-list-toggle"
                  aria-label={shape.hidden ? t("objectList.show") : t("objectList.hide")}
                  title={shape.hidden ? t("objectList.show") : t("objectList.hide")}
                  aria-pressed={Boolean(shape.hidden)}
                  onClick={() => onSetHidden(shape.id, !shape.hidden)}
                >
                  {shape.hidden ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
                <button
                  type="button"
                  className="object-list-toggle"
                  aria-label={shape.locked ? t("objectList.unlock") : t("objectList.lock")}
                  title={shape.locked ? t("objectList.unlock") : t("objectList.lock")}
                  aria-pressed={Boolean(shape.locked)}
                  onClick={() => onSetLocked(shape.id, !shape.locked)}
                >
                  {shape.locked ? <Lock size={16} /> : <LockOpen size={16} />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
