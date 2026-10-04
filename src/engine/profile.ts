import type { Profile } from '../types';

export const LEVEL_TITLES = [
  'Ball Boy',
  'Club Player',
  'Rising Star',
  'Spin Master',
  'Pro Paddler',
  'Champion',
  'Legend',
];

const XP_PER_LEVEL_UNIT = 60;

export const newProfile = (): Profile => ({
  xp: 0,
  beaten: [],
  wins: 0,
  bestRally: 0,
  streak: 0,
  unlockedPacks: ['grade4'],
  lastPlayDay: '',
});

/** Level n starts at 60 * (n-1)^2 XP, so early levels come fast and later ones take more play. */
export function levelFromXp(xp: number): { level: number; title: string; into: number; needed: number } {
  const level = Math.floor(Math.sqrt(xp / XP_PER_LEVEL_UNIT)) + 1;
  const start = XP_PER_LEVEL_UNIT * (level - 1) ** 2;
  const next = XP_PER_LEVEL_UNIT * level ** 2;
  const title = LEVEL_TITLES[Math.min(level - 1, LEVEL_TITLES.length - 1)] as string;
  return { level, title, into: xp - start, needed: next - start };
}

export function localDay(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Update the day streak: same day keeps it, the next day extends it, a gap resets it to 1. */
export function touchStreak(profile: Profile, today: Date): Profile {
  const day = localDay(today);
  if (profile.lastPlayDay === day) return profile;
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const streak = profile.lastPlayDay === localDay(yesterday) ? profile.streak + 1 : 1;
  return { ...profile, streak, lastPlayDay: day };
}

export const isUnlocked = (profile: Profile, opponentIndex: number): boolean =>
  opponentIndex === 0 || profile.beaten.includes(opponentIndex - 1);
