import grade4 from '../data/grade4.json';
import type { Difficulty, Word } from '../types';

export const BUILT_IN_WORDS: Word[] = (grade4 as [string, string, Difficulty][]).map(
  ([word, sentence, difficulty]) => ({ word, sentence, difficulty }),
);

export function difficultyForLength(len: number): Difficulty {
  return len <= 5 ? 1 : len <= 8 ? 2 : 3;
}

export interface ParsedWords {
  words: Word[];
  rejected: string[];
}

/**
 * Parse text typed by a parent. Each line is either "word | sentence to read aloud"
 * or one or more words separated by commas/spaces. Duplicates in the input are dropped.
 */
export function parseCustomWords(text: string): ParsedWords {
  const words: Word[] = [];
  const rejected: string[] = [];
  const seen = new Set<string>();
  const add = (raw: string, sentence?: string) => {
    const word = raw.trim().toLowerCase();
    if (!word) return;
    if (!/^[a-z][a-z'-]{1,23}$/.test(word)) {
      rejected.push(raw.trim());
      return;
    }
    if (seen.has(word)) return;
    seen.add(word);
    const s = sentence?.trim();
    words.push({ word, sentence: s || undefined, difficulty: difficultyForLength(word.length), custom: true });
  };
  for (const line of text.split(/\r?\n/)) {
    if (line.includes('|')) {
      const [w = '', ...rest] = line.split('|');
      add(w, rest.join('|'));
    } else {
      for (const token of line.split(/[,;\s]+/)) add(token);
    }
  }
  return { words, rejected };
}
