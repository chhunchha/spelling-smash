import type { Word, WordProgress } from '../types';

const DAY = 86_400_000;
export const MAX_BOX = 5;
/** How long to wait before showing a word again, by box. Box 1 (missed) is due right away. */
const INTERVALS = [0, 0, 1 * DAY, 3 * DAY, 7 * DAY, 14 * DAY];

export const wordKey = (w: Word | string): string => (typeof w === 'string' ? w : w.word).toLowerCase();

export function recordAnswer(prev: WordProgress | undefined, correct: boolean, now: number): WordProgress {
  const p = prev ?? { box: 0, dueAt: 0, seen: 0, correct: 0 };
  const box = correct ? (p.box <= 1 ? 2 : Math.min(p.box + 1, MAX_BOX)) : 1;
  return {
    box,
    dueAt: now + (INTERVALS[box] ?? 0),
    seen: p.seen + 1,
    correct: p.correct + (correct ? 1 : 0),
  };
}

function weight(w: Word, p: WordProgress | undefined, now: number): number {
  let base: number;
  if (!p) base = 3; // new word
  else if (p.dueAt > now) base = 0.15; // learned recently, not due yet
  else if (p.box <= 1) base = 6; // missed: bring it back often
  else base = 2 + (MAX_BOX - p.box) * 0.5;
  return w.custom ? base * 1.5 : base; // words added by a parent get practiced more
}

/**
 * Pick the next word. Custom words are always eligible; built-in words are limited to
 * `maxDifficulty`. Words in `recent` are skipped unless nothing else is available.
 */
export function pickWord(
  words: Word[],
  progress: Record<string, WordProgress>,
  recent: string[],
  maxDifficulty: number,
  now: number,
  rng: () => number,
): Word {
  const eligible = words.filter((w) => w.custom || w.difficulty <= maxDifficulty);
  const fresh = eligible.filter((w) => !recent.includes(wordKey(w)));
  const pool = fresh.length > 0 ? fresh : eligible.length > 0 ? eligible : words;
  const weights = pool.map((w) => weight(w, progress[wordKey(w)], now));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i] ?? 0;
    if (r < 0) return pool[i] as Word;
  }
  return pool[pool.length - 1] as Word;
}
