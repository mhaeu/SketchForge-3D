#!/usr/bin/env python3
"""
Ergänzt den EdgeModifierSession-Typ um endAmount/flipTaper. Das ist die letzte
fehlende Stelle des Variable-Fillet-Merges - die Verwendungen sind schon drin,
nur die Typdeklaration fehlte.

Aufruf im Projekt-Wurzelverzeichnis:

    python3 fix-editor-session-type.py apps/web/src/components/SketchForgeEditor.tsx
"""
import sys

def main():
    if len(sys.argv) != 2:
        print("Aufruf: python3 fix-editor-session-type.py <pfad>")
        sys.exit(1)
    path = sys.argv[1]
    with open(path, encoding="utf-8") as f:
        s = f.read()

    anchor = """type EdgeModifierSession = {
  kind: CadModifierKind;
  edges: CadModifierEdge[];
  selectedEdgeIds: number[];
  amount: number;
  sharpAngle: number;
  chamferAngle: number;
  quality: CadModifierQuality;"""
    new = """type EdgeModifierSession = {
  kind: CadModifierKind;
  edges: CadModifierEdge[];
  selectedEdgeIds: number[];
  amount: number;
  sharpAngle: number;
  chamferAngle: number;
  endAmount: number;
  flipTaper: boolean;
  quality: CadModifierQuality;"""

    if "endAmount: number;" in s and "flipTaper: boolean;" in s and s.count(anchor) == 0:
        print("Typ enthält endAmount/flipTaper bereits - nichts zu tun.")
        return

    c = s.count(anchor)
    if c != 1:
        print(f"FEHLER: Anker erwartet 1x, gefunden {c}x. Nichts verändert.")
        sys.exit(2)

    s = s.replace(anchor, new, 1)
    with open(path, "w", encoding="utf-8") as f:
        f.write(s)
    print("Fertig - endAmount/flipTaper zum EdgeModifierSession-Typ hinzugefügt.")

if __name__ == "__main__":
    main()
