let ctx: AudioContext | null = null;
let muted = false;

export const isMuted = (): boolean => muted;
export const setMuted = (m: boolean): void => {
  muted = m;
};

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', vol = 0.15): void {
  if (muted) return;
  ctx ??= new AudioContext();
  const t0 = ctx.currentTime + start;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur);
}

export const sfx = {
  hit: () => tone(520, 0, 0.08, 'square', 0.1),
  smash: () => {
    tone(220, 0, 0.18, 'sawtooth', 0.15);
    tone(880, 0.05, 0.12, 'square', 0.1);
  },
  point: () => {
    tone(523, 0, 0.12);
    tone(659, 0.1, 0.12);
    tone(784, 0.2, 0.2);
  },
  miss: () => {
    tone(300, 0, 0.15, 'triangle');
    tone(220, 0.15, 0.25, 'triangle');
  },
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.14, 0.25, 'triangle', 0.18)),
  lose: () => [392, 330, 262].forEach((f, i) => tone(f, i * 0.2, 0.3, 'triangle', 0.15)),
};
