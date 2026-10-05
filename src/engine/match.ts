import { MAX_BOX } from './srs';

export interface Opponent {
  name: string;
  blurb: string;
  /** Points needed to win the match. */
  target: number;
  /** Base chance he returns the ball; drops as the rally gets longer. */
  skill: number;
  /** Multiplies the time he has to spell. Bigger is more relaxed. */
  timeScale: number;
  maxDifficulty: 1 | 2 | 3;
  color: string;
}

export const OPPONENTS: Opponent[] = [
  { name: 'Rookie Rex', blurb: 'Just picked up a paddle', target: 5, skill: 0.5, timeScale: 1.8, maxDifficulty: 1, color: '#7bc96f' },
  { name: 'Spinny Sam', blurb: 'Loves a fancy spin', target: 7, skill: 0.58, timeScale: 1.5, maxDifficulty: 1, color: '#f4c542' },
  { name: 'Coach Carla', blurb: 'Steady and smart', target: 7, skill: 0.66, timeScale: 1.3, maxDifficulty: 2, color: '#f08a3c' },
  { name: 'Smash Sakura', blurb: 'Hits it hard and fast', target: 9, skill: 0.72, timeScale: 1.15, maxDifficulty: 2, color: '#e5546b' },
  { name: 'Lightning Liu', blurb: 'You blink, you lose', target: 11, skill: 0.78, timeScale: 1.0, maxDifficulty: 3, color: '#9b6bdb' },
  { name: 'Champion Chen', blurb: 'The final boss', target: 11, skill: 0.84, timeScale: 0.9, maxDifficulty: 3, color: '#2b2b3a' },
];

/** Answering faster than this share of the time limit counts as a smash. */
export const SMASH_FRACTION = 0.45;

/** Choices for the parent's "Typing time" setting. The first is the base pace. */
export const TIME_OPTIONS = [
  { value: 1, label: 'Normal' },
  { value: 1.25, label: 'A little more time' },
  { value: 1.5, label: 'Extra time' },
  { value: 2, label: 'Lots of time' },
  { value: 3, label: 'No rush' },
] as const;

export const DEFAULT_TIME_MULTIPLIER = 1.25;

/** Time to spell a word: a base for listening, a second per letter for typing, scaled by opponent and the parent's setting. */
export function timeLimitMs(word: string, opp: Opponent, multiplier = 1): number {
  return Math.round((5000 + 1000 * word.length) * opp.timeScale * multiplier);
}

/** Chance the opponent gets the ball back after the player's `rally`-th return. */
export function returnChance(opp: Opponent, rally: number, smash: boolean): number {
  const chance = opp.skill - 0.05 * (rally - 1) - (smash ? 0.2 : 0);
  return Math.min(0.95, Math.max(0.1, chance));
}

export function opponentReturns(opp: Opponent, rally: number, smash: boolean, rng: () => number): boolean {
  return rng() < returnChance(opp, rally, smash);
}

export class MatchState {
  player = 0;
  opponent = 0;
  /** Number of returns the player has made in the current point. */
  rally = 0;
  bestRally = 0;

  constructor(readonly target: number) {}

  get over(): boolean {
    return this.player >= this.target || this.opponent >= this.target;
  }

  get playerWon(): boolean {
    return this.player >= this.target;
  }

  playerReturned(): void {
    this.rally++;
    this.bestRally = Math.max(this.bestRally, this.rally);
  }

  pointTo(winner: 'player' | 'opponent'): void {
    if (winner === 'player') this.player++;
    else this.opponent++;
    this.rally = 0;
  }
}

/** XP for a correct word. Harder (higher box) words and smashes earn more. */
export function xpForAnswer(box: number, smash: boolean): number {
  return 5 + Math.min(box, MAX_BOX) + (smash ? 3 : 0);
}
