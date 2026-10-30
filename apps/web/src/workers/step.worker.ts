/// <reference lib="webworker" />

import { OcctKernel } from "occt-wasm";
import { CAD_MODIFIER_RUNTIME_BASE } from "@/lib/cadModifierRuntime";
import { StepReadError, stepMeshFromBuffer, type StepWorkerRequest, type StepWorkerResponse } from "@/lib/stepMesh";

type Brep = typeof import("brepjs");

let brepPromise: Promise<Brep> | null = null;

/**
 * brepjs mit einem eigenen Kern. Der Kern wird so geladen wie im CAD-Worker
 * (die Emscripten-Datei aus /occt, die Klasse aus dem Paket), weil dieser Weg
 * in einem Worker schon laeuft.
 */
function brep() {
  const moduleUrl = `${CAD_MODIFIER_RUNTIME_BASE}/occt-wasm.js`;
  brepPromise ??= Promise.all([
    import("brepjs"),
    import(/* webpackIgnore: true */ moduleUrl).then((imported: { default: (options?: { locateFile?: (path: string) => string }) => Promise<unknown> }) => imported.default({
      locateFile: (path) => path.endsWith(".wasm") ? `${CAD_MODIFIER_RUNTIME_BASE}/occt-wasm.wasm` : path,
    })),
  ]).then(([brepjs, module]) => {
    const KernelConstructor = OcctKernel as unknown as new (rawModule: unknown) => OcctKernel;
    brepjs.registerKernel("occt-wasm", brepjs.OcctWasmAdapter.fromKernel(new KernelConstructor(module)));
    return brepjs;
  }).catch((error) => {
    brepPromise = null;
    throw error;
  });
  return brepPromise;
}

function post(message: StepWorkerResponse, transfer: Transferable[] = []) {
  self.postMessage(message, { transfer });
}

self.onmessage = async (event: MessageEvent<StepWorkerRequest>) => {
  const { requestId, buffer } = event.data;
  try {
    const mesh = await stepMeshFromBuffer(await brep(), buffer);
    post({ requestId, ok: true, mesh }, [mesh.positions.buffer, ...(mesh.normals ? [mesh.normals.buffer] : [])]);
  } catch (error) {
    post({ requestId, ok: false, readError: error instanceof StepReadError, message: error instanceof Error ? error.message : String(error) });
  }
};
