/**
 * surfaceTextOutline.ts
 *
 * Die Umrisse einer Schrift, die eine Oberflaechenstruktur aufklebt (siehe
 * surfaceTexture.ts). Die Schriften leben auf der Seite; die Umrisse werden
 * hier gemacht und gehen mit den Einstellungen in den Worker.
 *
 * Nach layerling 1.121.1. Dort kommen japanische Zeichen aus einer eigenen,
 * nachgeladenen Schrift; die haben wir nicht, solche Zeichen fallen weg wie
 * bei einem Textkoerper.
 */

import { SURFACE_TEXTURE_MAX_TEXT_POINTS } from "@/lib/surfaceTexture";
import { TEXT_FONT_NAMES, textFont } from "@/lib/textFonts";

/** Die Schriften, die die Auswahl anbietet: dieselben wie fuer einen Textkoerper. */
export const SURFACE_TEXT_FONTS = TEXT_FONT_NAMES;

/** In dieser Groesse wird gesetzt, bevor auf die Buchstabenhoehe gestreckt wird. */
const LAYOUT_SIZE = 100;

/**
 * Ringe aus flachen Zahlen [x0, y0, x1, y1, ...], innen nach der
 * Gerade-Ungerade-Regel, so gestreckt, dass ein grosses H `size` mm hoch
 * steht, der Kasten darum mittig auf 0, 0, y nach oben. Leer, wenn es nichts
 * zu schreiben gibt. Senkrecht stehen die Zeichen untereinander.
 */
export function surfaceTextOutline({ content, font, size, vertical = false }: { content: string; font: string; size: number; vertical?: boolean }): number[][] {
  const words = content.trim();
  if (!words) return [];
  const face = textFont(font);
  const laidOut = vertical ? Array.from(words.replace(/\s+/g, "")).join("\n") : words;
  // Schablone wird wie beim Textkoerper mit geraden Stuecken gezeichnet.
  const segments = font === "Stencil" ? 1 : 6;
  const raw: number[][] = [];
  face.generateShapes(laidOut, LAYOUT_SIZE).forEach((glyph) => {
    const sampled = glyph.extractPoints(segments);
    [sampled.shape, ...sampled.holes].forEach((points) => {
      if (points.length >= 3) raw.push(points.flatMap((point) => [point.x, point.y]));
    });
  });
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const ring of raw) {
    for (let k = 0; k < ring.length; k += 2) {
      minX = Math.min(minX, ring[k]);
      maxX = Math.max(maxX, ring[k]);
      minY = Math.min(minY, ring[k + 1]);
      maxY = Math.max(maxY, ring[k + 1]);
    }
  }
  if (!Number.isFinite(minX)) return [];
  // Die Buchstabenhoehe ist die eines grossen H; mit Unterlaengen wird der Kasten etwas hoeher.
  let capital = 0;
  face.generateShapes("H", LAYOUT_SIZE).forEach((glyph) => {
    for (const point of glyph.extractPoints(1).shape) capital = Math.max(capital, point.y);
  });
  const scale = Math.max(0.01, size) / (capital > 0 ? capital : LAYOUT_SIZE * 0.7);
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const rings: number[][] = [];
  let budget = SURFACE_TEXTURE_MAX_TEXT_POINTS * 2;
  for (const ring of raw) {
    if (ring.length > budget) break;
    rings.push(ring.map((value, k) => Math.round((k % 2 ? value - cy : value - cx) * scale * 1e4) / 1e4));
    budget -= ring.length;
  }
  return rings;
}
