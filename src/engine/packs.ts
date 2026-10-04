import grade4 from '../data/grade4.json';
import grade5 from '../data/grade5.json';
import sports from '../data/sports.json';
import type { Difficulty, Word, WordProgress } from '../types';
import { wordKey } from './srs';

export interface Pack {
  id: string;
  name: string;
  blurb: string;
  emoji: string;
  words: Word[];
  /** Unlocks once `fraction` of the words in pack `pack` are mastered. No requirement = open from the start. */
  requires?: { pack: string; fraction: number };
}

type Row = [string, string, Difficulty];

const build = (id: string, rows: Row[]): Word[] =>
  rows.map(([word, sentence, difficulty]) => ({ word, sentence, difficulty, pack: id }));

export const PACKS: Pack[] = [
  { id: 'grade4', name: 'Grade 4', blurb: 'The starter words', emoji: '📘', words: build('grade4', grade4 as Row[]) },
  {
    id: 'grade5',
    name: 'Grade 5',
    blurb: 'Bigger, trickier words',
    emoji: '📗',
    words: build('grade5', grade5 as Row[]),
    requires: { pack: 'grade4', fraction: 0.7 },
  },
  {
    id: 'sports',
    name: 'Sports & Games',
    blurb: 'Table tennis and more',
    emoji: '🏅',
    words: build('sports', sports as Row[]),
    requires: { pack: 'grade4', fraction: 0.3 },
  },
];

export const PACK_WORDS: Word[] = PACKS.flatMap((p) => p.words);

/** A word counts as mastered once it has reached this Leitner box (about 3 correct answers on separate days). */
export const MASTERED_BOX = 4;

export const packById = (id: string): Pack | undefined => PACKS.find((p) => p.id === id);

export function mastery(pack: Pack, progress: Record<string, WordProgress>): { mastered: number; total: number } {
  const mastered = pack.words.filter((w) => (progress[wordKey(w)]?.box ?? 0) >= MASTERED_BOX).length;
  return { mastered, total: pack.words.length };
}

/** Words he can still master before `pack`'s requirement is met. */
export function wordsToUnlock(pack: Pack, progress: Record<string, WordProgress>): number {
  if (!pack.requires) return 0;
  const req = packById(pack.requires.pack);
  if (!req) return 0;
  const { mastered, total } = mastery(req, progress);
  return Math.max(0, Math.ceil(total * pack.requires.fraction) - mastered);
}

/** Packs that are locked now but whose requirement is met by `progress`. */
export function packsReadyToUnlock(unlocked: string[], progress: Record<string, WordProgress>): Pack[] {
  return PACKS.filter((p) => !unlocked.includes(p.id) && p.requires && wordsToUnlock(p, progress) === 0);
}

export const wordsInPacks = (unlocked: string[]): Word[] =>
  PACKS.filter((p) => unlocked.includes(p.id)).flatMap((p) => p.words);
