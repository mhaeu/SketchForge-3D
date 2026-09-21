"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { LANGUAGES, LANGUAGE_NAMES, setLanguage, t, type Language } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";

/**
 * Kleine gezeichnete Fahnen statt Emoji: Windows liefert die Flaggen-Emoji
 * nicht aus und zeigt stattdessen zwei Buchstaben in einem Kasten. Gezeichnet
 * sehen sie überall gleich aus und lassen sich auf Pixelgrößen bringen.
 */
function LanguageFlag({ language }: { language: Language }) {
  if (language === "de") {
    return (
      <svg viewBox="0 0 5 3" aria-hidden="true">
        <rect width="5" height="1" y="0" fill="#000000" />
        <rect width="5" height="1" y="1" fill="#dd0000" />
        <rect width="5" height="1" y="2" fill="#ffce00" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 60 36" aria-hidden="true">
      <rect width="60" height="36" fill="#012169" />
      <path d="M0 0 60 36M60 0 0 36" stroke="#ffffff" strokeWidth="7" />
      <path d="M0 0 60 36M60 0 0 36" stroke="#c8102e" strokeWidth="4" />
      <path d="M30 0V36M0 18H60" stroke="#ffffff" strokeWidth="12" />
      <path d="M30 0V36M0 18H60" stroke="#c8102e" strokeWidth="7" />
    </svg>
  );
}

/**
 * Die Sprachwahl sitzt oben rechts, wo man sie auf Webseiten sucht - auf der
 * Startseite wie im Editor.
 *
 * Sie zeigt nur die aktuelle Sprache und klappt die andere darunter auf.
 * Nebeneinander waren es zwei Knöpfe, und in der Werkzeugleiste des Editors
 * nahmen die genug Platz weg, dass Ein-/Ausfuhr und Einstellungen daneben
 * nicht mehr zu erkennen waren.
 */
export function LanguageSwitch() {
  const language = useLanguage();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", closeOnPointerDown);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeOnPointerDown);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className="language-switch" ref={rootRef}>
      <button
        type="button"
        className={`language-switch-trigger ${open ? "active" : ""}`}
        aria-label={t("common.language")}
        title={`${t("common.language")}: ${LANGUAGE_NAMES[language]}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <LanguageFlag language={language} />
        <span>{language.toUpperCase()}</span>
        <ChevronDown size={12} strokeWidth={2.8} aria-hidden="true" />
      </button>
      {open ? (
        <div className="language-switch-menu" role="menu" aria-label={t("common.language")}>
          {LANGUAGES.map((option) => (
            <button
              key={option}
              type="button"
              role="menuitemradio"
              aria-checked={option === language}
              className={option === language ? "active" : undefined}
              onClick={() => {
                setLanguage(option);
                setOpen(false);
              }}
            >
              <LanguageFlag language={option} />
              <span>{LANGUAGE_NAMES[option]}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
