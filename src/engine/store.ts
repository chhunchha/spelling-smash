import type { Profile, SaveData, Word, WordProgress } from '../types';
import { newProfile, touchStreak } from './profile';
import { recordAnswer, wordKey } from './srs';
import { BUILT_IN_WORDS } from './words';

const KEY = 'spelling-smash:v1';

function empty(): SaveData {
  return { version: 1, progress: {}, customWords: [], profile: newProfile() };
}

function load(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const data = JSON.parse(raw) as Partial<SaveData>;
    if (data.version !== 1) return empty();
    return { ...empty(), ...data, profile: { ...newProfile(), ...data.profile } };
  } catch {
    return empty();
  }
}

let data = load();

function persist(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Storage can be blocked (private mode); the game still works for this session.
  }
}

export const store = {
  profile: (): Profile => data.profile,
  progress: (): Record<string, WordProgress> => data.progress,
  customWords: (): Word[] => data.customWords,
  allWords: (): Word[] => [...BUILT_IN_WORDS, ...data.customWords],

  updateProfile(fn: (p: Profile) => Profile): void {
    data = { ...data, profile: fn(data.profile) };
    persist();
  },

  recordAnswer(word: Word, correct: boolean): WordProgress {
    const key = wordKey(word);
    const next = recordAnswer(data.progress[key], correct, Date.now());
    data = { ...data, progress: { ...data.progress, [key]: next } };
    persist();
    return next;
  },

  touchStreak(): void {
    this.updateProfile((p) => touchStreak(p, new Date()));
  },

  /** Adds new custom words; words that already exist (built-in or custom) are skipped. */
  addCustomWords(words: Word[]): { added: number; skipped: number } {
    const have = new Set(this.allWords().map(wordKey));
    const fresh = words.filter((w) => !have.has(wordKey(w)));
    data = { ...data, customWords: [...data.customWords, ...fresh] };
    persist();
    return { added: fresh.length, skipped: words.length - fresh.length };
  },

  removeCustomWord(word: string): void {
    const key = wordKey(word);
    const { [key]: _removed, ...rest } = data.progress;
    data = { ...data, customWords: data.customWords.filter((w) => wordKey(w) !== key), progress: rest };
    persist();
  },

  resetAll(): void {
    data = empty();
    persist();
  },
};
