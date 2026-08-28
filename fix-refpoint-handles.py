#!/usr/bin/env python3
"""
Unterdrueckt das komplette Transform-Overlay (Verschiebe-/Skalier-/Dreh-Handles)
fuer den Referenzpunkt. Er ist am Ursprung fixiert und wird stattdessen ueber
die Seitenleiste (Position/Marker-Karten im Inspector) konfiguriert - die
Viewport-Handles boten nur eine Fehlerquelle (versehentliches Drehen, das ihn
zu einer Box backte).

Ansatz: frueher Ausstieg in syncTransformOverlay, wenn genau ein Shape
ausgewaehlt ist und es der Referenzpunkt ist - analog zu den bestehenden
fruehen Rueckgaben der Funktion (leere Auswahl, kein Frame).

Aufruf im Projekt-Wurzelverzeichnis:

    python3 fix-refpoint-handles.py apps/web/src/components/WorkplaneViewport.tsx

Idempotent und sicher.
"""
import sys
import re

def main():
    if len(sys.argv) != 2:
        print("Aufruf: python3 fix-refpoint-handles.py <pfad>")
        sys.exit(1)
    path = sys.argv[1]
    with open(path, encoding="utf-8") as f:
        s = f.read()

    if "Reference point never gets transform handles" in s:
        print("Referenzpunkt-Handle-Ausschluss bereits vorhanden - nichts zu tun.")
        return

    anchor = """  const activeWorkplane = workplane;
  const frame = selectionFrameForShapes(shapes, selectedIds, activeWorkplane);
  if (!frame) {
    if (overlayRef.current) {
      overlayRef.current = null;
      setOverlay(null);
    }
    return;
  }"""
    new = """  const activeWorkplane = workplane;
  const frame = selectionFrameForShapes(shapes, selectedIds, activeWorkplane);
  if (!frame) {
    if (overlayRef.current) {
      overlayRef.current = null;
      setOverlay(null);
    }
    return;
  }

  // Reference point never gets transform handles: it is pinned to the origin
  // and configured via the inspector's Position/Marker cards instead. Viewport
  // handles only invited accidental drags/rotations that turned it into a box.
  if (selectedIds.length === 1) {
    const onlyShape = shapes.find((entry) => entry.id === selectedIds[0]);
    if (onlyShape && isReferencePoint(onlyShape)) {
      if (overlayRef.current) {
        overlayRef.current = null;
        setOverlay(null);
      }
      return;
    }
  }"""

    c = s.count(anchor)
    if c != 1:
        print(f"FEHLER: Anker erwartet 1x, gefunden {c}x. Nichts verändert.")
        sys.exit(2)

    s = s.replace(anchor, new, 1)

    # isReferencePoint-Import sicherstellen
    if not re.search(r'import\s*\{[^}]*\bisReferencePoint\b[^}]*\}\s*from\s*"@/lib/referencePoint"', s):
        m = re.search(r'import\s*\{([^}]*)\}\s*from\s*"@/lib/referencePoint";', s)
        if m:
            names = m.group(1)
            new_names = names.rstrip() + ", isReferencePoint"
            s = s.replace(m.group(0), f'import {{{new_names} }} from "@/lib/referencePoint";', 1)
            print("  Import ergaenzt: isReferencePoint zu bestehendem @/lib/referencePoint-Import hinzugefuegt.")
        else:
            first_import_end = s.find("\n", s.find("import "))
            s = s[:first_import_end + 1] + 'import { isReferencePoint } from "@/lib/referencePoint";\n' + s[first_import_end + 1:]
            print("  Neuer Import ergaenzt: isReferencePoint aus @/lib/referencePoint.")

    with open(path, "w", encoding="utf-8") as f:
        f.write(s)
    print("Fertig - Referenzpunkt zeigt keine Transform-Handles mehr im Viewport.")

if __name__ == "__main__":
    main()
