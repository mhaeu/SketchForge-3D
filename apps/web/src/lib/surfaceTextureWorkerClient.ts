import type { SurfaceTextureSettings } from "@/lib/surfaceTexture";
import { textureSurfacePositions, type SurfaceTextureOutcome, type SurfaceTextureWorkerRequest, type SurfaceTextureWorkerResponse } from "@/lib/surfaceTextureShape";

/**
 * Der Worker der Oberflaechenstruktur (workers/surfaceTexture.worker.ts).
 * Ein grosser Koerper braucht ein paar Sekunden; solange bleibt der Editor
 * bedienbar. Wo kein Worker laeuft - im Test und in der Datei-Fassung
 * (file:) -, rechnet die Seite selbst.
 */

let worker: Worker | null = null;
let requestCounter = 0;
const pending = new Map<number, { resolve: (outcome: SurfaceTextureOutcome) => void; reject: (error: Error) => void; timer: number }>();

/** So lange darf eine Struktur dauern, bevor der Editor aufgibt. */
const SURFACE_TEXTURE_TIMEOUT_MS = 120_000;

function stopWorker(message: string) {
  pending.forEach((entry) => {
    window.clearTimeout(entry.timer);
    entry.reject(new Error(message));
  });
  pending.clear();
  worker?.terminate();
  worker = null;
}

function ensureWorker() {
  if (worker) return worker;
  const next = new Worker(new URL("../workers/surfaceTexture.worker.ts", import.meta.url), { type: "module" });
  next.onmessage = (event: MessageEvent<SurfaceTextureWorkerResponse>) => {
    const entry = pending.get(event.data.requestId);
    if (!entry) return;
    window.clearTimeout(entry.timer);
    pending.delete(event.data.requestId);
    if ("error" in event.data) entry.reject(new Error(event.data.error));
    else entry.resolve({ positions: event.data.positions, stats: event.data.stats, fill: event.data.fill });
  };
  next.onerror = () => stopWorker("The surface texture worker stopped");
  worker = next;
  return next;
}

function onPage(positions: Float64Array, settings: SurfaceTextureSettings, maxTriangles?: number) {
  try {
    return Promise.resolve(textureSurfacePositions(positions, settings, maxTriangles));
  } catch (error) {
    return Promise.reject(error instanceof Error ? error : new Error(String(error)));
  }
}

/** Die Dreiecke eines Koerpers im Worker strukturieren; die Punkte werden uebergeben, nicht kopiert. */
export function textureSurfaceOffThread(positions: Float64Array, settings: SurfaceTextureSettings, maxTriangles?: number): Promise<SurfaceTextureOutcome> {
  if (typeof Worker === "undefined" || typeof window === "undefined" || window.location.protocol === "file:") return onPage(positions, settings, maxTriangles);
  let target: Worker;
  try {
    target = ensureWorker();
  } catch {
    return onPage(positions, settings, maxTriangles);
  }
  const requestId = ++requestCounter;
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      pending.delete(requestId);
      // Ein Worker, der so lange rechnet, haengt: Der naechste Versuch bekommt einen frischen.
      stopWorker("The surface texture took too long");
      reject(new Error("The surface texture took too long"));
    }, SURFACE_TEXTURE_TIMEOUT_MS);
    pending.set(requestId, { resolve, reject, timer });
    const request: SurfaceTextureWorkerRequest = { requestId, positions, settings, ...(maxTriangles ? { maxTriangles } : {}) };
    target.postMessage(request, [positions.buffer]);
  });
}
