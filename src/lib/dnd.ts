import { useEffect, useRef, useState, type DragEvent } from 'react';

/** MIME type marking a drag as one of our items, not a file or stray text. */
export const ITEM_DRAG_TYPE = 'application/x-planner-item';

/** Call from a drag source's `onDragStart`. */
export function startItemDrag(e: DragEvent, id: string) {
  // Firefox refuses to start a drag with no data set; the id doubles as a
  // fallback for drop targets that cannot see React state.
  e.dataTransfer.setData(ITEM_DRAG_TYPE, id);
  e.dataTransfer.setData('text/plain', id);
  e.dataTransfer.effectAllowed = 'move';
}

function isItemDrag(e: DragEvent, activeId: string | null) {
  return activeId !== null || e.dataTransfer.types.includes(ITEM_DRAG_TYPE);
}

/**
 * Makes an element accept dropped items. Returns whether an item is currently
 * over it, plus the handlers to spread onto the element.
 *
 * dragenter/dragleave fire for every child the pointer crosses, so a plain
 * boolean flickers as the cursor moves over the rows or cards inside. Counting
 * enters against leaves gives a stable "is the pointer inside" signal.
 */
export function useDropTarget(activeId: string | null, onDrop: (id: string) => void) {
  const depth = useRef(0);
  const [over, setOver] = useState(false);

  useEffect(() => {
    if (activeId === null) {
      depth.current = 0;
      setOver(false);
    }
  }, [activeId]);

  const handlers = {
    onDragEnter(e: DragEvent) {
      if (!isItemDrag(e, activeId)) return;
      e.preventDefault();
      depth.current += 1;
      setOver(true);
    },
    onDragOver(e: DragEvent) {
      if (!isItemDrag(e, activeId)) return;
      // Required, or the browser refuses the drop.
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    },
    onDragLeave(e: DragEvent) {
      if (!isItemDrag(e, activeId)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setOver(false);
    },
    onDrop(e: DragEvent) {
      if (!isItemDrag(e, activeId)) return;
      e.preventDefault();
      depth.current = 0;
      setOver(false);
      const id = activeId ?? e.dataTransfer.getData(ITEM_DRAG_TYPE);
      if (id) onDrop(id);
    },
  };

  return { over, handlers };
}
