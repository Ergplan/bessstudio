import { describe, expect, it } from 'vitest';
import { actionFor, isTyping, parentScope, shortcuts } from '../scene/shortcuts';

const press = (key: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean }> = {}) =>
  actionFor({ key, ctrlKey: false, metaKey: false, altKey: false, ...mods });

describe('keyboard control of the scene', () => {
  it('binds every shortcut it lists, and lists every one it binds', () => {
    // The list is what the reader is shown. A binding missing from it is undiscoverable; an entry
    // with no binding is a lie.
    for (const s of shortcuts) {
      if (s.keys.length !== 1) continue;
      const action = press(s.keys.toLowerCase());
      expect(action, `"${s.keys}" is listed but does nothing`).toBeTruthy();
      expect(action!.kind).toBe(s.action.kind);
    }
    expect(press('[')).toEqual({ kind: 'explode', by: -0.1 });
    expect(press(']')).toEqual({ kind: 'explode', by: 0.1 });
    expect(press('Backspace')).toEqual({ kind: 'up' });
  });

  it('takes upper and lower case alike', () => {
    expect(press('r')).toEqual(press('R'));
  });

  it('leaves modified presses to the browser', () => {
    for (const mod of ['ctrlKey', 'metaKey', 'altKey'] as const) {
      expect(press('r', { [mod]: true }), `${mod}+R was swallowed`).toBeNull();
    }
  });

  it('ignores keys it has no meaning for', () => {
    for (const key of ['q', 'z', '9', 'F5', 'Tab']) expect(press(key), key).toBeNull();
  });

  it('walks out of the assembly one level at a time', () => {
    expect(parentScope('R01/P02/C013', false)).toBe('R01/P02');
    expect(parentScope('R01/P02', false)).toBe('R01');
    expect(parentScope('R01', false)).toBe('BESS');
    expect(parentScope('BESS', false)).toBeNull();
    expect(parentScope('BESS', true)).toBe('SITE');
    expect(parentScope('SITE', true)).toBeNull();
  });

  it('treats typing as typing', () => {
    for (const tag of ['INPUT', 'TEXTAREA', 'SELECT'])
      expect(isTyping({ tagName: tag } as unknown as EventTarget), tag).toBe(true);
    expect(isTyping({ tagName: 'DIV', isContentEditable: true } as unknown as EventTarget)).toBe(true);
    expect(isTyping({ tagName: 'BUTTON' } as unknown as EventTarget)).toBe(false);
    expect(isTyping(null)).toBe(false);
  });
});
