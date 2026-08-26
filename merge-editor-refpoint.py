#!/usr/bin/env python3
"""
Fügt NUR die Referenzpunkt-Blöcke in den offiziellen SketchForgeEditor.tsx ein.
Der variable Fillet wird bewusst NICHT eingebaut - der kommt als eigenes Paket
zusammen mit den cadModifier-Dateien.

Aufruf im Projekt-Wurzelverzeichnis (SketchForge-3D):

    python3 merge-editor-refpoint.py apps/web/src/components/SketchForgeEditor.tsx

Idempotent und sicher: bricht ab, falls ein eindeutiger Anker fehlt oder
mehrdeutig ist - dann wurde nichts verändert.
"""
import sys

def main():
    if len(sys.argv) != 2:
        print("Aufruf: python3 merge-editor-refpoint.py <pfad-zu-SketchForgeEditor.tsx>")
        sys.exit(1)
    path = sys.argv[1]
    with open(path, encoding="utf-8") as f:
        s = f.read()

    if "ensureReferencePoint" in s and "isReferencePoint" in s:
        print("Referenzpunkt-Blöcke sind bereits vorhanden - nichts zu tun.")
        return

    # ---------------------------------------------------------------
    # TEIL 1: Boolean-Ausschlüsse (global, Muster identisch überall)
    # 9x solids, 4x holes-einfach, 2x holes-locked = 15 Stellen
    # ---------------------------------------------------------------
    global_subs = [
        (
            "  const solids = selection.filter((shape) => !shape.hole && !shape.locked);",
            "  const solids = selection.filter((shape) => !shape.hole && !shape.locked && !isReferencePoint(shape));",
            9, "solids-Filter",
        ),
        (
            "  const holes = selection.filter((shape) => shape.hole && !shape.locked);",
            "  const holes = selection.filter((shape) => shape.hole && !shape.locked && !isReferencePoint(shape));",
            2, "holes-Filter (locked)",
        ),
        (
            "  const holes = selection.filter((shape) => shape.hole);",
            "  const holes = selection.filter((shape) => shape.hole && !isReferencePoint(shape));",
            4, "holes-Filter (einfach)",
        ),
    ]

    # ---------------------------------------------------------------
    # TEIL 2: Einzelstellen mit eindeutigem Anker
    # ---------------------------------------------------------------
    single_subs = [
        # Import - nach dem shapeCatalog-Import (der sicher existiert)
        (
            'import { makeShapeFromAsset, sceneShape, toolbarShapeAssets, type ToolbarShapeAsset } from "@/lib/shapeCatalog";',
            'import { makeShapeFromAsset, sceneShape, toolbarShapeAssets, type ToolbarShapeAsset } from "@/lib/shapeCatalog";\n'
            'import { ensureReferencePoint, isReferencePoint, referencePointPosition, REFERENCE_POINT_ID } from "@/lib/referencePoint";',
            "Import referencePoint",
        ),
        # Init: initialSceneRef
        (
            "    initialSceneRef.current = initialShapes.map(canonicalizeShape);",
            "    initialSceneRef.current = ensureReferencePoint(initialShapes.map(canonicalizeShape));",
            "Init initialSceneRef",
        ),
        # Laden: incoming
        (
            "    const incoming = initialShapes.map(canonicalizeShape);",
            "    const incoming = ensureReferencePoint(initialShapes.map(canonicalizeShape));",
            "Laden incoming",
        ),
        # Löschschutz
        (
            """    const selected = new Set(selectedIds);
    commitShapes(
      shapes.filter((shape) => !selected.has(shape.id)),
      [],
      `Deleted ${selected.size} selected shape${selected.size === 1 ? "" : "s"}`,
    );""",
            """    const selected = new Set(selectedIds);
    // The reference point is a permanent scene helper - never delete it, even
    // if it is part of the current selection.
    const deletable = shapes.filter((shape) => selected.has(shape.id) && !isReferencePoint(shape));
    if (deletable.length === 0) {
      setNotice("The reference point cannot be deleted");
      return;
    }
    const deletableIds = new Set(deletable.map((shape) => shape.id));
    commitShapes(
      shapes.filter((shape) => !deletableIds.has(shape.id)),
      [],
      `Deleted ${deletableIds.size} selected shape${deletableIds.size === 1 ? "" : "s"}`,
    );""",
            "Löschschutz",
        ),
        # Duplizierschutz - an die offizielle Struktur angepasst
        # (cloneWorkplaneShapeTreeWithFreshIds statt manueller ID-Vergabe).
        # Der Referenzpunkt wird vor dem .map herausgefiltert, danach die
        # "cannot be duplicated"-Meldung, falls nur er ausgewählt war.
        (
            """    const duplicates = selectedShapes.map((shape) => {
      const duplicate = cloneWorkplaneShapeTreeWithFreshIds(shape, "copy");
      return {
        ...duplicate,
        x: Math.min(110, shape.x + 8),
        z: Math.min(110, shape.z + 8),
      };
    });
    commitShapes([...shapes, ...duplicates], duplicates.map((shape) => shape.id), `Duplicated ${duplicates.length} shape${duplicates.length === 1 ? "" : "s"}`);""",
            """    const duplicates = selectedShapes
      .filter((shape) => !isReferencePoint(shape))
      .map((shape) => {
        const duplicate = cloneWorkplaneShapeTreeWithFreshIds(shape, "copy");
        return {
          ...duplicate,
          x: Math.min(110, shape.x + 8),
          z: Math.min(110, shape.z + 8),
        };
      });
    if (duplicates.length === 0) {
      setNotice("The reference point cannot be duplicated");
      return;
    }
    commitShapes([...shapes, ...duplicates], duplicates.map((shape) => shape.id), `Duplicated ${duplicates.length} shape${duplicates.length === 1 ? "" : "s"}`);""",
            "Duplizierschutz",
        ),
        # Export-Ausschluss
        (
            "    const exportable = sourceShapes.filter((shape) => !shape.hole);",
            "    const exportable = sourceShapes.filter((shape) => !shape.hole && !isReferencePoint(shape));",
            "Export-Ausschluss",
        ),
    ]

    # --- Prüfphase: alle Anker vorhanden und in erwarteter Zahl? ---
    problems = []
    for old, _new, expected, name in global_subs:
        c = s.count(old)
        if c != expected:
            problems.append(f"  '{name}': erwartet {expected}x, gefunden {c}x")
    for old, _new, name in single_subs:
        c = s.count(old)
        if c != 1:
            problems.append(f"  '{name}': erwartet 1x, gefunden {c}x")

    if problems:
        print("FEHLER - Anker passen nicht, nichts verändert:")
        print("\n".join(problems))
        sys.exit(2)

    # --- Ausführphase ---
    for old, new, expected, name in global_subs:
        s = s.replace(old, new)
        print(f"  OK   {name} ({expected}x)")
    for old, new, name in single_subs:
        s = s.replace(old, new, 1)
        print(f"  OK   {name}")

    with open(path, "w", encoding="utf-8") as f:
        f.write(s)
    print("\nFertig - Referenzpunkt-Blöcke eingefügt (variabler Fillet bleibt für später).")

if __name__ == "__main__":
    main()
