// Stellt die manifold-3d-Laufzeit aus dem Paket in die Anwendung.
//
// Vier Stuecke, und bisher lagen alle vier von Hand da - mit dem Ergebnis,
// dass ein `npm i manifold-3d@neu` die Pruefungen auf die neue Fassung hob und
// die Anwendung auf der alten liess. Gemessen beim Sprung auf 3.5.4: Die
// Pruefungen liefen auf 3.5.4, `public/manifold.wasm` war die 539.291 Bytes
// der 3.5.0, und niemand haette es gesehen.
//
// - public/manifold.js und public/manifold.wasm fuer die Seite im Browser. Sie
//   werden mit webpackIgnore geladen, weil Emscripten-Glue das Bundeln nicht
//   uebersteht - derselbe Grund wie beim CAD-Kern.
// - generated/manifoldModuleSource.ts und generated/manifoldWasmBase64.ts fuer
//   den file://-Bau (die Desktop-Fassung), der nichts nachladen kann und beides
//   darum im Quelltext tragen muss.
//
// Laeuft vor dev und build, zusammen mit copy:occt.
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules", "manifold-3d");
const publicDir = join(root, "apps", "web", "public");
const generatedDir = join(root, "apps", "web", "src", "generated");

if (!existsSync(src)) {
  console.error(`[copy-manifold] manifold-3d nicht installiert unter ${src}. Zuerst \`npm install\`.`);
  process.exit(1);
}

const version = JSON.parse(await readFile(join(src, "package.json"), "utf8")).version;
const moduleSource = await readFile(join(src, "manifold.js"), "utf8");
const wasm = await readFile(join(src, "manifold.wasm"));

await mkdir(publicDir, { recursive: true });
await mkdir(generatedDir, { recursive: true });
await cp(join(src, "manifold.js"), join(publicDir, "manifold.js"));
await cp(join(src, "manifold.wasm"), join(publicDir, "manifold.wasm"));

const header = (name) => `// Aus manifold-3d ${version} erzeugt von scripts/copy-manifold.mjs - nicht von Hand aendern.\n`
  + `// ${name} traegt die Laufzeit fuer den file://-Bau, der nichts nachladen kann.\n`;

await writeFile(
  join(generatedDir, "manifoldModuleSource.ts"),
  `${header("manifoldModuleSource")}export const manifoldModuleSource = ${JSON.stringify(moduleSource)};\n`,
);
await writeFile(
  join(generatedDir, "manifoldWasmBase64.ts"),
  `${header("manifoldWasmBase64")}export const manifoldWasmBase64 = ${JSON.stringify(wasm.toString("base64"))};\n`,
);

console.log(`[copy-manifold] manifold-3d ${version} gestellt: public/manifold.{js,wasm} und zwei erzeugte Quellen`);
