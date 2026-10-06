/**
 * overhangShader.ts
 *
 * Die Schraffur fuer Ueberhaenge, als Flicken an den Standard-Shader.
 *
 * Gerechnet wird je Bildpunkt aus der Normale der Flaeche in Weltkoordinaten:
 * Zeigt sie steiler nach unten als die Schwelle und liegt die Stelle nicht auf
 * der Platte, bekommt sie das Muster. Je Bildpunkt und nicht je Dreieck, weil
 * eine runde Flaeche sonst in Streifen zerfiele.
 *
 * Rot *und* weiss, damit es auch auf einem roten Koerper zu sehen ist. Das
 * Muster laeuft in Bildschirmkoordinaten und nicht auf der Flaeche: So bleibt
 * es beim Drehen und Zoomen gleich breit und liest sich als Hinweis auf dem
 * Koerper, nicht als Teil seiner Oberflaeche.
 *
 * Eigene Datei, weil die drei Anker (`common`, `project_vertex`,
 * `color_fragment`) three.js gehoeren: Faellt einer bei einem Versionssprung
 * weg, schraffiert nichts mehr, und zwar lautlos. Hier daneben steht die
 * Probe, die das merkt.
 *
 * Nach Layerling 1.33.0.
 */

/** Alle angefassten Materialien tragen denselben Shader. */
export const OVERHANG_PROGRAM_CACHE_KEY = "sketchforge-overhang";

const VERTEX_DECLARATIONS = "varying vec3 vOverhangNormal;\nvarying float vOverhangY;";

const FRAGMENT_DECLARATIONS = [
  "varying vec3 vOverhangNormal;",
  "varying float vOverhangY;",
  "uniform float uOverhangOn;",
  "uniform float uOverhangLimit;",
  "uniform float uOverhangPlateY;",
  "uniform vec3 uOverhangColor;",
].join("\n");

/**
 * Die Normale muss mit der transponierten Inversen gedreht werden und nicht
 * mit der Modellmatrix selbst: Ein ungleichmaessig gezogener Koerper wuerde
 * seine Normalen sonst verkanten, und eine senkrechte Wand erschiene als
 * Ueberhang.
 */
const VERTEX_BODY = [
  "vOverhangNormal = normalize( transpose( inverse( mat3( modelMatrix ) ) ) * objectNormal );",
  "vOverhangY = ( modelMatrix * vec4( transformed, 1.0 ) ).y;",
].join("\n");

const FRAGMENT_BODY = "if ( uOverhangOn > 0.5 && vOverhangY > uOverhangPlateY && -normalize( vOverhangNormal ).y > uOverhangLimit ) diffuseColor.rgb = mod( gl_FragCoord.x + gl_FragCoord.y, 14.0 ) < 7.0 ? uOverhangColor : vec3( 1.0, 0.86, 0.82 );";

export function patchOverhangVertexShader(source: string) {
  return source
    .replace("#include <common>", `#include <common>\n${VERTEX_DECLARATIONS}`)
    .replace("#include <project_vertex>", `#include <project_vertex>\n${VERTEX_BODY}`);
}

export function patchOverhangFragmentShader(source: string) {
  return source
    .replace("#include <common>", `#include <common>\n${FRAGMENT_DECLARATIONS}`)
    .replace("#include <color_fragment>", `#include <color_fragment>\n${FRAGMENT_BODY}`);
}

/** Woran die Flicken haengen - die Probe prueft jeden einzeln. */
export const OVERHANG_SHADER_ANCHORS = {
  vertex: ["#include <common>", "#include <project_vertex>"],
  fragment: ["#include <common>", "#include <color_fragment>"],
} as const;
