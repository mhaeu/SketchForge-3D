/**
 * fileDownload.ts
 *
 * Eine Datei beim Benutzer ablegen - im Browser oder, wenn er einen Ordner
 * eingestellt hat, ueber den Server geradewegs dorthin.
 *
 * Die Entscheidung stand bisher zweimal im Programm, in der Startseite und im
 * Editor, samt der beiden Schluessel im Speicher des Browsers. Hier steht sie
 * einmal.
 */

export const DOWNLOAD_MODE_STORAGE_KEY = "sketchForge.downloadMode";
export const DOWNLOAD_FOLDER_STORAGE_KEY = "sketchForge.downloadFolder";

export type DownloadResult = { mode: "browser" } | { mode: "folder"; path: string };

/** Der eingestellte Ordner, oder nichts - dann geht es ueber den Browser. */
export function chosenDownloadFolder(staticExportBuild: boolean): string | null {
  if (staticExportBuild || typeof window === "undefined") return null;
  const mode = window.localStorage.getItem(DOWNLOAD_MODE_STORAGE_KEY);
  const folder = window.localStorage.getItem(DOWNLOAD_FOLDER_STORAGE_KEY)?.trim() ?? "";
  return mode === "folder" && folder ? folder : null;
}

/** Der Weg ueber den Browser: ein Verweis, der sich selbst anklickt. */
export function triggerBrowserBlobDownload(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadBlobToChosenPlace(
  filename: string,
  blob: Blob,
  options: { staticExportBuild: boolean; failureMessage: string },
): Promise<DownloadResult> {
  const folder = chosenDownloadFolder(options.staticExportBuild);
  if (folder) {
    const formData = new FormData();
    formData.set("file", blob, filename);
    formData.set("filename", filename);
    formData.set("folder", folder);
    const response = await fetch("/api/local-download", { method: "POST", body: formData });
    const payload = (await response.json().catch(() => null)) as { error?: string; path?: string } | null;
    if (!response.ok || !payload?.path) throw new Error(payload?.error ?? options.failureMessage);
    return { mode: "folder", path: payload.path };
  }
  triggerBrowserBlobDownload(filename, blob);
  return { mode: "browser" };
}

/**
 * Ein Name, der sich als Datei ablegen laesst.
 *
 * Schraegstriche, Doppelpunkte und Steuerzeichen gehen nicht; ein Punkt am
 * Anfang macht die Datei unsichtbar. Bleibt nichts uebrig, kommt `fallback`.
 */
export function safeFileName(name: string, fallback = "design") {
  const cleaned = name
    .replace(/[\u0000-\u001f<>:"/\\|?*]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[.\s]+/, "")
    .replace(/[.\s]+$/, "")
    .slice(0, 80)
    .trim();
  return cleaned.length > 0 ? cleaned : fallback;
}

/**
 * Derselbe Name zweimal geht in einem Archiv nicht - der zweite ueberschriebe
 * den ersten. Ab dem zweiten haengt darum eine Zahl an.
 */
export function uniqueFileName(name: string, taken: Set<string>) {
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : "";
  let candidate = name;
  let counter = 2;
  while (taken.has(candidate.toLowerCase())) {
    candidate = `${stem} (${counter})${extension}`;
    counter += 1;
  }
  taken.add(candidate.toLowerCase());
  return candidate;
}
