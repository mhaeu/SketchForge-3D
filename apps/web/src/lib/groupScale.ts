/**
 * groupScale.ts
 *
 * Wie weit eine Gruppe ihre Teile streckt.
 *
 * Eine Gruppe behaelt ihre Teile in der Groesse, in der sie gruppiert wurden;
 * sie groesser zu ziehen aendert nur ihre eigene Breite, Hoehe und Tiefe. Wer
 * danach das Netz der Gruppe braucht, muss die Teile selbst strecken - und
 * genau das hat eine Stelle vergessen: Die Ansicht und das Aufloesen streckten,
 * das Netz der Gruppe nicht. Ausgefuehrt wurde die Gruppe darum in der Groesse,
 * die sie beim Gruppieren hatte, und Ausrichten, Fangen und die
 * Filamentschaetzung rechneten mit demselben falschen Netz.
 *
 * Nach Layerling, beigetragen von @gogades (#127).
 */

import { shapeDepth, shapeWidth } from "@/lib/workplaneShapes";
import type { WorkplaneShape } from "@/types/sketchforge";

export type GroupChildBounds = { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number };

/**
 * Die drei Faktoren von der Gruppiergroesse auf die jetzige.
 *
 * Eine Gruppe, die ohne ihre Gruppiergroesse gespeichert wurde, faellt auf die
 * Ausdehnung ihrer Teile zurueck - dann ist der Faktor eins, solange sie nicht
 * gezogen wurde. Das betrifft nur alte Projekte; wer hier gruppiert, legt die
 * Gruppiergroesse mit ab.
 *
 * Darum kommt die Ausdehnung als Aufruf und nicht als Wert: Sie zu bestimmen
 * heisst, jedes Teilnetz zu bauen, und das Netz der Gruppe baut sie gleich
 * danach noch einmal. Fuer den gewoehnlichen Fall wird sie so nie gebraucht.
 *
 * Gezaehlt werden *alle* Teile, auch ausgeblendete: Ein Teil auszublenden
 * aendert nicht, wie gross die Gruppe beim Gruppieren war.
 */
export function groupedContentScale(
  group: WorkplaneShape,
  childBounds: () => GroupChildBounds,
): [number, number, number] {
  let measured: GroupChildBounds | null = null;
  const span = (axis: "x" | "y" | "z") => {
    measured ??= childBounds();
    if (axis === "x") return measured.maxX - measured.minX;
    if (axis === "y") return measured.maxY - measured.minY;
    return measured.maxZ - measured.minZ;
  };
  const baseWidth = group.groupedBaseWidth ?? span("x");
  const baseHeight = group.groupedBaseHeight ?? span("y");
  const baseDepth = group.groupedBaseDepth ?? span("z");
  return [
    shapeWidth(group) / Math.max(0.001, baseWidth),
    group.height / Math.max(0.001, baseHeight),
    shapeDepth(group) / Math.max(0.001, baseDepth),
  ];
}

/**
 * Streckt die Eckpunkte der Teile, die im Rahmen der Gruppe liegen - auf x und
 * z um ihre Mitte, auf y von ihrer Unterseite an. Genau so liegen die Teile
 * einer Gruppe gespeichert, und genau so erwartet sie die weitere Rechnung.
 */
export function scaleGroupedVertices<T extends readonly [number, number, number]>(
  vertices: ReadonlyArray<T>,
  [sx, sy, sz]: readonly [number, number, number],
): [number, number, number][] {
  return vertices.map(([x, y, z]) => [x * sx, y * sy, z * sz]);
}
