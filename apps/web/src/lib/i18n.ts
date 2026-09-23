import { MESSAGES_DE } from "@/lib/messages.de";
import { MESSAGES_EN, type MessageKey } from "@/lib/messages.en";

export const LANGUAGES = ["en", "de"] as const;
export type Language = (typeof LANGUAGES)[number];
export const DEFAULT_LANGUAGE: Language = "en";
export const LANGUAGE_STORAGE_KEY = "sketchforge.language";

const CATALOGUE: Record<Language, Record<MessageKey, string>> = {
  en: MESSAGES_EN,
  de: MESSAGES_DE,
};

export const LANGUAGE_NAMES: Record<Language, string> = {
  en: "English",
  de: "Deutsch",
};

export function isLanguage(value: unknown): value is Language {
  return typeof value === "string" && (LANGUAGES as readonly string[]).includes(value);
}

/**
 * The language a browser asks for, as far as we can serve it. `de-AT` and plain
 * `de` both mean German; anything else falls back to English.
 */
export function languageFromTag(tag: string | undefined | null): Language | null {
  const primary = tag?.trim().toLowerCase().split("-")[0];
  return isLanguage(primary) ? primary : null;
}

/**
 * The current language lives in a module-level store rather than in React
 * context: notices are produced in plain callbacks and helpers all over the
 * editor, and those need `t()` without a hook.
 */
let current: Language = DEFAULT_LANGUAGE;
const listeners = new Set<() => void>();

/**
 * React stays out of this module on purpose: it is reached from server code
 * through the project format, and a hook import there fails the build. The
 * hook that wraps this lives in `useLanguage.ts`.
 */
export function subscribeToLanguage(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getLanguage(): Language {
  return current;
}

export function setLanguage(language: Language, persist = true) {
  if (language === current) return;
  current = language;
  if (persist && typeof window !== "undefined") {
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    } catch {
      // A browser that refuses storage still gets the language for this visit.
    }
  }
  // Screen readers and hyphenation read this, not just the eye - and the
  // server always renders "en", so a stored German choice has to correct it
  // here, once, on the one path every language change already takes.
  if (typeof document !== "undefined") {
    document.documentElement.lang = language;
  }
  listeners.forEach((listener) => listener());
}

/** Stored choice first, then what the browser asks for, then English. */
export function detectLanguage(): Language {
  if (typeof window === "undefined") return DEFAULT_LANGUAGE;
  try {
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (isLanguage(stored)) return stored;
  } catch {
    // Fall through to the browser's own preference.
  }
  for (const tag of window.navigator.languages ?? [window.navigator.language]) {
    const language = languageFromTag(tag);
    if (language) return language;
  }
  return DEFAULT_LANGUAGE;
}

export function translate(
  language: Language,
  key: MessageKey,
  values?: Record<string, string | number>,
): string {
  const template = CATALOGUE[language][key] ?? MESSAGES_EN[key] ?? key;
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : match,
  );
}

/** The everyday form: uses whatever language is current right now. */
export function t(key: MessageKey, values?: Record<string, string | number>): string {
  return translate(current, key, values);
}

export type { MessageKey };

/**
 * Ob diese Zeichenkette ein Textschluessel ist.
 *
 * Fuer Meldungen, die aus einem Arbeiter kommen: Der kann nicht uebersetzen -
 * er laeuft neben der Anwendung und weiss nichts von der eingestellten
 * Sprache -, also nennt er den Schluessel und die Uebersetzung geschieht
 * hier. Was kein Schluessel ist, wird unveraendert durchgereicht; so bleibt
 * auch die Meldung eines fremden Fehlers lesbar.
 */
export function isMessageKey(value: string): value is MessageKey {
  return Object.prototype.hasOwnProperty.call(MESSAGES_EN, value);
}

/** Einen Text uebersetzen, der ein Schluessel sein kann, aber nicht muss. */
export function translateIfKey(value: string): string {
  return isMessageKey(value) ? t(value) : value;
}
