import type { Difficulty, Profile, SaveData, Settings, Word, WordProgress } from '../types';
import { DEFAULT_TIME_MULTIPLIER, TIME_OPTIONS } from './match';
import { PACKS } from './packs';
import { newProfile } from './profile';

export const newSettings = (): Settings => ({ timeMultiplier: DEFAULT_TIME_MULTIPLIER });

export function emptySave(): SaveData {
  return { version: 1, settings: newSettings(), progress: {}, customWords: [], profile: newProfile() };
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

function cleanProgress(raw: unknown): Record<string, WordProgress> {
  const out: Record<string, WordProgress> = {};
  if (!isObject(raw)) return out;
  for (const [key, v] of Object.entries(raw)) {
    if (!isObject(v)) continue;
    out[key] = {
      box: Math.min(5, Math.max(0, Math.round(num(v.box, 0)))),
      dueAt: num(v.dueAt, 0),
      seen: Math.max(0, num(v.seen, 0)),
      correct: Math.max(0, num(v.correct, 0)),
    };
  }
  return out;
}

function cleanCustomWords(raw: unknown): Word[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: Word[] = [];
  for (const v of raw) {
    if (!isObject(v) || typeof v.word !== 'string') continue;
    const word = v.word.trim().toLowerCase();
    if (!/^[a-z][a-z'-]{1,23}$/.test(word) || seen.has(word)) continue;
    seen.add(word);
    const difficulty = [1, 2, 3].includes(v.difficulty as number) ? (v.difficulty as Difficulty) : 2;
    out.push({
      word,
      sentence: typeof v.sentence === 'string' && v.sentence.trim() ? v.sentence.trim() : undefined,
      difficulty,
      custom: true,
    });
  }
  return out;
}

function cleanProfile(raw: unknown): Profile {
  const base = newProfile();
  if (!isObject(raw)) return base;
  const known = new Set(PACKS.map((p) => p.id));
  const packs = Array.isArray(raw.unlockedPacks)
    ? raw.unlockedPacks.filter((id): id is string => typeof id === 'string' && known.has(id))
    : [];
  return {
    xp: Math.max(0, num(raw.xp, 0)),
    beaten: Array.isArray(raw.beaten) ? raw.beaten.filter((n): n is number => Number.isInteger(n)) : [],
    wins: Math.max(0, num(raw.wins, 0)),
    bestRally: Math.max(0, num(raw.bestRally, 0)),
    streak: Math.max(0, num(raw.streak, 0)),
    lastPlayDay: typeof raw.lastPlayDay === 'string' ? raw.lastPlayDay : '',
    // grade4 is always open, even if an old save predates packs.
    unlockedPacks: [...new Set([...base.unlockedPacks, ...packs])],
  };
}

function cleanSettings(raw: unknown): Settings {
  const base = newSettings();
  if (!isObject(raw)) return base;
  const known = TIME_OPTIONS.some((o) => o.value === raw.timeMultiplier);
  return { timeMultiplier: known ? (raw.timeMultiplier as number) : base.timeMultiplier };
}

/** Validate and clean untrusted data (localStorage or an imported backup). Returns null if it is not a save. */
export function normalizeSave(raw: unknown): SaveData | null {
  if (!isObject(raw) || raw.version !== 1) return null;
  return {
    version: 1,
    settings: cleanSettings(raw.settings),
    progress: cleanProgress(raw.progress),
    customWords: cleanCustomWords(raw.customWords),
    profile: cleanProfile(raw.profile),
  };
}

export function parseSaveText(text: string): SaveData | null {
  try {
    return normalizeSave(JSON.parse(text));
  } catch {
    return null;
  }
}
