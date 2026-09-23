/**
 * Which cards a reader has actually been through.
 *
 * Seven cards at two to five minutes each is more than one sitting, and the catalogue gave a
 * returning reader no way to tell which they had done — every card looked identical on the second
 * visit as on the first. Nothing here gates anything: §15.1 forbids a tutorial gate, and this is
 * not one. It marks, it counts, and it offers the next card; every lesson stays open at all times.
 *
 * It is kept in the browser rather than in the workspace on purpose. Going through a lesson is not
 * a fact about the organisation's data, it is a fact about one person at one desk, and writing it
 * to a shared record would make one colleague's reading look like another's.
 */
const KEY = 'bess-studio.lessons.completed.v1';

/** A storage that may not be there, may be full, and may throw on read in a private window. */
const store = (): Storage | null => {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
};

export function completedLessons(): string[] {
  try {
    const raw = store()?.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    // A corrupt or unreadable entry means "nothing done yet", which is the honest reading and the
    // one that cannot break the page.
    return [];
  }
}

export function markLessonComplete(id: string): string[] {
  const next = [...new Set([...completedLessons(), id])];
  try { store()?.setItem(KEY, JSON.stringify(next)); } catch { /* nothing to do: the list is still right for this page */ }
  return next;
}

export function clearLessonProgress(): void {
  try { store()?.removeItem(KEY); } catch { /* as above */ }
}

/**
 * Where to send a reader who presses Continue.
 *
 * The first card they have not done, in the order the argument runs — not the last one they opened,
 * which on a sequence means offering to replay the thing they just finished.
 */
export const nextUnfinished = (order: string[], done: string[]): string | null =>
  order.find(id => !done.includes(id)) ?? null;

/** How far through, for a reader deciding whether to start now or come back. */
export const progressOf = (order: string[], done: string[]) => {
  const finished = order.filter(id => done.includes(id));
  return { done: finished.length, total: order.length, fraction: order.length ? finished.length / order.length : 0 };
};
