import type { Word } from '../types';

/**
 * Spoken words come from recorded clips in public/audio (made by scripts/make-audio.py), so they
 * sound the same on every device. Words a parent adds have no clip and use the browser's voice.
 */
export type Clip = 'word' | 'slow' | 'sentence';

const FOLDER: Record<Clip, string> = { word: 'words', slow: 'slow', sentence: 'sentences' };
const TTS_RATE: Record<Clip, number> = { word: 0.85, slow: 0.6, sentence: 0.9 };
const VOICE_KEY = 'spelling-smash:voice';

const audio = typeof Audio === 'undefined' ? null : new Audio();

// --- browser voice (fallback) -------------------------------------------------

const NOVELTY = /^(albert|bad news|bahh|bells|boing|bubbles|cellos|wobble|fred|good news|jester|junior|organ|superstar|trinoids|whisper|zarvox)\b/i;

/** Higher is better: prefer natural-sounding English voices and avoid robotic or novelty ones. */
function score(v: SpeechSynthesisVoice): number {
  let s = 0;
  if (/natural|neural|online|premium|enhanced/i.test(v.name)) s += 4;
  if (/google/i.test(v.name)) s += 3;
  if (v.lang === 'en-US') s += 2;
  else if (v.lang.startsWith('en')) s += 1;
  if (/espeak/i.test(v.name)) s -= 6;
  if (NOVELTY.test(v.name)) s -= 10;
  return s;
}

function englishVoices(): SpeechSynthesisVoice[] {
  if (!speechAvailable()) return [];
  return window.speechSynthesis
    .getVoices()
    .filter((v) => v.lang.startsWith('en'))
    .sort((a, b) => score(b) - score(a));
}

function savedVoiceUri(): string | null {
  try {
    return localStorage.getItem(VOICE_KEY);
  } catch {
    return null;
  }
}

function chooseVoice(): SpeechSynthesisVoice | null {
  const voices = englishVoices();
  const saved = savedVoiceUri();
  return voices.find((v) => v.voiceURI === saved) ?? voices[0] ?? null;
}

export const speechAvailable = (): boolean => typeof window !== 'undefined' && 'speechSynthesis' in window;

export interface VoiceChoice {
  uri: string;
  label: string;
  selected: boolean;
}

/** English browser voices, best first, for the parent's voice picker. */
export function listVoices(): VoiceChoice[] {
  const current = chooseVoice();
  return englishVoices().map((v) => ({ uri: v.voiceURI, label: `${v.name} (${v.lang})`, selected: v === current }));
}

export function chooseBrowserVoice(uri: string): void {
  try {
    localStorage.setItem(VOICE_KEY, uri);
  } catch {
    // ignore: the choice just won't persist
  }
}

/** Voices load asynchronously in Chrome; `cb` runs when the list changes. */
export function onVoicesChanged(cb: () => void): void {
  if (speechAvailable()) window.speechSynthesis.addEventListener('voiceschanged', cb);
}

/** Speak with the browser's own voice. */
export function speakWithBrowser(text: string, rate = 0.85): void {
  if (!speechAvailable()) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US';
  u.rate = rate;
  const voice = chooseVoice();
  if (voice) u.voice = voice;
  synth.speak(u);
}

// --- recorded clips -----------------------------------------------------------

const clipUrl = (word: string, clip: Clip): string =>
  new URL(`audio/${FOLDER[clip]}/${encodeURIComponent(word)}.mp3`, document.baseURI).href;

/** What to say with the browser voice if the clip that is loading turns out to be unplayable. */
let fallback: { text: string; rate: number } | null = null;

function useFallback(): void {
  if (!fallback) return;
  const { text, rate } = fallback;
  fallback = null;
  speakWithBrowser(text, rate);
}

audio?.addEventListener('error', useFallback); // missing or undecodable file
audio?.addEventListener('playing', () => {
  fallback = null;
});

/** Say a word, its slow version, or its sentence. Falls back to the browser voice if no clip plays. */
export function say(word: Word, clip: Clip): void {
  const text = clip === 'sentence' ? (word.sentence ?? word.word) : word.word;
  stopSpeaking();
  if (!word.pack || !audio) {
    speakWithBrowser(text, TTS_RATE[clip]);
    return;
  }
  fallback = { text, rate: TTS_RATE[clip] };
  audio.src = clipUrl(word.word, clip);
  audio.currentTime = 0;
  audio.play().catch((err: unknown) => {
    if (err instanceof DOMException && err.name === 'AbortError') return; // a newer clip replaced this one
    useFallback();
  });
}

export function stopSpeaking(): void {
  fallback = null;
  audio?.pause();
  if (speechAvailable()) window.speechSynthesis.cancel();
}
