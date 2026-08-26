#!/usr/bin/env python3
"""
Fügt den Variable-Fillet-Teil in den offiziellen SketchForgeEditor.tsx ein.
Der Referenzpunkt-Teil ist bereits drin (separater Merge) - dieses Skript
ergänzt NUR die Fillet-Stücke.

Die Toolbar-Zeile für den variablen Fillet kann aktiv oder deaktiviert
eingebaut werden:

    python3 merge-editor-fillet.py apps/web/src/components/SketchForgeEditor.tsx --aktiv
    python3 merge-editor-fillet.py apps/web/src/components/SketchForgeEditor.tsx --deaktiviert

--aktiv     : Toolbar-Zeile aktiv (zum Testen, ob filletVariable im neuen
              Kernel läuft). Der variable Fillet erscheint als Werkzeug.
--deaktiviert: Toolbar-Zeile bleibt auskommentiert (wie im Original, wegen des
              früheren WASM-Absturzes). Der Code ist vollständig, aber das
              Werkzeug erscheint nicht.

Idempotent und sicher: prüft jeden Anker vorab, ändert nichts bei Fehlern.
"""
import sys

def main():
    if len(sys.argv) != 3 or sys.argv[2] not in ("--aktiv", "--deaktiviert"):
        print("Aufruf: python3 merge-editor-fillet.py <pfad> [--aktiv|--deaktiviert]")
        sys.exit(1)
    path = sys.argv[1]
    aktiv = sys.argv[2] == "--aktiv"
    with open(path, encoding="utf-8") as f:
        s = f.read()

    if "onVariableFillet" in s:
        print("Fillet-Teil bereits vorhanden - nichts zu tun.")
        return

    # Toolbar-Zeile: aktiv oder auskommentiert
    if aktiv:
        toolbar_line = '''    { label: "Fillet", icon: ToolbarFilletIcon, action: onFillet, enabled: canEdgeModify, active: edgeModifierKind === "fillet" },
    { label: "Variable fillet", icon: ToolbarVariableFilletIcon, action: onVariableFillet, enabled: canEdgeModify, active: edgeModifierKind === "variableFillet" },'''
    else:
        toolbar_line = '''    { label: "Fillet", icon: ToolbarFilletIcon, action: onFillet, enabled: canEdgeModify, active: edgeModifierKind === "fillet" },
    // Variable fillet: fruehere occt-wasm-Builds loesten bei filletVariable
    // einen WASM-Speicherfehler aus. Zum Aktivieren die naechste Zeile
    // einkommentieren (Icon-Import ToolbarVariableFilletIcon ist vorhanden).
    // { label: "Variable fillet", icon: ToolbarVariableFilletIcon, action: onVariableFillet, enabled: canEdgeModify, active: edgeModifierKind === "variableFillet" },'''

    subs = [
        # 1. Import Icon
        (
            "  ToolbarFilletIcon,",
            "  ToolbarFilletIcon,\n  ToolbarVariableFilletIcon,",
            1, "Import ToolbarVariableFilletIcon",
        ),
        # 2. State-Init im startEdgeModifier
        (
            """      amount,
      sharpAngle: 25,
      chamferAngle: 45,
      quality: "standard",
      tangentChain: defaultCadModifierTangentChain(appliedEdgeTreatmentCount),""",
            """      amount,
      sharpAngle: 25,
      chamferAngle: 45,
      endAmount: Math.max(0, amount / 2),
      flipTaper: false,
      quality: "standard",
      tangentChain: defaultCadModifierTangentChain(appliedEdgeTreatmentCount),""",
            1, "State-Init endAmount/flipTaper",
        ),
        # 3. MCP-Handler kind-Auswertung
        (
            '    const kind: CadModifierKind = params.kind === "fillet" ? "fillet" : "chamfer";',
            '''    const kind: CadModifierKind = params.kind === "fillet"
      ? "fillet"
      : params.kind === "variableFillet"
        ? "variableFillet"
        : "chamfer";''',
            1, "MCP kind-Auswertung",
        ),
        # 4. MCP endAmount/flipTaper Definition
        (
            "    const chamferAngle = Math.max(5, Math.min(85, mcpNumber(params.chamferAngle, 45)));\n    const quality: CadModifierQuality = params.quality === \"draft\" || params.quality === \"fine\" ? params.quality : \"standard\";",
            "    const chamferAngle = Math.max(5, Math.min(85, mcpNumber(params.chamferAngle, 45)));\n    const endAmount = Math.max(0, mcpNumber(params.endAmount, amount / 2));\n    const flipTaper = params.flipTaper === true;\n    const quality: CadModifierQuality = params.quality === \"draft\" || params.quality === \"fine\" ? params.quality : \"standard\";",
            1, "MCP endAmount/flipTaper Definition",
        ),
        # 5. MCP Worker-Anfrage (erste Fehlerstelle)
        (
            """      amount,
      quality,
      chamferAngle,
    }, [], 30000);
    if (previewResponse.type !== "preview") {""",
            """      amount,
      quality,
      chamferAngle,
      endAmount,
      flipTaper,
    }, [], 30000);
    if (previewResponse.type !== "preview") {""",
            1, "MCP Worker-Anfrage",
        ),
        # 6. MCP edgeTreatment-Feature
        (
            '      ...(kind === "chamfer" ? { chamferAngle } : {}),\n    } satisfies NonNullable<WorkplaneShape["edgeTreatments"]>[number];',
            '      ...(kind === "chamfer" ? { chamferAngle } : {}),\n      ...(kind === "variableFillet" ? { endAmount, flipTaper } : {}),\n    } satisfies NonNullable<WorkplaneShape["edgeTreatments"]>[number];',
            1, "MCP edgeTreatment-Feature",
        ),
        # 7. MCP session-Objekt
        (
            """      amount,
      sharpAngle,
      chamferAngle,
      quality,
      tangentChain: false,
      preserveEdgeSize,""",
            """      amount,
      sharpAngle,
      chamferAngle,
      endAmount,
      flipTaper,
      quality,
      tangentChain: false,
      preserveEdgeSize,""",
            1, "MCP session-Objekt",
        ),
        # 8. Apply edgeTreatment-Feature (edgeModifier.kind)
        (
            "      ...(edgeModifier.kind === \"chamfer\" ? { chamferAngle: edgeModifier.chamferAngle } : {}),\n    } satisfies NonNullable<WorkplaneShape[\"edgeTreatments\"]>[number];",
            "      ...(edgeModifier.kind === \"chamfer\" ? { chamferAngle: edgeModifier.chamferAngle } : {}),\n      ...(edgeModifier.kind === \"variableFillet\" ? { endAmount: edgeModifier.endAmount, flipTaper: edgeModifier.flipTaper } : {}),\n    } satisfies NonNullable<WorkplaneShape[\"edgeTreatments\"]>[number];",
            1, "Apply edgeTreatment-Feature",
        ),
        # 9. Preview Worker-Anfrage (zweite Fehlerstelle)
        (
            """        amount: edgeModifier.amount,
        quality: edgeModifier.quality,
        chamferAngle: edgeModifier.chamferAngle,
      });""",
            """        amount: edgeModifier.amount,
        quality: edgeModifier.quality,
        chamferAngle: edgeModifier.chamferAngle,
        endAmount: edgeModifier.endAmount,
        flipTaper: edgeModifier.flipTaper,
      });""",
            1, "Preview Worker-Anfrage",
        ),
        # 10. SecondaryToolbar onVariableFillet-Aufruf
        (
            '        onFillet={() => edgeModifier?.kind === "fillet" ? cancelEdgeModifier() : startEdgeModifier("fillet")}',
            '        onFillet={() => edgeModifier?.kind === "fillet" ? cancelEdgeModifier() : startEdgeModifier("fillet")}\n        onVariableFillet={() => edgeModifier?.kind === "variableFillet" ? cancelEdgeModifier() : startEdgeModifier("variableFillet")}',
            1, "onVariableFillet-Aufruf",
        ),
        # 11. Panel-Props endAmount/flipTaper
        (
            """          amount={edgeModifier.amount}
          maxAmount={edgeModifierMaxAmount}
          chamferAngle={edgeModifier.chamferAngle}
          quality={edgeModifier.quality}""",
            """          amount={edgeModifier.amount}
          maxAmount={edgeModifierMaxAmount}
          chamferAngle={edgeModifier.chamferAngle}
          endAmount={edgeModifier.endAmount}
          flipTaper={edgeModifier.flipTaper}
          quality={edgeModifier.quality}""",
            1, "Panel-Props endAmount/flipTaper",
        ),
        # 12. Panel onEndAmountChange/onFlipTaperChange
        (
            """          onChamferAngleChange={(value) => setEdgeModifier((current) => current?.prepared ? { ...current, chamferAngle: Math.max(5, Math.min(85, value)), preview: null, busy: true, error: null } : current)}
          onQualityChange={""",
            """          onChamferAngleChange={(value) => setEdgeModifier((current) => current?.prepared ? { ...current, chamferAngle: Math.max(5, Math.min(85, value)), preview: null, busy: true, error: null } : current)}
          onEndAmountChange={(value) => setEdgeModifier((current) => current?.prepared ? { ...current, endAmount: Math.max(0, value), preview: null, busy: true, error: null } : current)}
          onFlipTaperChange={(value) => setEdgeModifier((current) => current?.prepared ? { ...current, flipTaper: value, preview: null, busy: true, error: null } : current)}
          onQualityChange={""",
            1, "Panel onEndAmountChange/onFlipTaperChange",
        ),
        # 13. SecondaryToolbar Destructuring
        (
            "  onGroup,\n  onIntersect,\n  onFillet,\n  onMirror,",
            "  onGroup,\n  onIntersect,\n  onFillet,\n  onVariableFillet,\n  onMirror,",
            1, "Toolbar Destructuring",
        ),
        # 14. SecondaryToolbar Typ
        (
            "  onGroup: () => void;\n  onIntersect: () => void;\n  onFillet: () => void;\n  onMirror: () => void;",
            "  onGroup: () => void;\n  onIntersect: () => void;\n  onFillet: () => void;\n  onVariableFillet: () => void;\n  onMirror: () => void;",
            1, "Toolbar Typ",
        ),
        # 15. Toolbar-Zeile (aktiv oder deaktiviert)
        (
            '    { label: "Fillet", icon: ToolbarFilletIcon, action: onFillet, enabled: canEdgeModify, active: edgeModifierKind === "fillet" },',
            toolbar_line,
            1, "Toolbar-Zeile (" + ("aktiv" if aktiv else "deaktiviert") + ")",
        ),
    ]

    # Vorabprüfung
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
    print(f"\nFertig - Fillet-Teil eingefügt (Toolbar {'AKTIV' if aktiv else 'deaktiviert'}).")

if __name__ == "__main__":
    main()
