import { useCallback, useRef, useState } from 'react';
import type { DesignDoc, Layer } from '../../../src/shared/types';

const LIMIT = 100;

/** Document state with undo/redo. Rapid edits sharing a merge key collapse into one history step. */
export function useDocHistory(initial: DesignDoc) {
  const [doc, setDocState] = useState(initial);
  const past = useRef<DesignDoc[]>([]);
  const future = useRef<DesignDoc[]>([]);
  const lastMerge = useRef<{ key: string; t: number } | null>(null);
  const docRef = useRef(doc);
  docRef.current = doc;
  const [, bump] = useState(0);

  const update = useCallback((fn: (d: DesignDoc) => DesignDoc, mergeKey?: string) => {
    const cur = docRef.current;
    const next = fn(cur);
    if (next === cur) return;
    const now = Date.now();
    const merge = mergeKey && lastMerge.current && lastMerge.current.key === mergeKey && now - lastMerge.current.t < 1000;
    if (!merge) {
      past.current.push(cur);
      if (past.current.length > LIMIT) past.current.shift();
    }
    lastMerge.current = mergeKey ? { key: mergeKey, t: now } : null;
    future.current = [];
    docRef.current = next;
    setDocState(next);
  }, []);

  const reset = useCallback((d: DesignDoc) => {
    past.current = [];
    future.current = [];
    docRef.current = d;
    setDocState(d);
  }, []);

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(docRef.current);
    docRef.current = prev;
    lastMerge.current = null;
    setDocState(prev);
    bump((x) => x + 1);
  }, []);

  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(docRef.current);
    docRef.current = next;
    lastMerge.current = null;
    setDocState(next);
    bump((x) => x + 1);
  }, []);

  /** end a drag gesture so the next one starts a new history step */
  const breakMerge = useCallback(() => {
    lastMerge.current = null;
  }, []);

  return { doc, docRef, update, reset, undo, redo, breakMerge, canUndo: past.current.length > 0, canRedo: future.current.length > 0 };
}

export function patchLayer(doc: DesignDoc, id: string, patch: Partial<Layer>): DesignDoc {
  return { ...doc, layers: doc.layers.map((l) => (l.id === id ? ({ ...l, ...patch } as Layer) : l)) };
}
