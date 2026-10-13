import type { WorkplaneShape } from "@/types/sketchforge";

/**
 * cutterPadding.ts
 *
 * Der Fraeser einer Aussparung - und warum er nur an seinen beiden Enden
 * etwas zugibt.
 *
 * Eine Zugabe braucht es: Steht eine Aussparung randvoll in einem Koerper -
 * ihr Boden genau auf dessen Unterseite, ihr Deckel genau auf dessen
 * Oberseite -, dann treffen zwei Flaechen genau aufeinander, und das Schneiden
 * laesst dort Splitter stehen. Gemessen an einem Kasten von 20 mm mit einem
 * Loch von 7,9 mm durch und durch: randvoll 2977 Dreiecke, mit 0,05 mm Zugabe
 * an beiden Enden 1034. Dasselbe Volumen, aber ein Netz mit fast dreimal so
 * vielen Dreiecken, alle an den Deckeln - und das Schneiden selbst braucht
 * dafuer 9,9 Sekunden statt 98 ms, weil zwei genau aufeinanderliegende
 * Flaechen den Verschnitt in Splitter zerlegen.
 *
 * Rundherum braucht es sie nicht - und sie war dort ein Fehler. Die Zugabe lag
 * auf allen drei Achsen, also wurde das Loch um 2 x 0,05 mm weiter als
 * eingetippt: ein Loch von 7,9 mm kam mit 8,0 mm heraus. Gemessen am
 * Lochrand des geschnittenen Kastens, quer ueber die Flaechen des
 * 96-Ecks: vorher 7,9957 mm, jetzt 7,8958 mm bei eingetippten 7,9. Das
 * Netz schreibt sein Vieleck in den Kreis ein, darum die 0,0042 mm darunter -
 * ein Loch ist nie weiter als eingetippt, und das ist die Seite, auf der ein
 * Presssitz halten muss. Am abgetragenen Volumen: 1004,59 mm^3 vorher,
 * 979,63 mm^3 jetzt, beides genau das 96-Eck-Prisma der jeweiligen Weite.
 *
 * Nebenher: Eine Aussparung, die eine Wand nur beruehrt - ihr Rand genau auf
 * der Wandflaeche -, nimmt daraus keine Scheibe mehr heraus, weil sie nicht
 * mehr 0,05 mm hineinragt.
 *
 * Nach Layerling 1.66.3 (#254).
 */

/** Die Zugabe an jedem der beiden Enden, in Millimetern. */
export const CUTTER_END_PADDING = 0.05;

/**
 * Der Fraeser zu einer Aussparung: dieselbe Form, an beiden Enden um
 * `CUTTER_END_PADDING` verlaengert.
 *
 * Verlaengert wird entlang der Hoehe der Form - ihrer eigenen Achse, nicht der
 * des Raumes. Eine liegende Bohrung hat ihre Enden dort, wo ihre Hoehe
 * hinzeigt, und wird dort verlaengert; gedreht wird sie danach wie zuvor.
 */
export function paddedCutterShape(shape: WorkplaneShape): WorkplaneShape {
  return {
    ...shape,
    height: shape.height + CUTTER_END_PADDING * 2,
    elevation: (shape.elevation ?? 0) - CUTTER_END_PADDING,
  };
}
