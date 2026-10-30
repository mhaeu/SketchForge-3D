/// <reference lib="webworker" />

import type { ManifoldToplevel } from "manifold-3d";
import { runManifoldJob } from "@/lib/manifoldJobs";
import type { ManifoldWorkerRequest, ManifoldWorkerResponse } from "@/lib/manifoldWorkerClient";

let runtimePromise: Promise<ManifoldToplevel> | null = null;

/** Der Kern aus manifold.js und manifold.wasm neben der Seite, wie ihn die Seite laedt. */
function runtime(assetBase: string) {
  runtimePromise ??= import(/* webpackIgnore: true */ new URL("manifold.js", assetBase).href)
    .then((module: { default: (options: { locateFile: (file: string) => string }) => Promise<ManifoldToplevel> }) => module.default({
      locateFile: (file) => new URL(file.endsWith(".wasm") ? "manifold.wasm" : file, assetBase).href,
    }))
    .then((loaded) => {
      loaded.setup();
      return loaded;
    })
    .catch((error) => {
      runtimePromise = null;
      throw error;
    });
  return runtimePromise;
}

function post(message: ManifoldWorkerResponse, transfer: Transferable[] = []) {
  self.postMessage(message, { transfer });
}

self.onmessage = async (event: MessageEvent<ManifoldWorkerRequest>) => {
  const { requestId, assetBase, job } = event.data;
  try {
    const result = runManifoldJob(await runtime(assetBase), job);
    post({ requestId, done: true, result }, result.ok ? result.positions.map((positions) => positions.buffer as ArrayBuffer) : []);
  } catch (error) {
    post({ requestId, done: false, message: error instanceof Error ? error.message : String(error) });
  }
};
