import type { Config } from '../config/schema';

/**
 * Keyboard control of the scene.
 *
 * Every control on the canvas is a button somebody has to reach for with a mouse, which is fine
 * for a first visit and tiring for anyone who lives here. The bindings are kept as data so they can
 * be listed back to the reader rather than learned by accident, and so the list and the behaviour
 * cannot drift apart.
 */
export type Action =
  | { kind: 'view'; view: Config['camera']['view'] }
  | { kind: 'layer'; layer: 'roof' | 'walls' | 'lids' | 'labels' | 'dimensions' }
  | { kind: 'trace'; path: 'electrical' | 'cooling' }
  | { kind: 'section' }
  | { kind: 'sectionAxis' }
  | { kind: 'explode'; by: number }
  | { kind: 'walk' }
  | { kind: 'present' }
  | { kind: 'up' }
  | { kind: 'frame' }
  | { kind: 'find' }
  | { kind: 'shortcuts' };

export const shortcuts: { keys: string; label: string; action: Action }[] = [
  { keys: '1', label: 'Isometric view', action: { kind: 'view', view: 'iso' } },
  { keys: '2', label: 'Top view', action: { kind: 'view', view: 'top' } },
  { keys: '3', label: 'Front view', action: { kind: 'view', view: 'front' } },
  { keys: '4', label: 'Side view', action: { kind: 'view', view: 'side' } },
  { keys: 'R', label: 'Container roof', action: { kind: 'layer', layer: 'roof' } },
  { keys: 'W', label: 'Side walls', action: { kind: 'layer', layer: 'walls' } },
  { keys: 'L', label: 'Pack lids', action: { kind: 'layer', layer: 'lids' } },
  { keys: 'N', label: 'Component labels', action: { kind: 'layer', layer: 'labels' } },
  { keys: 'D', label: 'Dimensions', action: { kind: 'layer', layer: 'dimensions' } },
  { keys: 'E', label: 'Electrical path', action: { kind: 'trace', path: 'electrical' } },
  { keys: 'C', label: 'Cooling path', action: { kind: 'trace', path: 'cooling' } },
  { keys: 'S', label: 'Section', action: { kind: 'section' } },
  { keys: 'A', label: 'Section axis', action: { kind: 'sectionAxis' } },
  { keys: '[  ]', label: 'Explode', action: { kind: 'explode', by: 0.1 } },
  { keys: 'G', label: 'Guided walk', action: { kind: 'walk' } },
  { keys: 'P', label: 'Presentation mode', action: { kind: 'present' } },
  { keys: 'F', label: 'Frame the selection', action: { kind: 'frame' } },
  { keys: '/', label: 'Find a component', action: { kind: 'find' } },
  { keys: 'Backspace', label: 'Up one level', action: { kind: 'up' } },
  { keys: '?', label: 'This list', action: { kind: 'shortcuts' } },
];

/** What a key press means, or nothing. Modified presses belong to the browser, not to us. */
export function actionFor(e: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean }): Action | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  if (e.key === '[') return { kind: 'explode', by: -0.1 };
  if (e.key === ']') return { kind: 'explode', by: 0.1 };
  if (e.key === 'Backspace') return { kind: 'up' };
  if (e.key === '/') return { kind: 'find' };
  if (e.key === '?') return { kind: 'shortcuts' };
  const hit = shortcuts.find(s => s.keys.length === 1 && s.keys.toLowerCase() === e.key.toLowerCase());
  return hit && hit.action.kind !== 'explode' ? hit.action : null;
}

/** The scope one level out, or nothing if there is nowhere to go. */
export const parentScope = (scope: string, hasSite: boolean): string | null => {
  if (scope === 'SITE') return null;
  if (scope === 'BESS') return hasSite ? 'SITE' : null;
  const up = scope.split('/').slice(0, -1).join('/');
  return up || 'BESS';
};

/** Typing in a field is typing, not a shortcut. */
export const isTyping = (target: EventTarget | null): boolean => {
  const el = target as HTMLElement | null;
  if (!el?.tagName) return false;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable === true;
};
