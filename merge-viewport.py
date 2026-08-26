#!/usr/bin/env python3
"""
Fügt die drei Referenzpunkt-Blöcke in den offiziellen WorkplaneViewport.tsx ein.
Aufruf im Projekt-Wurzelverzeichnis (SketchForge-3D):

    python3 merge-viewport.py apps/web/src/components/WorkplaneViewport.tsx

Das Skript ist idempotent (mehrfaches Ausführen schadet nicht) und bricht mit
klarer Meldung ab, falls ein Anker fehlt - dann wurde nichts verändert.
"""
import sys

def main():
    if len(sys.argv) != 2:
        print("Aufruf: python3 merge-viewport.py <pfad-zu-WorkplaneViewport.tsx>")
        sys.exit(1)
    path = sys.argv[1]
    with open(path, encoding="utf-8") as f:
        s = f.read()

    if "REFERENCE_POINT_ARM_MM" in s and 'shape.kind === "reference"' in s:
        print("Referenzpunkt-Blöcke sind bereits vorhanden - nichts zu tun.")
        return

    edits = []

    # --- 1. Import ---
    anchor1 = 'import type { CadModifierEdge } from "@/lib/cadModifierTypes";'
    insert1 = ('import { REFERENCE_POINT_ARM_MM, REFERENCE_POINT_MARKER_MM, referencePointPosition } from "@/lib/referencePoint";\n'
               + anchor1)
    edits.append(("Import referencePoint", anchor1, insert1))

    # --- 2. referencePoint-Prop am ShapeInspector ---
    anchor2 = ('''        <ShapeInspector
          shape={selectedShape}
          snap={snap}''')
    insert2 = ('''        <ShapeInspector
          shape={selectedShape}
          referencePoint={referencePointPosition(shapes)}
          snap={snap}''')
    edits.append(("referencePoint-Prop", anchor2, insert2))

    # --- 3. Kreuz-Rendering in createShapeObject ---
    anchor3 = ('''  group.scale.set(mirrorSign(shape.mirrorX), mirrorSign(shape.mirrorY), mirrorSign(shape.mirrorZ));

  if (shape.groupedShapes?.length && !shape.importedMesh) {''')
    insert3 = ('''  group.scale.set(mirrorSign(shape.mirrorX), mirrorSign(shape.mirrorY), mirrorSign(shape.mirrorZ));

  if (shape.kind === "reference") {
    // Reference point: a fixed-size axis cross plus a center sphere, drawn on
    // top of everything so it stays visible in front of geometry. Not a
    // printable mesh - excluded from every export and boolean path elsewhere.
    // The group origin sits at the object center (elevation + height/2), so the
    // cross is built around local y = -height/2 to land exactly on the point.
    const arm = shape.crossArm ?? REFERENCE_POINT_ARM_MM;
    const markerRadius = shape.markerRadius ?? REFERENCE_POINT_MARKER_MM;
    const centerY = -shape.height / 2;
    const axisMat = (hex: number) =>
      new THREE.LineBasicMaterial({ color: hex, depthTest: false, transparent: true });
    const line = (from: THREE.Vector3, to: THREE.Vector3, hex: number) => {
      const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
      const seg = new THREE.Line(geo, axisMat(hex));
      seg.renderOrder = 999;
      return seg;
    };
    const c = new THREE.Vector3(0, centerY, 0);
    group.add(line(new THREE.Vector3(-arm, centerY, 0), new THREE.Vector3(arm, centerY, 0), 0xe5484d)); // X red
    group.add(line(new THREE.Vector3(0, centerY - arm, 0), new THREE.Vector3(0, centerY + arm, 0), 0x30a46c)); // Y green
    group.add(line(new THREE.Vector3(0, centerY, -arm), new THREE.Vector3(0, centerY, arm), 0x0091ff)); // Z blue
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(Math.max(0.05, markerRadius), 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xf5c542, depthTest: false, transparent: true }),
    );
    sphere.position.copy(c);
    sphere.renderOrder = 1000;
    group.add(sphere);
    group.traverse((child) => {
      child.userData.shapeId = shape.id;
    });
    setObjectRenderLayer(group, RENDER_LAYER_SHAPES);
    return group;
  }

  if (shape.groupedShapes?.length && !shape.importedMesh) {''')
    edits.append(("Kreuz-Rendering", anchor3, insert3))

    # Prüfen, dass jeder Anker genau einmal vorkommt
    for name, anchor, _ in edits:
        count = s.count(anchor)
        if count == 0:
            print(f"FEHLER: Anker für '{name}' nicht gefunden. Nichts verändert.")
            sys.exit(2)
        if count > 1:
            print(f"FEHLER: Anker für '{name}' kommt {count}x vor (mehrdeutig). Nichts verändert.")
            sys.exit(2)

    # Alle Anker eindeutig - jetzt einfügen
    for name, anchor, insert in edits:
        s = s.replace(anchor, insert, 1)
        print(f"  OK   {name}")

    with open(path, "w", encoding="utf-8") as f:
        f.write(s)
    print("\nFertig - drei Blöcke eingefügt.")

if __name__ == "__main__":
    main()
