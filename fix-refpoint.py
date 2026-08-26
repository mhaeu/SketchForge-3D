#!/usr/bin/env python3
"""
Zwei kleine Korrekturen für den Referenzpunkt:

1. WorkplaneViewport.tsx: crossArm/markerRadius fließen in die
   Geometrie-Signatur ein, damit das Kreuz sofort neu gebaut wird, wenn man
   Cross size / Marker size ändert (statt erst bei einer anderen Änderung).

2. ShapeInspector.tsx: Die Taper-Card wird beim Referenzpunkt ausgeblendet -
   ein Punkt hat keine sinnvolle Verjüngung.

Aufruf im Projekt-Wurzelverzeichnis (SketchForge-3D):

    python3 fix-refpoint.py

Idempotent und sicher: prüft jeden Anker vorab, ändert nichts bei Fehlern.
"""
import sys

VIEWPORT = "apps/web/src/components/WorkplaneViewport.tsx"
INSPECTOR = "apps/web/src/components/workplane/ShapeInspector.tsx"

def patch(path, subs):
    with open(path, encoding="utf-8") as f:
        s = f.read()
    # Vorabprüfung
    for old, _new, expected, name in subs:
        c = s.count(old)
        if c != expected:
            print(f"  FEHLER in {path}: '{name}' erwartet {expected}x, gefunden {c}x")
            return False, None
    for old, new, _expected, name in subs:
        s = s.replace(old, new)
        print(f"  OK   {name}")
    return True, s

def main():
    # --- Fix 1: Viewport-Signatur ---
    viewport_subs = [
        (
            '''function shapeGeometrySignature(shape: WorkplaneShape): string {
  const taper = shape.kind === "gear" || !shapeHasTaper(shape)''',
            '''function shapeGeometrySignature(shape: WorkplaneShape): string {
  if (shape.kind === "reference") {
    // The reference cross has no mesh geometry; its visible size is driven by
    // crossArm/markerRadius. Include them so changing the size rebuilds the
    // cross immediately instead of only when some other field changes.
    return JSON.stringify({
      kind: "reference",
      crossArm: shape.crossArm ?? null,
      markerRadius: shape.markerRadius ?? null,
      height: shape.height,
    });
  }
  const taper = shape.kind === "gear" || !shapeHasTaper(shape)''',
            1, "Viewport: reference-Signatur",
        ),
    ]

    # --- Fix 2: Taper-Card beim Referenzpunkt ausblenden ---
    inspector_subs = [
        (
            '{shape.kind !== "gear" ? (\n        <div className={`property-card ${taperOpen ? "" : "collapsed"}`}>',
            '{shape.kind !== "gear" && shape.kind !== "reference" ? (\n        <div className={`property-card ${taperOpen ? "" : "collapsed"}`}>',
            1, "Inspector: Taper-Card beim Referenzpunkt aus",
        ),
    ]

    print(f"== {VIEWPORT} ==")
    ok1, s1 = patch(VIEWPORT, viewport_subs)
    print(f"== {INSPECTOR} ==")
    ok2, s2 = patch(INSPECTOR, inspector_subs)

    if not (ok1 and ok2):
        print("\nAbgebrochen - nichts verändert. Bitte den fehlenden Anker melden.")
        sys.exit(2)

    with open(VIEWPORT, "w", encoding="utf-8") as f:
        f.write(s1)
    with open(INSPECTOR, "w", encoding="utf-8") as f:
        f.write(s2)
    print("\nFertig - beide Korrekturen angewendet.")

if __name__ == "__main__":
    main()
