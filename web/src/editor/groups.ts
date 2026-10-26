import type { DesignDoc, Layer, LayerGroup } from '../../../src/shared/types';
import { uid } from '../../../src/shared/layers';

export function membersOf(doc: DesignDoc, gid: string): string[] {
  return doc.layers.filter((l) => l.groupId === gid).map((l) => l.id);
}

export function groupOf(doc: DesignDoc, id: string): LayerGroup | null {
  const l = doc.layers.find((x) => x.id === id);
  if (!l?.groupId) return null;
  return doc.groups?.find((g) => g.id === l.groupId) ?? null;
}

/** group exactly matching the selection (or null) */
export function selectedGroup(doc: DesignDoc, sel: string[]): LayerGroup | null {
  if (!sel.length) return null;
  const g = groupOf(doc, sel[0]);
  if (!g) return null;
  const m = membersOf(doc, g.id);
  return m.length === sel.length && m.every((id) => sel.includes(id)) ? g : null;
}

/** keep z-order but make the given layers contiguous at the position of the topmost one */
function gather(layers: Layer[], ids: string[]): Layer[] {
  const picked = layers.filter((l) => ids.includes(l.id));
  const top = Math.max(...picked.map((l) => layers.indexOf(l)));
  const rest = layers.filter((l) => !ids.includes(l.id));
  const insertAt = rest.findIndex((l) => layers.indexOf(l) > top);
  const at = insertAt < 0 ? rest.length : insertAt;
  return [...rest.slice(0, at), ...picked, ...rest.slice(at)];
}

export function makeGroup(doc: DesignDoc, ids: string[], name?: string): { doc: DesignDoc; gid: string } {
  const gid = uid('g');
  const n = (doc.groups?.length ?? 0) + 1;
  // layers that were in other groups leave them
  const layers = gather(
    doc.layers.map((l) => (ids.includes(l.id) ? { ...l, groupId: gid } : l)),
    ids,
  );
  return { doc: cleanup({ ...doc, layers, groups: [...(doc.groups ?? []), { id: gid, name: name ?? `Група ${n}` }] }), gid };
}

export function ungroup(doc: DesignDoc, gid: string): DesignDoc {
  return cleanup({ ...doc, layers: doc.layers.map((l) => (l.groupId === gid ? { ...l, groupId: null } : l)) });
}

export function cleanup(doc: DesignDoc): DesignDoc {
  const used = new Set(doc.layers.map((l) => l.groupId).filter(Boolean));
  const groups = (doc.groups ?? []).filter((g) => used.has(g.id));
  return { ...doc, groups };
}

export function patchGroup(doc: DesignDoc, gid: string, patch: Partial<LayerGroup>): DesignDoc {
  return { ...doc, groups: (doc.groups ?? []).map((g) => (g.id === gid ? { ...g, ...patch } : g)) };
}

/** move a set of layers (keeping their relative order) up/down/top/bottom */
export function moveSet(doc: DesignDoc, ids: string[], dir: 'up' | 'down' | 'top' | 'bottom'): DesignDoc {
  const layers = doc.layers;
  const picked = layers.filter((l) => ids.includes(l.id));
  const rest = layers.filter((l) => !ids.includes(l.id));
  const firstIdx = layers.indexOf(picked[0]);
  // index in "rest" where the block currently starts
  let at = rest.filter((l) => layers.indexOf(l) < firstIdx).length;
  if (dir === 'top') at = rest.length;
  else if (dir === 'bottom') at = 0;
  else if (dir === 'up') at = Math.min(rest.length, at + 1);
  else at = Math.max(0, at - 1);
  return { ...doc, layers: [...rest.slice(0, at), ...picked, ...rest.slice(at)] };
}

export function duplicateSet(doc: DesignDoc, ids: string[], offset = 20): { doc: DesignDoc; ids: string[] } {
  const groupMap = new Map<string, string>();
  const newGroups: LayerGroup[] = [];
  const copies: Layer[] = [];
  for (const l of doc.layers.filter((x) => ids.includes(x.id))) {
    let groupId = l.groupId ?? null;
    // a whole group duplicated → the copy becomes its own group
    if (groupId && membersOf(doc, groupId).every((m) => ids.includes(m))) {
      if (!groupMap.has(groupId)) {
        const ng = uid('g');
        groupMap.set(groupId, ng);
        const og = doc.groups?.find((g) => g.id === groupId);
        newGroups.push({ ...(og ?? { name: 'Група' }), id: ng, name: `${og?.name ?? 'Група'} копія` });
      }
      groupId = groupMap.get(groupId)!;
    } else groupId = null;
    copies.push({ ...structuredClone(l), id: uid(), name: `${l.name} копія`, x: l.x + offset, y: l.y + offset, groupId } as Layer);
  }
  return { doc: { ...doc, layers: [...doc.layers, ...copies], groups: [...(doc.groups ?? []), ...newGroups] }, ids: copies.map((c) => c.id) };
}
