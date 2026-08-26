#!/usr/bin/env python3
"""
Schliesst die Luecke, durch die sich der Referenzpunkt ueber Kopieren+Einfuegen
vervielfaeltigen liess. Der Duplizieren-Befehl war schon geschuetzt, die
Zwischenablage-Wege (copySelected / pasteShape) nicht.

- copySelected: Referenzpunkt gar nicht erst in die Zwischenablage aufnehmen.
- pasteShape: als Sicherheitsnetz beim Einfuegen erneut herausfiltern (falls er
  aus einer aelteren/projektuebergreifenden Zwischenablage stammt).

Aufruf im Projekt-Wurzelverzeichnis:

    python3 fix-refpoint-clipboard.py apps/web/src/components/SketchForgeEditor.tsx

Idempotent und sicher.
"""
import sys

def main():
    if len(sys.argv) != 2:
        print("Aufruf: python3 fix-refpoint-clipboard.py <pfad>")
        sys.exit(1)
    path = sys.argv[1]
    with open(path, encoding="utf-8") as f:
        s = f.read()

    if "copyableShapes" in s:
        print("Zwischenablage-Schutz bereits vorhanden - nichts zu tun.")
        return

    subs = [
        # 1. copySelected: Referenzpunkt herausfiltern
        (
            """    setClipboard(selectedShapes);
    writeSharedClipboard(selectedShapes);
    setNotice(`Copied ${selectedShapes.length} shape${selectedShapes.length === 1 ? "" : "s"}`);""",
            """    // The reference point is a permanent scene helper - never copy it, so it
    // cannot be pasted back as a second reference point.
    const copyableShapes = selectedShapes.filter((shape) => !isReferencePoint(shape));
    if (copyableShapes.length === 0) {
      setNotice("The reference point cannot be copied");
      return;
    }
    setClipboard(copyableShapes);
    writeSharedClipboard(copyableShapes);
    setNotice(`Copied ${copyableShapes.length} shape${copyableShapes.length === 1 ? "" : "s"}`);""",
            1, "copySelected-Filter",
        ),
        # 2. pasteShape: Sicherheitsnetz beim Einfuegen
        (
            """    const pasted = sourceClipboard.map((shape) => {
      const pastedShape = cloneWorkplaneShapeTreeWithFreshIds(shape, "paste");""",
            """    const pasted = sourceClipboard
      .filter((shape) => !isReferencePoint(shape))
      .map((shape) => {
      const pastedShape = cloneWorkplaneShapeTreeWithFreshIds(shape, "paste");""",
            1, "pasteShape-Sicherheitsnetz",
        ),
    ]

    problems = []
    for old, _new, expected, name in subs:
        c = s.count(old)
        if c != expected:
            problems.append(f"  '{name}': erwartet {expected}x, gefunden {c}x")
    if problems:
        print("FEHLER - Anker passen nicht, nichts verändert:")
        print("\n".join(problems))
        sys.exit(2)

    for old, new, _expected, name in subs:
        s = s.replace(old, new, 1)
        print(f"  OK   {name}")

    with open(path, "w", encoding="utf-8") as f:
        f.write(s)
    print("\nFertig - Referenzpunkt kann nicht mehr ueber Kopieren+Einfuegen dupliziert werden.")

if __name__ == "__main__":
    main()
