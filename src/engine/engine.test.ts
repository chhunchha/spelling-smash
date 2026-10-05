import { describe, expect, it } from 'vitest';
import { DEFAULT_TIME_MULTIPLIER, MatchState, OPPONENTS, TIME_OPTIONS, returnChance, timeLimitMs } from './match';
import { isUnlocked, levelFromXp, newProfile, touchStreak } from './profile';
import { pickWord, recordAnswer } from './srs';
import { MASTERED_BOX, PACKS, PACK_WORDS, mastery, packsReadyToUnlock, wordsToUnlock } from './packs';
import { emptySave, normalizeSave, parseSaveText } from './save';
import { parseCustomWords } from './words';

const NOW = 1_700_000_000_000;
const DAY = 86_400_000;

describe('recordAnswer', () => {
  it('moves a new word up to box 2 and schedules it a day out', () => {
    const p = recordAnswer(undefined, true, NOW);
    expect(p).toEqual({ box: 2, dueAt: NOW + DAY, seen: 1, correct: 1 });
  });
  it('drops a word to box 1, due immediately, when missed', () => {
    const mastered = { box: 5, dueAt: NOW + 14 * DAY, seen: 9, correct: 9 };
    expect(recordAnswer(mastered, false, NOW)).toEqual({ box: 1, dueAt: NOW, seen: 10, correct: 9 });
  });
  it('does not advance a word that is not due yet, but still counts the answer', () => {
    const learned = { box: 2, dueAt: NOW + DAY, seen: 1, correct: 1 };
    expect(recordAnswer(learned, true, NOW)).toEqual({ box: 2, dueAt: NOW + DAY, seen: 2, correct: 2 });
  });
  it('advances a word once it is due', () => {
    const due = { box: 2, dueAt: NOW - 1, seen: 1, correct: 1 };
    expect(recordAnswer(due, true, NOW)).toEqual({ box: 3, dueAt: NOW + 3 * DAY, seen: 2, correct: 2 });
  });
  it('caps at box 5', () => {
    const p = recordAnswer({ box: 5, dueAt: 0, seen: 1, correct: 1 }, true, NOW);
    expect(p.box).toBe(5);
  });
});

describe('pickWord', () => {
  const words = [
    { word: 'cat', difficulty: 1 as const },
    { word: 'planet', difficulty: 2 as const },
    { word: 'tournament', difficulty: 3 as const },
  ];
  it('respects max difficulty for built-in words', () => {
    for (let i = 0; i < 50; i++) {
      expect(pickWord(words, {}, [], 1, NOW, Math.random).word).toBe('cat');
    }
  });
  it('always allows custom words regardless of difficulty', () => {
    const custom = [{ word: 'tournament', difficulty: 3 as const, custom: true }];
    expect(pickWord(custom, {}, [], 1, NOW, Math.random).word).toBe('tournament');
  });
  it('skips recent words when there are alternatives', () => {
    for (let i = 0; i < 50; i++) {
      expect(pickWord(words, {}, ['cat'], 2, NOW, Math.random).word).toBe('planet');
    }
  });
  it('prefers missed words over words learned recently', () => {
    const progress = {
      cat: { box: 1, dueAt: NOW, seen: 1, correct: 0 },
      planet: { box: 4, dueAt: NOW + 7 * DAY, seen: 5, correct: 5 },
    };
    let cat = 0;
    for (let i = 0; i < 1000; i++) {
      if (pickWord(words, progress, [], 2, NOW, Math.random).word === 'cat') cat++;
    }
    expect(cat).toBeGreaterThan(900);
  });
  it('falls back to any eligible word when everything is recent', () => {
    expect(pickWord(words, {}, ['cat'], 1, NOW, () => 0).word).toBe('cat');
  });
});

describe('parseCustomWords', () => {
  it('reads comma and line separated words', () => {
    const { words } = parseCustomWords('Apple, banana\ncherry');
    expect(words.map((w) => w.word)).toEqual(['apple', 'banana', 'cherry']);
    expect(words.every((w) => w.custom)).toBe(true);
  });
  it('reads "word | sentence" lines', () => {
    const { words } = parseCustomWords('necessary | A coat is necessary, in snow.');
    expect(words).toHaveLength(1);
    expect(words[0]).toMatchObject({ word: 'necessary', sentence: 'A coat is necessary, in snow.', difficulty: 3 });
  });
  it('rejects non-words and drops duplicates', () => {
    const { words, rejected } = parseCustomWords('cat, cat, 123, a');
    expect(words.map((w) => w.word)).toEqual(['cat']);
    expect(rejected).toEqual(['123', 'a']);
  });
});

describe('built-in packs', () => {
  it('has unique lowercase words with sentences across all packs', () => {
    const keys = PACK_WORDS.map((w) => w.word);
    expect(new Set(keys).size).toBe(keys.length);
    for (const w of PACK_WORDS) {
      expect(w.word).toMatch(/^[a-z]+$/);
      expect(w.sentence).toBeTruthy();
      expect(w.sentence?.toLowerCase()).toContain(w.word.slice(0, 4));
    }
  });
  it('has words at every opponent difficulty in the starter pack', () => {
    for (const d of [1, 2, 3]) expect(PACKS[0]?.words.some((w) => w.difficulty === d)).toBe(true);
  });
  it('only requires packs that exist, and the starter pack is open', () => {
    expect(PACKS[0]?.requires).toBeUndefined();
    for (const p of PACKS) if (p.requires) expect(PACKS.some((r) => r.id === p.requires?.pack)).toBe(true);
  });
});

describe('pack unlocking', () => {
  const grade4 = PACKS.find((p) => p.id === 'grade4')!;
  const grade5 = PACKS.find((p) => p.id === 'grade5')!;
  const masterFirst = (n: number) =>
    Object.fromEntries(
      grade4.words.slice(0, n).map((w) => [w.word, { box: MASTERED_BOX, dueAt: NOW, seen: 4, correct: 4 }]),
    );

  it('counts mastered words', () => {
    expect(mastery(grade4, masterFirst(10))).toEqual({ mastered: 10, total: grade4.words.length });
  });
  it('reports how many more words are needed', () => {
    const need = Math.ceil(grade4.words.length * 0.7);
    expect(wordsToUnlock(grade5, {})).toBe(need);
    expect(wordsToUnlock(grade5, masterFirst(need - 1))).toBe(1);
    expect(wordsToUnlock(grade5, masterFirst(need))).toBe(0);
  });
  it('unlocks a pack once the requirement is met, and not before', () => {
    const need = Math.ceil(grade4.words.length * 0.7);
    expect(packsReadyToUnlock(['grade4'], masterFirst(need - 1)).map((p) => p.id)).not.toContain('grade5');
    expect(packsReadyToUnlock(['grade4'], masterFirst(need)).map((p) => p.id)).toContain('grade5');
  });
  it('does not report packs that are already unlocked', () => {
    const need = Math.ceil(grade4.words.length * 0.7);
    expect(packsReadyToUnlock(['grade4', 'grade5'], masterFirst(need)).map((p) => p.id)).not.toContain('grade5');
  });
});

describe('save data', () => {
  it('round-trips a valid save', () => {
    const save = emptySave();
    save.progress['cat'] = { box: 3, dueAt: NOW, seen: 2, correct: 2 };
    save.customWords.push({ word: 'meow', difficulty: 1, custom: true, sentence: 'The cat says meow.' });
    expect(parseSaveText(JSON.stringify(save))).toEqual(save);
  });
  it('defaults and validates the typing-time setting', () => {
    expect(emptySave().settings.timeMultiplier).toBe(DEFAULT_TIME_MULTIPLIER);
    // a save from before settings existed gets the default
    expect(normalizeSave({ version: 1 })?.settings.timeMultiplier).toBe(DEFAULT_TIME_MULTIPLIER);
    expect(normalizeSave({ version: 1, settings: { timeMultiplier: 2 } })?.settings.timeMultiplier).toBe(2);
    expect(normalizeSave({ version: 1, settings: { timeMultiplier: 0.01 } })?.settings.timeMultiplier).toBe(
      DEFAULT_TIME_MULTIPLIER,
    );
  });
  it('rejects text that is not a save', () => {
    expect(parseSaveText('not json')).toBeNull();
    expect(parseSaveText('{"version":2}')).toBeNull();
    expect(parseSaveText('[]')).toBeNull();
  });
  it('cleans bad values and always keeps the starter pack open', () => {
    const save = normalizeSave({
      version: 1,
      progress: { cat: { box: 99, dueAt: 'x' }, bad: 5 },
      customWords: [{ word: 'ok' }, { word: '<script>' }, { word: 'ok' }],
      profile: { xp: -5, unlockedPacks: ['sports', 'nope'] },
    });
    expect(save?.progress['cat']).toEqual({ box: 5, dueAt: 0, seen: 0, correct: 0 });
    expect(save?.progress['bad']).toBeUndefined();
    expect(save?.customWords.map((w) => w.word)).toEqual(['ok']);
    expect(save?.profile.xp).toBe(0);
    expect(save?.profile.unlockedPacks).toEqual(['grade4', 'sports']);
  });
});

describe('match rules', () => {
  it('gets harder as the ladder climbs', () => {
    for (let i = 1; i < OPPONENTS.length; i++) {
      const prev = OPPONENTS[i - 1]!;
      const cur = OPPONENTS[i]!;
      expect(cur.skill).toBeGreaterThan(prev.skill);
      expect(cur.timeScale).toBeLessThan(prev.timeScale);
    }
  });
  it('gives more time to longer words', () => {
    const opp = OPPONENTS[0]!;
    expect(timeLimitMs('paddle', opp)).toBeLessThan(timeLimitMs('championship', opp));
  });
  it('scales the time limit with the parent setting', () => {
    const opp = OPPONENTS[0]!;
    expect(timeLimitMs('paddle', opp, 2)).toBe(timeLimitMs('paddle', opp) * 2);
    expect(timeLimitMs('paddle', opp)).toBe(Math.round(11000 * opp.timeScale));
  });
  it('defaults to one of the offered time settings', () => {
    expect(TIME_OPTIONS.some((o) => o.value === DEFAULT_TIME_MULTIPLIER)).toBe(true);
  });
  it('makes long rallies and smashes harder to return, within bounds', () => {
    const opp = OPPONENTS[2]!;
    expect(returnChance(opp, 5, false)).toBeLessThan(returnChance(opp, 1, false));
    expect(returnChance(opp, 1, true)).toBeLessThan(returnChance(opp, 1, false));
    expect(returnChance(opp, 100, true)).toBe(0.1);
  });
  it('tracks score, rally and the winner', () => {
    const m = new MatchState(2);
    m.playerReturned();
    m.playerReturned();
    m.pointTo('player');
    expect(m).toMatchObject({ player: 1, rally: 0, bestRally: 2, over: false });
    m.pointTo('player');
    expect(m.over && m.playerWon).toBe(true);
  });
});

describe('profile', () => {
  it('computes levels from xp', () => {
    expect(levelFromXp(0)).toMatchObject({ level: 1, title: 'Ball Boy', into: 0, needed: 60 });
    expect(levelFromXp(60)).toMatchObject({ level: 2, into: 0, needed: 180 });
    expect(levelFromXp(1_000_000).title).toBe('Legend');
  });
  it('tracks the day streak', () => {
    const p0 = newProfile();
    const d1 = new Date(2026, 9, 4, 10);
    const p1 = touchStreak(p0, d1);
    expect(p1).toMatchObject({ streak: 1, lastPlayDay: '2026-10-04' });
    expect(touchStreak(p1, new Date(2026, 9, 4, 20))).toBe(p1);
    expect(touchStreak(p1, new Date(2026, 9, 5, 9)).streak).toBe(2);
    expect(touchStreak(p1, new Date(2026, 9, 7, 9)).streak).toBe(1);
  });
  it('unlocks opponents in order', () => {
    const p = { ...newProfile(), beaten: [0] };
    expect(isUnlocked(p, 0)).toBe(true);
    expect(isUnlocked(p, 1)).toBe(true);
    expect(isUnlocked(p, 2)).toBe(false);
  });
});
