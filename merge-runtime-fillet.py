#!/usr/bin/env python3
"""
Hängt die zwei Variable-Fillet-Hilfsfunktionen an cadModifierRuntime.ts an.
Der offizielle Stand hat die Datei stark überarbeitet (Timeouts, Transform-
Prüfung, Edge-Selektierbarkeit) - diese bleiben unangetastet. Unsere zwei
Funktionen sind reine Ergänzungen und werden hinten angehängt.

Aufruf im Projekt-Wurzelverzeichnis:

    python3 merge-runtime-fillet.py apps/web/src/lib/cadModifierRuntime.ts

Idempotent.
"""
import sys

BLOCK = '''

/**
 * Start- und Endradius für den variablen Fillet. flipTaper vertauscht sie, weil
 * die Laufrichtung einer Kante aus der OCCT-Parametrisierung stammt und in der
 * Oberfläche nicht sichtbar ist.
 *
 * In cadModifierRuntime, weil Worker (Anwendung) und UI (Vorschau/Anzeige) es
 * teilen und es hier isoliert testbar ist.
 */
export function variableFilletRadii(params: { amount: number; endAmount: number; flipTaper: boolean }) {
  return params.flipTaper
    ? { startRadius: params.endAmount, endRadius: params.amount }
    : { startRadius: params.amount, endRadius: params.endAmount };
}

/**
 * Der variable Fillet arbeitet auf genau einer Kante: OCCTs filletVariable
 * liefert einen neuen Koerper, wodurch die Verweise weiterer Kanten ungueltig
 * wuerden. Diese Pruefung teilen Worker und UI, damit Ablehnung und
 * Button-Sperre dieselbe Regel benutzen.
 */
export function variableFilletRejectsMultiEdge(selectedCount: number) {
  return selectedCount > 1;
}
'''

def main():
    if len(sys.argv) != 2:
        print("Aufruf: python3 merge-runtime-fillet.py <pfad-zu-cadModifierRuntime.ts>")
        sys.exit(1)
    path = sys.argv[1]
    with open(path, encoding="utf-8") as f:
        s = f.read()

    if "variableFilletRadii" in s:
        print("Variable-Fillet-Funktionen bereits vorhanden - nichts zu tun.")
        return

    s = s.rstrip("\n") + "\n" + BLOCK
    with open(path, "w", encoding="utf-8") as f:
        f.write(s)
    print("Fertig - variableFilletRadii + variableFilletRejectsMultiEdge angehängt.")

if __name__ == "__main__":
    main()
