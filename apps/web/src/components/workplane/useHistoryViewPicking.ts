import { useCallback, useEffect, useMemo, useState } from "react";
import { historyStateAt, type EditorHistoryEntry, type ResolvedHistoryState } from "@/lib/editorHistory";
import { broughtBackShapes, formatHistoryStateTime, historyStateClockLabel, historyViewLevels, type GroupOpener } from "@/lib/historyRestore";
import { t } from "@/lib/i18n";
import type { WorkplaneShape } from "@/types/sketchforge";

type BringBackOptions = {
  /** The history as it stands now. */
  entries: () => EditorHistoryEntry[];
  /** Closes the History view, which blocks every edit while it is open. */
  closeView: () => void;
  /** Adds the copies to the design as one step, selected, with this message. */
  commit: (copies: WorkplaneShape[], message: string) => void;
  /** Legt die Teile einer Gruppe aus, wie "Gruppe bearbeiten" es tut. */
  openGroup: GroupOpener;
  language: string;
};

/**
 * What the History view has picked and opened, apart from the design: the
 * objects picked to bring back, and the groups opened to reach parts inside
 * them. Opening only lays the parts out to look at - nothing in the design or
 * the history changes. Moving to another state keeps what that state still
 * holds; closing the view forgets it all. Nach Layerling.
 */
export function useHistoryViewPicking(view: ResolvedHistoryState | null, { entries, closeView, commit, openGroup, language }: BringBackOptions) {
  const [picked, setPicked] = useState<string[]>([]);
  const [levelIds, setLevelIds] = useState<string[]>([]);

  const levels = useMemo(() => (view ? historyViewLevels(view.shapes, levelIds, openGroup) : null), [levelIds, openGroup, view]);
  const shapes = levels?.shapes ?? null;

  useEffect(() => {
    if (!levels) {
      setPicked((current) => (current.length ? [] : current));
      setLevelIds((current) => (current.length ? [] : current));
      return;
    }
    // A state without one of the open groups ends the opening there.
    setLevelIds((current) => (levels.open.length < current.length ? current.slice(0, levels.open.length) : current));
    setPicked((current) => {
      const kept = current.filter((id) => levels.shapes.some((shape) => shape.id === id));
      return kept.length === current.length ? current : kept;
    });
  }, [levels]);

  const onPick = useCallback((id: string | null, toggle: boolean) => {
    setPicked((current) => {
      if (!id) return toggle ? current : [];
      if (!toggle) return [id];
      return current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id];
    });
  }, []);

  const pickOnly = useMemo(() => (view ? { ids: picked, onPick } : null), [onPick, picked, view]);

  /** The picked object, when it is exactly one group: what Open group opens. */
  const pickedGroup = useMemo(() => {
    if (picked.length !== 1 || !shapes) return null;
    const shape = shapes.find((candidate) => candidate.id === picked[0]);
    return shape?.groupedShapes?.length ? shape : null;
  }, [picked, shapes]);

  /** Opens the picked group, its parts picked - as Edit group selects them in the design. */
  const openPickedGroup = useCallback(() => {
    if (!pickedGroup) return false;
    setLevelIds((current) => [...current, pickedGroup.id]);
    setPicked(pickedGroup.groupedShapes?.map((part) => part.id) ?? []);
    return true;
  }, [pickedGroup]);

  /** Closes the innermost open group, the group itself picked. */
  const backOut = useCallback(() => {
    const innermost = levels?.open.at(-1);
    if (!innermost) return;
    setLevelIds((current) => current.slice(0, -1));
    setPicked([innermost.id]);
  }, [levels]);

  /**
   * Adds copies of objects from a state of the history to the design, as they
   * were then and where they were then, as one step that Undo takes back. Each
   * is named after the time of the state, to tell it from the version the
   * design has now. Ids may be of parts at any depth inside groups.
   */
  const bringBack = useCallback((index: number, ids: readonly string[]) => {
    const state = historyStateAt(entries(), index);
    if (!state) return [];
    const originals = broughtBackShapes(state.shapes, ids, openGroup);
    if (originals.length === 0) return [];
    const clock = historyStateClockLabel(state.entry.at, language);
    const copies = originals.map((copy) => (
      clock ? { ...copy, name: t("historyView.copyName", { name: copy.name, time: clock }) } : copy
    ));
    const time = formatHistoryStateTime(state.entry.at, language);
    const values = { name: originals[0].name, count: copies.length, time: time ?? "", index: state.index + 1 };
    closeView();
    commit(copies, copies.length === 1
      ? t(time ? "status.broughtBackOne" : "status.broughtBackOneNoTime", values)
      : t(time ? "status.broughtBackMany" : "status.broughtBackManyNoTime", values));
    return copies;
  }, [closeView, commit, entries, language, openGroup]);

  return { shapes, open: levels?.open ?? [], picked, pickOnly, pickedGroup, openPickedGroup, backOut, bringBack };
}
