#!/usr/bin/env python3
"""
Fügt den Referenzpunkt-Ausschluss in stepExport.ts ein.
Aufruf im Projekt-Wurzelverzeichnis:

    python3 merge-stepexport.py apps/web/src/lib/stepExport.ts

Idempotent und sicher: bricht ab, falls ein Anker fehlt.
"""
import sys

def main():
    if len(sys.argv) != 2:
        print("Aufruf: python3 merge-stepexport.py <pfad-zu-stepExport.ts>")
        sys.exit(1)
    path = sys.argv[1]
    with open(path, encoding="utf-8") as f:
        s = f.read()

    if "withoutReferencePoints" in s:
        print("Ausschluss bereits vorhanden - nichts zu tun.")
        return

    subs = [
        (
            'import { shapeDepth, shapeWidth } from "@/lib/workplaneShapes";',
            'import { shapeDepth, shapeWidth } from "@/lib/workplaneShapes";\n'
            'import { withoutReferencePoints } from "@/lib/referencePoint";',
            "Import withoutReferencePoints",
        ),
        (
            "export async function exportShapesToStep(shapes: WorkplaneShape[]): Promise<StepExportResult> {\n  const brep = await loadBrepWithOcct();",
            "export async function exportShapesToStep(shapes: WorkplaneShape[]): Promise<StepExportResult> {\n"
            "  // The reference point is a scene helper, never geometry - keep it out of STEP.\n"
            "  shapes = withoutReferencePoints(shapes);\n"
            "  const brep = await loadBrepWithOcct();",
            "Ausschluss am Funktionseingang",
        ),
    ]

    for old, _new, name in subs:
        c = s.count(old)
        if c != 1:
            print(f"FEHLER: Anker '{name}' erwartet 1x, gefunden {c}x. Nichts verändert.")
            sys.exit(2)

    for old, new, name in subs:
        s = s.replace(old, new, 1)
        print(f"  OK   {name}")

    with open(path, "w", encoding="utf-8") as f:
        f.write(s)
    print("\nFertig - Referenzpunkt-Ausschluss in stepExport.ts eingefügt.")

if __name__ == "__main__":
    main()
