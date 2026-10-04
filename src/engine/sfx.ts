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

/** Filtered white noise: a crowd cheer or a whoosh. */
function noise(start: number, dur: number, freq: number, vol: number): void {
  if (muted) return;
  ctx ??= new AudioContext();
  const len = Math.floor(ctx.sampleRate * dur);
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = freq;
  const gain = ctx.createGain();
  const t0 = ctx.currentTime + start;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(vol, t0 + dur * 0.25);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filter).connect(gain).connect(ctx.destination);
  src.start(t0);
}

export const sfx = {
  hit: () => {
    tone(520, 0, 0.08, 'square', 0.1);
    noise(0, 0.05, 2400, 0.12);
  },
  bounce: () => tone(210, 0, 0.05, 'triangle', 0.14),
  cheer: () => noise(0, 1.1, 1400, 0.22),
  smash: () => {
    tone(220, 0, 0.18, 'sawtooth', 0.15);
    tone(880, 0.05, 0.12, 'square', 0.1);
    noise(0, 0.22, 900, 0.3);
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
