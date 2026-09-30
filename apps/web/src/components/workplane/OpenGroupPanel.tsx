"use client";

import { Check } from "lucide-react";
import { t } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";

/**
 * Das Feld, das waehrend einer geoeffneten Gruppe steht.
 *
 * Es ist der einzige Weg zurueck: Solange es da ist, liegen die Teile einzeln
 * in der Szene, und ohne "Fertig" bliebe unklar, ob sie noch zusammengehoeren.
 * Darum hat es keinen Schliessknopf - nur Fertig.
 *
 * Aussehen und Klassennamen kommen vom Kantenfeld, wie bei den anderen
 * Werkzeugfeldern.
 */
export function OpenGroupPanel({
  name,
  parts,
  busy,
  onDone,
}: {
  name: string;
  parts: number;
  busy: boolean;
  onDone: () => void;
}) {
  useLanguage();
  return (
    <aside className="edge-modifier-panel open-group-panel" aria-label={t("openGroup.title")}>
      <div className="edge-modifier-header">
        <div>
          <strong>{t("openGroup.title")}</strong>
          <span>{name}</span>
        </div>
      </div>
      <div className="edge-modifier-footer open-group-footer">
        <span>{t("openGroup.hint")}</span>
      </div>
      <div className="edge-modifier-footer">
        <span>{t("openGroup.parts", { count: parts })}</span>
        <button type="button" disabled={busy} onClick={onDone}>
          <Check size={16} />
          {t("openGroup.done")}
        </button>
      </div>
    </aside>
  );
}
