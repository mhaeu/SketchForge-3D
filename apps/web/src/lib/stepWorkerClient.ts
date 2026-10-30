import type { StepMesh, StepWorkerRequest, StepWorkerResponse } from "@/lib/stepMesh";
import { StepReadError } from "@/lib/stepMesh";

/**
 * Der STEP-Worker (workers/step.worker.ts) laedt den CAD-Kern fuer sich. Nach
 * dem letzten Import bleibt er eine Weile stehen, damit mehrere Dateien
 * nacheinander den Kern nur einmal laden, und wird dann beendet - so gibt er
 * den Speicher des Kerns wieder frei.
 */
const STEP_WORKER_IDLE_MS = 30_000;

let worker: Worker | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let requestId = 0;
const pending = new Map<number, (response: StepWorkerResponse | null) => void>();

function stopWorker() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = null;
  worker?.terminate();
  worker = null;
  pending.forEach((settle) => settle(null));
  pending.clear();
}

function ensureWorker() {
  if (worker) return worker;
  const next = new Worker(new URL("../workers/step.worker.ts", import.meta.url), { type: "module" });
  next.onmessage = (event: MessageEvent<StepWorkerResponse>) => {
    const settle = pending.get(event.data.requestId);
    pending.delete(event.data.requestId);
    settle?.(event.data);
    if (pending.size === 0) {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(stopWorker, STEP_WORKER_IDLE_MS);
    }
  };
  // Ein abgestuerzter Worker (Speicher, Laden) laesst die Seite selbst lesen.
  next.onerror = () => stopWorker();
  worker = next;
  return next;
}

/**
 * Das Netz aus dem Worker. null heisst: Der Worker lief nicht, die Seite soll
 * selbst lesen. Taugt die Datei nicht, kommt der StepReadError des Workers.
 */
export async function stepMeshOffThread(buffer: ArrayBuffer): Promise<StepMesh | null> {
  if (typeof Worker === "undefined" || typeof window === "undefined") return null;
  let target: Worker;
  try {
    target = ensureWorker();
  } catch {
    return null;
  }
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = null;
  const id = ++requestId;
  const response = await new Promise<StepWorkerResponse | null>((resolve) => {
    pending.set(id, resolve);
    // Kopiert, nicht uebergeben: die Seite braucht die Bytes noch, falls sie selbst lesen muss.
    const request: StepWorkerRequest = { requestId: id, buffer: buffer.slice(0) };
    target.postMessage(request);
  });
  if (!response) return null;
  if (response.ok) return response.mesh;
  if (response.readError) throw new StepReadError(response.message);
  // Der Kern im Worker ist vielleicht nicht mehr heil; der naechste Import bekommt einen neuen.
  stopWorker();
  return null;
}
