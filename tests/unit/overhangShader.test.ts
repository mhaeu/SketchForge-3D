import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  OVERHANG_SHADER_ANCHORS,
  patchOverhangFragmentShader,
  patchOverhangVertexShader,
} from "@/lib/overhangShader";

/**
 * Der Shader der Koerper: `MeshStandardMaterial` rechnet mit dem Programm
 * "physical". Genau an dessen Quellen haengen die Flicken.
 */
const physical = THREE.ShaderLib.physical;

describe("Die Anker im three.js-Shader", () => {
  /**
   * Der Grund fuer diese Probe: `String.replace` ohne Treffer gibt die
   * Zeichenkette unveraendert zurueck. Faellt einer der Anker bei einem
   * Versionssprung weg, schraffiert nichts mehr - und niemand merkt es, weil
   * nichts bricht.
   */
  it("sind alle noch da", () => {
    OVERHANG_SHADER_ANCHORS.vertex.forEach((anchor) => {
      expect(physical.vertexShader, anchor).toContain(anchor);
    });
    OVERHANG_SHADER_ANCHORS.fragment.forEach((anchor) => {
      expect(physical.fragmentShader, anchor).toContain(anchor);
    });
  });
});

describe("Die Flicken", () => {
  it("setzen die Normale in Weltkoordinaten in den Punkt-Shader", () => {
    const patched = patchOverhangVertexShader(physical.vertexShader);
    expect(patched).toContain("varying vec3 vOverhangNormal;");
    expect(patched).toContain("vOverhangY = ( modelMatrix * vec4( transformed, 1.0 ) ).y;");
    /*
     * Die transponierte Inverse und nicht die Modellmatrix selbst: Sonst
     * verkantet ein ungleichmaessig gezogener Koerper seine Normalen, und eine
     * senkrechte Wand erschiene als Ueberhang.
     */
    expect(patched).toContain("transpose( inverse( mat3( modelMatrix ) ) )");
  });

  it("setzen die Entscheidung in den Flaechen-Shader", () => {
    const patched = patchOverhangFragmentShader(physical.fragmentShader);
    expect(patched).toContain("uniform float uOverhangLimit;");
    expect(patched).toContain("-normalize( vOverhangNormal ).y > uOverhangLimit");
    // Was auf der Platte liegt, braucht keine Stuetze.
    expect(patched).toContain("vOverhangY > uOverhangPlateY");
    // Rot und weiss im Wechsel, damit es auf jedem Koerper zu sehen ist.
    expect(patched).toContain("uOverhangColor : vec3( 1.0, 0.86, 0.82 )");
  });

  it("legen die Erklaerungen vor ihren Gebrauch", () => {
    const vertex = patchOverhangVertexShader(physical.vertexShader);
    expect(vertex.indexOf("varying float vOverhangY;")).toBeLessThan(vertex.indexOf("vOverhangY = ("));
    const fragment = patchOverhangFragmentShader(physical.fragmentShader);
    expect(fragment.indexOf("uniform float uOverhangLimit;")).toBeLessThan(fragment.indexOf("> uOverhangLimit"));
  });

  it("ruehren den Shader nicht an, wo der Anker fehlt", () => {
    expect(patchOverhangVertexShader("void main() {}")).toBe("void main() {}");
    expect(patchOverhangFragmentShader("void main() {}")).toBe("void main() {}");
  });
});
