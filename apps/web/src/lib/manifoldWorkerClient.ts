import type { ManifoldJob, ManifoldJobResult } from "@/lib/manifoldJobs";

/**
 * Der Geometrie-Worker (workers/manifold.worker.ts) laedt den Manifold-Kern
 * fuer sich und bleibt fuer die naechsten Schnitte stehen. Antwortet er nicht
 * oder stuerzt er ab, rechnet die Seite wie bisher selbst.
 */
export type ManifoldWorkerRequest = { requestId: number; assetBase: string; job: ManifoldJob };
export type ManifoldWorkerResponse =
  | { requestId: number; done: true; result: ManifoldJobResult }
  /** Der Kern lief nicht; die Seite rechnet selbst. */
  | { requestId: number; done: false; message: string };

let worker: Worker | null = null;
let requestId = 0;
const pending = new Map<number, (response: ManifoldWorkerResponse | null) => void>();

function stopWorker() {
  worker?.terminate();
  worker = null;
  pending.forEach((settle) => settle(null));
  pending.clear();
}

function ensureWorker() {
  if (worker) return worker;
  const next = new Worker(new URL("../workers/manifold.worker.ts", import.meta.url), { type: "module" });
  next.onmessage = (event: MessageEvent<ManifoldWorkerResponse>) => {
    const settle = pending.get(event.data.requestId);
    pending.delete(event.data.requestId);
    settle?.(event.data);
  };
  next.onerror = () => stopWorker();
  worker = next;
  return next;
}

/**
 * Das Ergebnis aus dem Worker, oder null: dann rechnet die Seite. Die Netze
 * werden kopiert, nicht uebergeben, weil die Seite sie dafuer noch braucht.
 * Eine Datei-Fassung (file:) laedt den Kern aus der Seite selbst, dort gibt
 * es keinen Worker-Weg.
 */
export async function manifoldJobOffThread(job: ManifoldJob, assetBase: string): Promise<ManifoldJobResult | null> {
  if (typeof Worker === "undefined" || typeof window === "undefined" || window.location.protocol === "file:") return null;
  let target: Worker;
  try {
    target = ensureWorker();
  } catch {
    return null;
  }
  const id = ++requestId;
  const response = await new Promise<ManifoldWorkerResponse | null>((resolve) => {
    pending.set(id, resolve);
    try {
      target.postMessage({ requestId: id, assetBase, job } satisfies ManifoldWorkerRequest);
    } catch {
      pending.delete(id);
      resolve(null);
    }
  });
  if (!response) return null;
  if (response.done) return response.result;
  stopWorker();
  return null;
}
