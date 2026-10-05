export type Difficulty = 1 | 2 | 3;

export interface Word {
  word: string;
  sentence?: string;
  difficulty: Difficulty;
  /** Id of the word pack this word belongs to. Words a parent adds have no pack. */
  pack?: string;
  custom?: boolean;
}

/** Leitner-style progress for one word. box 0 = never seen, 1 = missed, 5 = mastered. */
export interface WordProgress {
  box: number;
  dueAt: number;
  seen: number;
  correct: number;
}

export interface Profile {
  xp: number;
  /** Indexes of opponents already beaten. */
  beaten: number[];
  wins: number;
  bestRally: number;
  streak: number;
  /** Ids of word packs he has unlocked. Once unlocked, a pack stays unlocked. */
  unlockedPacks: string[];
  /** Local date (YYYY-MM-DD) of the last day he played. */
  lastPlayDay: string;
}

export interface Settings {
  /** Multiplies the time he has to spell each word. */
  timeMultiplier: number;
}

export interface SaveData {
  version: 1;
  settings: Settings;
  progress: Record<string, WordProgress>;
  customWords: Word[];
  profile: Profile;
}
