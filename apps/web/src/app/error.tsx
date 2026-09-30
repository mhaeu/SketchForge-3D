"use client";

import { useEffect } from "react";
import { detectLanguage, setLanguage, t } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";

/**
 * Was zu sehen ist, wenn beim Zeichnen etwas abbricht.
 *
 * Ohne diese Datei zeigt Next seine eigene, nackte Seite: "This page
 * couldn't load", ohne Meldung, ohne Weg zurueck, und ein Neuladen fuehrt
 * geradewegs in denselben Fehler, weil in der Adresse noch das Projekt
 * steht. Hier steht wenigstens, was schiefging - und der Weg zur Startseite
 * geht auf die nackte Adresse, damit nicht dasselbe Projekt wieder aufgeht.
 *
 * Gespeichert wird hier nichts. Das ist der Sinn: Eine abgebrochene
 * Darstellung darf die abgelegte Zeichnung nicht anfassen.
 */
export default function EditorError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useLanguage();
  useEffect(() => {
    setLanguage(detectLanguage(), false);
    // Die Meldung gehoert in die Entwicklerkonsole, damit man sie melden kann.
    console.error("SketchForge editor error", error);
  }, [error]);

  return (
    <main className="app-error">
      <h1>{t("appError.title")}</h1>
      <p>{t("appError.body")}</p>
      <pre className="app-error-message">{error.message || t("appError.noMessage")}</pre>
      {error.digest ? <p className="app-error-digest">{t("appError.digest", { digest: error.digest })}</p> : null}
      <div className="app-error-actions">
        <button type="button" onClick={() => retry()}>{t("appError.retry")}</button>
        <a href="/">{t("appError.home")}</a>
      </div>
    </main>
  );
}
