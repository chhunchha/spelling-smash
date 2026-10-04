let voice: SpeechSynthesisVoice | null = null;

function chooseVoice(): void {
  const voices = window.speechSynthesis?.getVoices() ?? [];
  voice =
    voices.find((v) => v.lang === 'en-US' && /google|natural|samantha/i.test(v.name)) ??
    voices.find((v) => v.lang === 'en-US') ??
    voices.find((v) => v.lang.startsWith('en')) ??
    null;
}

if ('speechSynthesis' in window) {
  chooseVoice();
  window.speechSynthesis.addEventListener('voiceschanged', chooseVoice);
}

export const speechAvailable = (): boolean => 'speechSynthesis' in window;

/** Read text aloud, replacing anything still being spoken. */
export function speak(text: string, rate = 0.85): void {
  if (!speechAvailable()) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US';
  u.rate = rate;
  if (voice) u.voice = voice;
  synth.speak(u);
}

export function stopSpeaking(): void {
  if (speechAvailable()) window.speechSynthesis.cancel();
}
