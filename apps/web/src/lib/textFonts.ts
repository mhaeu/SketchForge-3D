/**
 * textFonts.ts
 *
 * Die eingebauten Schriften eines Textkoerpers, einmal gelesen fuer alle:
 * die Ansicht, das Netz fuer Ausgabe und Verschneiden und die Schrift, die
 * eine Oberflaechenstruktur aufbringt. Vorher las jede Stelle sie selbst.
 */

import { FontLoader, type Font, type FontData } from "three/examples/jsm/loaders/FontLoader.js";
import droidMonoFontJson from "three/examples/fonts/droid/droid_sans_mono_regular.typeface.json";
import droidSansBoldFontJson from "three/examples/fonts/droid/droid_sans_bold.typeface.json";
import droidSerifBoldFontJson from "three/examples/fonts/droid/droid_serif_bold.typeface.json";
import gentilisBoldFontJson from "three/examples/fonts/gentilis_bold.typeface.json";
import helvetikerBoldFontJson from "three/examples/fonts/helvetiker_bold.typeface.json";
import optimerBoldFontJson from "three/examples/fonts/optimer_bold.typeface.json";

const loader = new FontLoader();
const helvetiker = loader.parse(helvetikerBoldFontJson as FontData);

export const TEXT_FONTS: Record<string, Font> = {
  Multilanguage: helvetiker,
  Sans: loader.parse(droidSansBoldFontJson as FontData),
  Serif: loader.parse(droidSerifBoldFontJson as FontData),
  Script: loader.parse(gentilisBoldFontJson as FontData),
  Monospace: loader.parse(droidMonoFontJson as FontData),
  Rounded: loader.parse(optimerBoldFontJson as FontData),
  // Schablone ist Helvetiker, nur mit geraden Stuecken gezeichnet.
  Stencil: helvetiker,
};

/** Die Namen in der Reihenfolge, in der die Auswahl sie zeigt. */
export const TEXT_FONT_NAMES = Object.keys(TEXT_FONTS);

/** Die Schrift zu einem Namen; ein unbekannter gibt Multilanguage. */
export function textFont(name: string | undefined): Font {
  return (name ? TEXT_FONTS[name] : undefined) ?? TEXT_FONTS.Multilanguage;
}
