#!/usr/bin/env python3
"""
Schliesst den Referenzpunkt von der Rahmen-Auswahl (Marquee/Drag-Select) aus.

Der Referenzpunkt sitzt am Ursprung und landet dadurch leicht versehentlich in
einem Auswahlrahmen zusammen mit anderen Objekten. Er bleibt weiterhin per
Einzelklick anwaehlbar (das laeuft ueber einen anderen Pfad) - nur die
Rahmen-Auswahl nimmt ihn nicht mehr mit auf.

Aufruf im Projekt-Wurzelverzeichnis:

    python3 fix-refpoint-marquee.py apps/web/src/components/WorkplaneViewport.tsx

Idempotent und sicher.
"""
import sys
import re

def main():
    if len(sys.argv) != 2:
        print("Aufruf: python3 fix-refpoint-marquee.py <pfad>")
        sys.exit(1)
    path = sys.argv[1]
    with open(path, encoding="utf-8") as f:
        s = f.read()

    if "isReferencePoint(shape))\n      .filter((shape) => !shape.hidden)" in s:
        print("Marquee-Referenzpunkt-Ausschluss bereits vorhanden - nichts zu tun.")
        return

    anchor = """    return shapesRef.current
      .filter((shape) => !shape.hidden)
      .filter((shape) => !shape.imagePlate)"""
    new = """    return shapesRef.current
      .filter((shape) => !isReferencePoint(shape))
      .filter((shape) => !shape.hidden)
      .filter((shape) => !shape.imagePlate)"""

    c = s.count(anchor)
    if c != 1:
        print(f"FEHLER: Anker erwartet 1x, gefunden {c}x. Nichts verändert.")
        sys.exit(2)

    s = s.replace(anchor, new, 1)

    # Sicherstellen, dass isReferencePoint importiert ist.
    if not re.search(r'import\s*\{[^}]*\bisReferencePoint\b[^}]*\}\s*from\s*"@/lib/referencePoint"', s):
        # Gibt es schon einen Import aus @/lib/referencePoint, den wir erweitern koennen?
        m = re.search(r'import\s*\{([^}]*)\}\s*from\s*"@/lib/referencePoint";', s)
        if m:
            names = m.group(1)
            new_names = names.rstrip() + ", isReferencePoint"
            s = s.replace(m.group(0), f'import {{{new_names} }} from "@/lib/referencePoint";', 1)
            print("  Import ergaenzt: isReferencePoint zu bestehendem @/lib/referencePoint-Import hinzugefuegt.")
        else:
            # Kein bestehender Import - einen neuen nach dem ersten Import einfuegen.
            first_import_end = s.find("\n", s.find("import "))
            s = s[:first_import_end + 1] + 'import { isReferencePoint } from "@/lib/referencePoint";\n' + s[first_import_end + 1:]
            print("  Neuer Import ergaenzt: isReferencePoint aus @/lib/referencePoint.")

    with open(path, "w", encoding="utf-8") as f:
        f.write(s)
    print("Fertig - Referenzpunkt wird bei Rahmen-Auswahl nicht mehr mitmarkiert.")

if __name__ == "__main__":
    main()
