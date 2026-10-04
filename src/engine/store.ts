import type { Profile, SaveData, Word, WordProgress } from '../types';
import { PACK_WORDS, PACKS, packsReadyToUnlock, wordsInPacks, type Pack } from './packs';
import { emptySave, normalizeSave, parseSaveText } from './save';
import { touchStreak } from './profile';
import { recordAnswer, wordKey } from './srs';

const KEY = 'spelling-smash:v1';

function load(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    return (raw && normalizeSave(JSON.parse(raw))) || emptySave();
  } catch {
    return emptySave();
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

  /** Words he can be quizzed on: unlocked packs plus anything a parent added. */
  activeWords: (): Word[] => [...wordsInPacks(data.profile.unlockedPacks), ...data.customWords],

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

  /** Unlock every pack whose mastery requirement is now met. Returns the packs that just unlocked. */
  refreshUnlocks(): Pack[] {
    const ready = packsReadyToUnlock(data.profile.unlockedPacks, data.progress);
    if (ready.length > 0) {
      this.updateProfile((p) => ({ ...p, unlockedPacks: [...p.unlockedPacks, ...ready.map((r) => r.id)] }));
    }
    return ready;
  },

  /** Parent override: open every pack now. */
  unlockAllPacks(): void {
    this.updateProfile((p) => ({ ...p, unlockedPacks: PACKS.map((pack) => pack.id) }));
  },

  /** Adds new custom words; words that already exist (in any pack or custom) are skipped. */
  addCustomWords(words: Word[]): { added: number; skipped: number } {
    const have = new Set([...PACK_WORDS, ...data.customWords].map(wordKey));
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

  exportJson: (): string => JSON.stringify(data, null, 2),

  /** Replace everything with a backup. Returns false (and changes nothing) if the text is not a valid backup. */
  importJson(text: string): boolean {
    const next = parseSaveText(text);
    if (!next) return false;
    data = next;
    persist();
    return true;
  },

  resetAll(): void {
    data = emptySave();
    persist();
  },
};
