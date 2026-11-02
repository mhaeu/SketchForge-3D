import { cloneWorkplaneShapeTreeWithFreshIds } from "@/lib/workplaneShapes";
import type { WorkplaneShape } from "@/types/sketchforge";

/**
 * Bringing objects back from an earlier state of the history: a copy of each,
 * exactly as it was then and where it was then, with ids of its own so it can
 * sit beside the version of itself the design has now.
 *
 * Nach Layerling. Das Oeffnen einer Gruppe (`restoreGroupedChildren`) lebt in
 * SketchForge im Editor; es kommt darum als `openGroup` herein.
 */

/** Legt die Teile einer Gruppe auf die Platte, so wie "Gruppe bearbeiten" es tut. */
export type GroupOpener = (group: WorkplaneShape) => WorkplaneShape[];

/**
 * An object of a state, wherever it is in the tree, at its place on the plate.
 * A part inside groups comes out level by level the way Edit group lays it
 * out, so a turned, scaled or mirrored group puts it where it showed.
 */
export function findShapeInHistoryState(shapes: readonly WorkplaneShape[], id: string, openGroup: GroupOpener): WorkplaneShape | null {
  for (const shape of shapes) {
    if (shape.id === id) return shape;
  }
  for (const shape of shapes) {
    const parts = shape.groupedShapes;
    if (!parts?.length || !containsShape(parts, id)) continue;
    // Opening a group gives its parts new ids, in the order of the group's own list.
    const placed = openGroup(shape);
    const index = parts.findIndex((part) => part.id === id || containsShape(part.groupedShapes ?? [], id));
    const part = placed[index];
    if (!part) return null;
    if (parts[index].id === id) return { ...part, id };
    return findShapeInHistoryState([{ ...part, groupedShapes: parts[index].groupedShapes }], id, openGroup);
  }
  return null;
}

function containsShape(shapes: readonly WorkplaneShape[], id: string): boolean {
  return shapes.some((shape) => shape.id === id || containsShape(shape.groupedShapes ?? [], id));
}

/**
 * The copies to add to the design for the picked objects of a state, in the
 * order they were picked. Ids that the state does not hold are skipped, and
 * so is an object inside another one that is picked too - it comes along
 * with it.
 */
export function broughtBackShapes(shapes: readonly WorkplaneShape[], ids: readonly string[], openGroup: GroupOpener): WorkplaneShape[] {
  const wanted = [...new Set(ids)];
  return wanted.flatMap((id) => {
    const insidePicked = wanted.some((other) => other !== id && containsShape(findShapeInHistoryState(shapes, other, openGroup)?.groupedShapes ?? [], id));
    if (insidePicked) return [];
    const shape = findShapeInHistoryState(shapes, id, openGroup);
    return shape ? [cloneWorkplaneShapeTreeWithFreshIds(shape, "restore")] : [];
  });
}

type HistoryStatePart = { id: string; name: string; kind: string; parts?: HistoryStatePart[] };

/**
 * The parts inside a group, at every depth, for AI tools: the ids they pass to
 * bring back one part without its group. Nothing for an object that is no group.
 */
export function historyStatePartsTree(shape: WorkplaneShape): { parts?: HistoryStatePart[] } {
  if (!shape.groupedShapes?.length) return {};
  return {
    parts: shape.groupedShapes.map((part) => ({ id: part.id, name: part.name, kind: part.kind, ...historyStatePartsTree(part) })),
  };
}

/**
 * When a state was recorded, as short as it can be told apart: the time for a
 * state of today, the date with it for an older one. Null for a state from
 * before the history recorded times.
 */
export function historyStateClockLabel(at: number | undefined, language: string, now: number = Date.now()): string | null {
  if (typeof at !== "number" || !Number.isFinite(at)) return null;
  const when = new Date(at);
  const today = new Date(now);
  const sameDay = when.getFullYear() === today.getFullYear() && when.getMonth() === today.getMonth() && when.getDate() === today.getDate();
  try {
    return new Intl.DateTimeFormat(language, sameDay ? { timeStyle: "short" } : { dateStyle: "short", timeStyle: "short" }).format(when);
  } catch {
    return sameDay ? when.toLocaleTimeString() : when.toLocaleString();
  }
}

/** When a state was recorded, in the language of the interface; null without a time. */
export function formatHistoryStateTime(at: number | undefined, language: string) {
  if (typeof at !== "number" || !Number.isFinite(at)) return null;
  try {
    return new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(at));
  } catch {
    return new Date(at).toLocaleString();
  }
}

/** What the History view shows with groups opened in it: the shapes, and the groups that are open. */
export type HistoryViewLevels = {
  shapes: WorkplaneShape[];
  /** The open groups, outermost first, as far as the state still has them. */
  open: WorkplaneShape[];
};

/**
 * The shapes of a state with groups opened in it, level by level, the way
 * Edit group lays out their parts - but only to look at. The parts keep the
 * ids they have inside the group, so a part picked here is found again in
 * the state when it is brought back. Each level must be a group among the
 * shapes of the level before; the first one that is not ends the opening,
 * so moving to a state without that group backs out of it.
 */
export function historyViewLevels(shapes: WorkplaneShape[], levelIds: readonly string[], openGroup: GroupOpener): HistoryViewLevels {
  let shown = shapes;
  const open: HistoryViewLevels["open"] = [];
  for (const id of levelIds) {
    const group = shown.find((shape) => shape.id === id);
    const parts = group?.groupedShapes;
    if (!group || !parts?.length) break;
    const placed = openGroup(group).map((part, index) => ({ ...part, id: parts[index].id }));
    const at = shown.indexOf(group);
    shown = [...shown.slice(0, at), ...placed, ...shown.slice(at + 1)];
    open.push(group);
  }
  return { shapes: shown, open };
}
