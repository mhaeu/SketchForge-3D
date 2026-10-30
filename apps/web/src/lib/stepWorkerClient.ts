import type { WorkplaneShape } from "@/types/sketchforge";
import { StepExportEmptyError, type StepExportResult } from "@/lib/stepExportCore";
import { StepReadError, type StepMesh, type StepWorkerRequest, type StepWorkerResponse } from "@/lib/stepMesh";

/**
 * Der STEP-Worker (workers/step.worker.ts) laedt den CAD-Kern fuer sich. Nach
 * dem letzten Auftrag bleibt er eine Weile stehen, damit mehrere Dateien
 * nacheinander den Kern nur einmal laden, und wird dann beendet - so gibt er
 * den Speicher des Kerns wieder frei.
 */
const STEP_WORKER_IDLE_MS = 30_000;

type StepWorkerTask = StepWorkerRequest extends infer Request ? Request extends unknown ? Omit<Request, "requestId"> : never : never;

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
  // Ein abgestuerzter Worker (Speicher, Laden) laesst die Seite selbst rechnen.
  next.onerror = () => stopWorker();
  worker = next;
  return next;
}

/**
 * Die Antwort des Workers. null heisst: Der Worker lief nicht, die Seite soll
 * selbst rechnen. Taugt die Datei nicht oder ist nichts zu schreiben, kommt
 * derselbe Fehler wie auf der Seite.
 */
async function runInStepWorker(task: StepWorkerTask): Promise<StepWorkerResponse & { ok: true } | null> {
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
    try {
      target.postMessage({ ...task, requestId: id } as StepWorkerRequest);
    } catch {
      // Laesst sich der Auftrag nicht uebergeben, rechnet die Seite.
      pending.delete(id);
      resolve(null);
    }
  });
  if (!response) return null;
  if (response.ok) return response;
  if (response.failure === "read") throw new StepReadError(response.message);
  if (response.failure === "empty") throw new StepExportEmptyError();
  // Der Kern im Worker ist vielleicht nicht mehr heil; der naechste Auftrag bekommt einen neuen.
  stopWorker();
  return null;
}

/** Das Netz einer STEP-Datei aus dem Worker, oder null: dann liest die Seite selbst. */
export async function stepMeshOffThread(buffer: ArrayBuffer): Promise<StepMesh | null> {
  // Kopiert, nicht uebergeben: die Seite braucht die Bytes noch, falls sie selbst lesen muss.
  const response = await runInStepWorker({ type: "import", buffer: buffer.slice(0) });
  return response && "mesh" in response ? response.mesh : null;
}

/** Die STEP-Datei der Formen aus dem Worker, oder null: dann schreibt die Seite selbst. */
export async function stepExportOffThread(shapes: WorkplaneShape[]): Promise<StepExportResult | null> {
  const response = await runInStepWorker({ type: "export", shapes });
  return response && "exported" in response ? response.exported : null;
}
