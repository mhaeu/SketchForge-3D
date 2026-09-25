import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SERVER = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "scripts",
  "sketchforge-mcp-server.mjs",
);

/**
 * Schickt Zeilen an den Server und sammelt, was zurueckkommt. Es wird kein
 * laufender Editor gebraucht: Die hier geprueften Methoden beantwortet der
 * Server aus sich selbst.
 */
function talkToServer(lines: readonly unknown[]) {
  return new Promise<Record<string, unknown>[]>((resolve, reject) => {
    // Eine Adresse, hinter der nichts horcht: Wuerde eine Nachricht doch nach
    // draussen gehen, liefe der Test in seinen Zeitablauf statt gruen zu sein.
    const child = spawn(process.execPath, [SERVER], {
      env: { ...process.env, SKETCHFORGE_URL: "http://127.0.0.1:1" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { out += chunk; });
    child.on("error", reject);
    child.on("close", () => {
      try {
        resolve(out.split(/\r?\n/).filter((line) => line.trim()).map((line) => JSON.parse(line)));
      } catch (error) {
        reject(error);
      }
    });
    lines.forEach((line) => child.stdin.write(`${JSON.stringify(line)}\n`));
    child.stdin.end();
  });
}

/**
 * Eine Nachricht ohne id ist nach JSON-RPC eine Benachrichtigung, und auf die
 * darf nicht geantwortet werden. Abgefangen war nur
 * "notifications/initialized"; jede andere - "notifications/cancelled" etwa,
 * die ein Client beim Abbrechen schickt - lief bis zur Fehlerantwort durch,
 * und die trug dann eine leere id.
 */
describe("der MCP-Server und die Benachrichtigungen", () => {
  it("schweigt zu jeder Nachricht ohne id", async () => {
    const answers = await talkToServer([
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: 7 } },
      { jsonrpc: "2.0", method: "notifications/irgendwas" },
      { jsonrpc: "2.0", id: null, method: "ping" },
    ]);

    expect(answers).toEqual([]);
  }, 20_000);

  it("antwortet weiterhin auf alles, was eine id traegt", async () => {
    const answers = await talkToServer([
      { jsonrpc: "2.0", method: "notifications/cancelled" },
      { jsonrpc: "2.0", id: 0, method: "ping" },
      { jsonrpc: "2.0", id: 1, method: "tools/list" },
      { jsonrpc: "2.0", id: 2, method: "gibt/es/nicht" },
    ]);

    // Die id 0 ist erlaubt und darf nicht als "keine id" durchfallen.
    expect(answers.map((answer) => answer.id)).toEqual([0, 1, 2]);
    expect(answers[1].result).toHaveProperty("tools");
    expect(answers[2].error).toMatchObject({ code: -32601 });
  }, 20_000);

  it("meldet kaputtes JSON weiterhin zurueck", async () => {
    // Der Sonderfall der Norm: Bei einem Parserfehler ist eine leere id
    // richtig, weil sich keine lesen laesst.
    const child = await new Promise<string>((resolve, reject) => {
      const proc = spawn(process.execPath, [SERVER], { stdio: ["pipe", "pipe", "pipe"] });
      let out = "";
      proc.stdout.setEncoding("utf8");
      proc.stdout.on("data", (chunk: string) => { out += chunk; });
      proc.on("error", reject);
      proc.on("close", () => resolve(out));
      proc.stdin.write("{ kein json\n");
      proc.stdin.end();
    });

    expect(JSON.parse(child.trim())).toMatchObject({ id: null, error: { code: -32700 } });
  }, 20_000);
});
