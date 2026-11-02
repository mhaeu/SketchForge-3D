import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from "react";

/** Wie weit ein Druck wandern darf und noch ein Klick ist; weiter dreht er die Ansicht. */
const PICK_ONLY_CLICK_PIXELS = 5;

/**
 * Selecting without editing, for the History view: the objects of an earlier
 * state can be picked to bring them back, but nothing in the view moves.
 * Nach Layerling.
 */
export type PickOnlySelection = {
  /** The picked objects, drawn with the selection outline. */
  ids: string[];
  /** A click on an object (or on nothing, with null). `toggle` is Shift: add or remove it. */
  onPick: (id: string | null, toggle: boolean) => void;
};

/**
 * Pointer handlers for pick-only mode. They stand in for the 3D view's own
 * handlers, so no tool, handle or drag can start. A press that is let go
 * where it started picks; a press that travels turns the view, which the
 * camera controls handle on their own.
 */
export function usePickOnlyPointer(
  selection: PickOnlySelection | null | undefined,
  pick: (clientX: number, clientY: number, pointerType: string) => string | null,
) {
  const pressRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const selectionRef = useRef(selection);
  selectionRef.current = selection;

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    pressRef.current = event.button === 0 && event.isPrimary
      ? { pointerId: event.pointerId, x: event.clientX, y: event.clientY }
      : null;
  }, []);

  const onPointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const press = pressRef.current;
    pressRef.current = null;
    const current = selectionRef.current;
    if (!current || !press || press.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - press.x, event.clientY - press.y) >= PICK_ONLY_CLICK_PIXELS) return;
    current.onPick(pick(event.clientX, event.clientY, event.pointerType), event.shiftKey);
  }, [pick]);

  const onPointerCancel = useCallback(() => {
    pressRef.current = null;
  }, []);

  return { onPointerDown, onPointerUp, onPointerCancel };
}
