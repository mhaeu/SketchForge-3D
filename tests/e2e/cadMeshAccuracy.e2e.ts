import { beforeAll, describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { OcctKernel, type ShapeHandle } from "occt-wasm";
import { MAX_REFINED_TRIANGLES, cadMeshStraysFromFaces, meshTreatedBody } from "@/lib/cadMeshAccuracy";
import { cadModifierTessellationDeflection } from "@/lib/cadModifierRuntime";
import type { CadModifierDeflection, CadModifierQuality } from "@/lib/cadModifierTypes";

/**
 * Haelt ein Verrundungsnetz seine eigene Zusage ein?
 *
 * Die lineare Abweichung sagt zu, wie weit das Netz hoechstens von der wahren
 * Flaeche abliegen darf. An einer Verrundung um eine runde Kante hielt
 * OpenCascade sie nicht ein - das ist der Saegezahn, den man erst in der
 * Scheibendatei sieht. Darum laeuft hier der echte Kern aus node_modules, wie
 * beim Aushoehlen und beim STEP-Durchlauf: Die Frage ist nicht, ob unser Code
 * rechnet, sondern wie weit das Netz des Kerns abliegt.
 */

let cad: OcctKernel;

beforeAll(async () => {
  const wasm = join(dirname(fileURLToPath(import.meta.resolve("occt-wasm"))), "occt-wasm.wasm");
  cad = await OcctKernel.init({ wasm });
}, 180000);

/** Der gemessene Fall: eine kleine Verrundung um eine grosse runde Kante. */
function filletedCylinder(radius: number, height: number, amount: number) {
  const cylinder = cad.makeCylinder(radius, height);
  const edges = cad.getSubShapes(cylinder, "edge");
  return cad.fillet(cylinder, [edges[0]], amount);
}

function optionsFor(deflection: CadModifierDeflection) {
  return { linearDeflection: deflection.linear, angularDeflection: deflection.angular };
}

/** Wie weit der schlechteste Dreiecksschwerpunkt einer Torusflaeche abliegt. */
function worstStrayOnTorus(shape: ShapeHandle, deflection: CadModifierDeflection) {
  cad.tessellate(shape, optionsFor(deflection));
  const faces = cad.getSubShapes(shape, "face");
  let worst = 0;
  for (const face of faces) {
    if (cad.surfaceType(face) !== "torus") continue;
    const { positions, indices, triangleCount } = cad.tessellate(face, optionsFor(deflection));
    for (let triangle = 0; triangle < triangleCount; triangle += 1) {
      const a = indices[triangle * 3] * 3;
      const b = indices[triangle * 3 + 1] * 3;
      const c = indices[triangle * 3 + 2] * 3;
      const x = (positions[a] + positions[b] + positions[c]) / 3;
      const y = (positions[a + 1] + positions[b + 1] + positions[c + 1]) / 3;
      const z = (positions[a + 2] + positions[b + 2] + positions[c + 2]) / 3;
      const projected = cad.projectPointOnFace(face, { x, y, z });
      worst = Math.max(worst, Math.hypot(projected.x - x, projected.y - y, projected.z - z));
    }
  }
  return worst;
}

describe("Das Netz einer Verrundung liegt von seiner Flaeche ab", () => {
  /**
   * Zuerst der Fehler selbst, ohne unseren Code dazwischen: Eine Verrundung
   * von 0,5 mm um einen Zylinder von 60 mm liegt bei unserer Standardguete
   * 0,1236 mm von der wahren Torusflaeche ab - das Fuenffache der 0,025 mm,
   * die die Guete zusagt. Faellt diese Pruefung, hat der Kern sich geaendert
   * und die ganze Datei ist zu ueberdenken.
   */
  it("weicht bei der Standardguete um das Fuenffache der Zusage ab", () => {
    const deflection = cadModifierTessellationDeflection("standard", 0.5);
    expect(deflection).toEqual({ linear: 0.025, angular: 0.16 });
    const worst = worstStrayOnTorus(filletedCylinder(30, 20, 0.5), deflection);
    expect(worst).toBeGreaterThan(deflection.linear * 4);
    expect(worst).toBeCloseTo(0.1236, 3);
  }, 300000);

  it("und die Pruefung sagt genau das", () => {
    const deflection = cadModifierTessellationDeflection("standard", 0.5);
    const body = filletedCylinder(30, 20, 0.5);
    cad.tessellate(body, optionsFor(deflection));
    expect(cadMeshStraysFromFaces(cad, body, optionsFor(deflection))).toBe(true);
  }, 300000);

  /**
   * Ein engerer Winkel hilft - aber nur einer frischen Abschrift. Dieselbe
   * Form noch einmal zu vernetzen gibt Dreieck fuer Dreieck dasselbe Netz
   * zurueck, weil OpenCascade ein vorhandenes Netz behaelt. Daran scheitert
   * jeder Anlauf, der ohne `copy` auskommen will, und zwar lautlos.
   */
  it("aber nur auf einer frischen Abschrift - ein vorhandenes Netz bleibt liegen", () => {
    const body = filletedCylinder(30, 20, 0.5);
    const loose = { linear: 0.025, angular: 0.16 };
    const tight = { linear: 0.025, angular: 0.1 };
    const first = cad.tessellate(body, optionsFor(loose)).triangleCount;
    expect(cad.tessellate(body, optionsFor(tight)).triangleCount).toBe(first);
    expect(cad.tessellate(cad.copy(body), optionsFor(tight)).triangleCount).toBeGreaterThan(first);
  }, 300000);
});

describe("meshTreatedBody haelt die Zusage jeder Guete ein", () => {
  function meshed(quality: CadModifierQuality, amount: number) {
    const deflection = cadModifierTessellationDeflection(quality, amount);
    const body = filletedCylinder(30, 20, amount);
    const result = meshTreatedBody(cad, [body], body, deflection);
    const strays = cadMeshStraysFromFaces(cad, result.result, optionsFor(result.deflection));
    return { ...result, strays, requested: deflection };
  }

  it("zieht den Winkel bei der Standardguete auf 0,1 an", () => {
    const result = meshed("standard", 0.5);
    expect(result.deflection).toEqual({ linear: 0.025, angular: 0.1 });
    expect(result.strays).toBe(false);
    expect(result.mesh.triangleCount).toBe(8564);
  }, 300000);

  /**
   * Die feine Guete sagt mehr zu (0,0125 mm) und braucht darum den zweiten
   * Schritt: Bei 0,1 liegt das Netz noch 0,0608 mm ab, bei 0,05 nur 0,0021.
   * Das kostet Dreiecke - 32.756 - bleibt aber unter der Obergrenze.
   */
  it("und bei der feinen Guete auf 0,05", () => {
    const result = meshed("fine", 0.5);
    expect(result.deflection).toEqual({ linear: 0.0125, angular: 0.05 });
    expect(result.strays).toBe(false);
    expect(result.mesh.triangleCount).toBe(32756);
    expect(result.mesh.triangleCount).toBeLessThanOrEqual(MAX_REFINED_TRIANGLES);
  }, 300000);

  /**
   * Die Entwurfsguete bleibt unberuehrt - nicht aus Nachsicht, sondern weil
   * sie ihre eigene, groebere Zusage (0,05 mm) einhaelt: gemessen 0,0238 mm.
   * Wer Entwurf waehlt, bekommt 1.690 Dreiecke und kein Nachvernetzen.
   */
  it("laesst die Entwurfsguete in Ruhe, die ihre eigene Zusage einhaelt", () => {
    const result = meshed("draft", 0.5);
    expect(result.deflection).toEqual(result.requested);
    expect(result.strays).toBe(false);
    expect(result.mesh.triangleCount).toBe(1690);
  }, 300000);

  /**
   * Und wo nichts abliegt, wird nichts angefasst: Eine verrundete Kiste hat
   * Ebenen, Zylinder und Kugeln - alles Arten, die nicht nachgemessen werden.
   * Derselbe Griff kommt zurueck, nicht eine Abschrift.
   */
  it("gibt bei einer verrundeten Kiste denselben Koerper unveraendert zurueck", () => {
    const deflection = cadModifierTessellationDeflection("standard", 2);
    const box = cad.makeBox(40, 30, 20);
    const body = cad.fillet(box, cad.getSubShapes(box, "edge"), 2);
    const result = meshTreatedBody(cad, [body], body, deflection);
    expect(result.result).toBe(body);
    expect(result.components).toEqual([body]);
    expect(result.deflection).toEqual(deflection);
  }, 300000);

  /**
   * Mehrere Teile auf einmal: Das Nachvernetzen baut den Verbund neu und gibt
   * die alten Teile frei. Was zurueckkommt, muss der Aufrufer freigeben - und
   * es muss so viele Teile sein, wie hineingingen.
   */
  it("behaelt bei mehreren Teilen deren Anzahl", () => {
    const deflection = cadModifierTessellationDeflection("standard", 0.5);
    const parts = [filletedCylinder(30, 20, 0.5), filletedCylinder(20, 10, 0.5)];
    const compound = cad.makeCompound(parts);
    const result = meshTreatedBody(cad, [...parts], compound, deflection);
    expect(result.components).toHaveLength(2);
    expect(result.deflection.angular).toBe(0.1);
    expect(cadMeshStraysFromFaces(cad, result.result, optionsFor(result.deflection))).toBe(false);
  }, 300000);
});
