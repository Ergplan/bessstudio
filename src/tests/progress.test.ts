import { beforeEach, describe, expect, it } from 'vitest';
import { completedLessons, markLessonComplete, clearLessonProgress, nextUnfinished, progressOf } from '../sim/progress';

const ORDER = ['lesson-1', 'lesson-2', 'lesson-3'];

/** A minimal storage, so the module is tested against the thing it actually talks to. */
class Memory implements Storage {
  private map = new Map<string, string>();
  get length() { return this.map.size; }
  clear() { this.map.clear(); }
  getItem(k: string) { return this.map.get(k) ?? null; }
  key(i: number) { return [...this.map.keys()][i] ?? null; }
  removeItem(k: string) { this.map.delete(k); }
  setItem(k: string, v: string) { this.map.set(k, v); }
}

describe('lesson progress', () => {
  beforeEach(() => {
    (globalThis as { localStorage?: Storage }).localStorage = new Memory();
    clearLessonProgress();
  });

  it('remembers what was finished, once each', () => {
    expect(completedLessons()).toEqual([]);
    markLessonComplete('lesson-1');
    markLessonComplete('lesson-1');
    markLessonComplete('lesson-2');
    expect(completedLessons()).toEqual(['lesson-1', 'lesson-2']);
  });

  it('offers the first card not done, in the order of the argument', () => {
    expect(nextUnfinished(ORDER, [])).toBe('lesson-1');
    expect(nextUnfinished(ORDER, ['lesson-1'])).toBe('lesson-2');
    // Out of order: the gap is still the next thing, not the one after the last one opened.
    expect(nextUnfinished(ORDER, ['lesson-2', 'lesson-3'])).toBe('lesson-1');
    expect(nextUnfinished(ORDER, ORDER)).toBeNull();
  });

  it('counts only cards that are actually in the sequence', () => {
    // A lesson id left over from an older build must not make the count read 4 of 3.
    expect(progressOf(ORDER, ['lesson-1', 'lesson-removed'])).toEqual({ done: 1, total: 3, fraction: 1 / 3 });
  });

  it('survives storage that is missing, unreadable or full', () => {
    delete (globalThis as { localStorage?: Storage }).localStorage;
    expect(completedLessons()).toEqual([]);
    expect(() => markLessonComplete('lesson-1')).not.toThrow();
    expect(() => clearLessonProgress()).not.toThrow();

    (globalThis as { localStorage?: Storage }).localStorage = {
      getItem: () => 'not json at all', setItem: () => { throw new Error('quota'); },
      removeItem: () => { throw new Error('nope'); }, clear: () => {}, key: () => null, length: 0,
    } as Storage;
    expect(completedLessons()).toEqual([]);
    expect(() => markLessonComplete('lesson-1')).not.toThrow();
  });
});
