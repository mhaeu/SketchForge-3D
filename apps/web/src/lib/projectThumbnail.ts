export const PROJECT_THUMBNAIL_IDLE_MS = 2_500;
export const PROJECT_THUMBNAIL_MAX_WIDTH = 512;
export const PROJECT_THUMBNAIL_MAX_HEIGHT = 320;

export type ProjectThumbnailSceneKey = {
  projectId: string;
  fingerprint: string;
};

export function projectThumbnailDimensions(
  sourceWidth: number,
  sourceHeight: number,
  maxWidth = PROJECT_THUMBNAIL_MAX_WIDTH,
  maxHeight = PROJECT_THUMBNAIL_MAX_HEIGHT,
) {
  const width = Math.max(1, Math.round(Number.isFinite(sourceWidth) ? sourceWidth : 1));
  const height = Math.max(1, Math.round(Number.isFinite(sourceHeight) ? sourceHeight : 1));
  const scale = Math.min(1, maxWidth / width, maxHeight / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function projectThumbnailSceneChanged(
  previous: ProjectThumbnailSceneKey | null,
  current: ProjectThumbnailSceneKey,
) {
  return previous?.projectId === current.projectId && previous.fingerprint !== current.fingerprint;
}

/**
 * Der Ordner mit den Projektbildern auf dem Server. Die Route dahinter hat
 * keine Anmeldung: Wer sie erreicht, kann unter immer neuen Kennungen
 * hochladen. Ohne eine Grenze fuer den ganzen Ordner laeuft damit die Platte
 * voll - die Grenze pro Bild allein haelt das nicht auf.
 */
export const PROJECT_THUMBNAIL_DIR_MAX_BYTES = 256 * 1024 * 1024;

export type StoredThumbnail = {
  path: string;
  bytes: number;
  /** Wann zuletzt geschrieben - das aelteste faellt zuerst. */
  writtenAt: number;
};

/**
 * Welche Bilder weichen muessen, damit der Ordner wieder unter die Grenze
 * passt. Das gerade geschriebene bleibt in jedem Fall stehen, sonst raeumte
 * ein einzelner grosser Upload sich selbst wieder weg.
 *
 * Eine Kachel ohne Bild ist kein Schaden: Die Uebersicht zeigt dann die
 * schlichte Karte.
 */
export function thumbnailsToDrop(
  stored: readonly StoredThumbnail[],
  keepPath: string,
  limitBytes = PROJECT_THUMBNAIL_DIR_MAX_BYTES,
) {
  let total = stored.reduce((sum, file) => sum + file.bytes, 0);
  if (total <= limitBytes) return [];
  const dropped: string[] = [];
  const oldestFirst = [...stored].sort((a, b) => a.writtenAt - b.writtenAt);
  for (const file of oldestFirst) {
    if (total <= limitBytes) break;
    if (file.path === keepPath) continue;
    dropped.push(file.path);
    total -= file.bytes;
  }
  return dropped;
}
