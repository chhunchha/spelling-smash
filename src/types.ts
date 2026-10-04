export type Difficulty = 1 | 2 | 3;

export interface Word {
  word: string;
  sentence?: string;
  difficulty: Difficulty;
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
  /** Local date (YYYY-MM-DD) of the last day he played. */
  lastPlayDay: string;
}

export interface SaveData {
  version: 1;
  progress: Record<string, WordProgress>;
  customWords: Word[];
  profile: Profile;
}
