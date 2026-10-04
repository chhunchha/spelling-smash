export type Side = 'opp' | 'player';
export type SceneEvent = 'hit' | 'smash' | 'bounce' | 'miss';
type Mood = 'neutral' | 'focus' | 'happy' | 'cheer' | 'sad';

/** Bitmap pixels per drawing unit, so the court stays sharp on big or high-DPI screens. */
const S = 2;
const W = 800;
const H = 450;
const TABLE_TOP = 300;
const TABLE_LEFT = 150;
const TABLE_RIGHT = 650;
const NET_X = (TABLE_LEFT + TABLE_RIGHT) / 2;
const FLOOR = 410;
const OPP_X = 95;
const PLAYER_X = 705;
const HIT_Y = TABLE_TOP - 30;
const PADDLE_REACH = 40;
const BOUNCE_AT = 0.75;
const SWING_MS = 300;
const CONFETTI = ['#ffd166', '#ef476f', '#06d6a0', '#118ab2', '#ffffff', '#f78c6b'];
const SKINS = ['#f2c9a0', '#d9a579', '#b9814f', '#8d5a36'];
const HAIRS = ['#2b2118', '#5a3a1a', '#1a1a1a', '#b5651d', '#3d2b56'];

interface Flight {
  from: Side;
  start: number;
  duration: number;
  /** When true the ball is not returned: it passes the receiver and falls. */
  miss: boolean;
  /** 1 for a normal hit, above 1 for a smash. */
  power: number;
  bounced: boolean;
  passed: boolean;
  /** The flight was sped up because the answer was already given. */
  hurried: boolean;
}

interface Particle {
  kind: 'spark' | 'dust' | 'confetti' | 'ring' | 'fire';
  x: number;
  y: number;
  vx: number;
  vy: number;
  g: number;
  life: number;
  max: number;
  size: number;
  color: string;
  rot: number;
  vr: number;
}

interface Flash {
  text: string;
  start: number;
  big: boolean;
  color: string;
}

interface CrowdMember {
  x: number;
  row: number;
  shirt: string;
  skin: string;
  phase: number;
  size: number;
}

interface Look {
  shirt: string;
  skin: string;
  hair: string;
  band: string;
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const smooth = (v: number): number => {
  const t = clamp01(v);
  return t * t * (3 - 2 * t);
};
const easeOutBack = (t: number): number => {
  const c = 1.70158;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};

/** Canvas drawing of the arena, players, ball and effects. Game rules live elsewhere. */
export class Scene {
  /** Called for moments that deserve a sound. */
  onEvent: (event: SceneEvent) => void = () => {};

  private ctx: CanvasRenderingContext2D;
  private flight: Flight | null = null;
  private heldBy: Side = 'opp';
  private swings: Record<Side, { start: number; power: number }> = {
    opp: { start: -1e9, power: 1 },
    player: { start: -1e9, power: 1 },
  };
  private swingPos: Record<Side, number> = { opp: 0, player: 0 };
  private lunge: Record<Side, number> = { opp: -1e9, player: -1e9 };
  private jump: Record<Side, number> = { opp: -1e9, player: -1e9 };
  private mood: Record<Side, { m: Mood; until: number }> = {
    opp: { m: 'neutral', until: 0 },
    player: { m: 'neutral', until: 0 },
  };
  private flashes: Flash[] = [];
  private particles: Particle[] = [];
  private trail: { x: number; y: number; t: number }[] = [];
  private shakeInfo = { start: -1e9, dur: 1, mag: 0 };
  private squashUntil = 0;
  private bounceSpot: { x: number; t: number } | null = null;
  private crowd: CrowdMember[] = [];
  private boost = 0;
  private rally = 0;
  private score = { player: 0, opp: 0 };
  private confettiUntil = 0;
  private spin = 0;
  private last = 0;
  private raf = 0;
  private looks: Record<Side, Look>;
  private oppName: string;

  constructor(
    private canvas: HTMLCanvasElement,
    oppColor: string,
    oppName: string,
  ) {
    canvas.width = W * S;
    canvas.height = H * S;
    this.ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    this.oppName = oppName;
    const hash = [...oppName].reduce((a, ch) => a + ch.charCodeAt(0), 0);
    this.looks = {
      opp: {
        shirt: oppColor,
        skin: SKINS[hash % SKINS.length] as string,
        hair: HAIRS[hash % HAIRS.length] as string,
        band: '#ffffff',
      },
      player: { shirt: '#3b82f6', skin: SKINS[0] as string, hair: '#2b2118', band: '#ffd166' },
    };
    this.buildCrowd();
  }

  start(): void {
    const loop = (now: number) => {
      const dt = this.last ? Math.min(0.05, (now - this.last) / 1000) : 0;
      this.last = now;
      this.update(dt, now);
      this.draw(now);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
  }

  // --- controls from the game ---------------------------------------------

  /** Hit the ball from `from` toward the other side. `power` above 1 is a smash. */
  flyBall(from: Side, durationMs: number, miss = false, power = 1): void {
    const now = performance.now();
    this.swings[from] = { start: now, power };
    this.flight = { from, start: now, duration: durationMs, miss, power, bounced: false, passed: false, hurried: false };
    this.heldBy = from === 'opp' ? 'player' : 'opp';
    const c = this.contactPoint(from);
    this.burst(c.x, c.y, power, from === 'opp' ? 1 : -1);
    this.boost = Math.min(1, this.boost + 0.12 * power);
    if (power > 1.2) {
      this.shake(6, 320);
      this.onEvent('smash');
    } else {
      this.onEvent('hit');
    }
  }

  /** Speed the current flight up so it ends `ms` from now, keeping the ball where it is. */
  hurry(ms: number, miss = false): void {
    const f = this.flight;
    if (!f) return;
    const now = performance.now();
    const p = Math.min(1, (now - f.start) / f.duration);
    const rest = Math.max(1 - p, 0.05);
    const duration = ms / rest;
    this.flight = { ...f, duration, start: now - p * duration, miss, hurried: true };
  }

  /** Show big text in the middle of the screen for a moment. */
  showFlash(text: string, big = true, color = '#ffd166'): void {
    this.flashes.push({ text, start: performance.now(), big, color });
  }

  resetBall(): void {
    this.flight = null;
    this.heldBy = 'opp';
    this.trail = [];
  }

  setRally(n: number): void {
    this.rally = n;
  }

  setScore(player: number, opp: number): void {
    this.score = { player, opp };
  }

  /** The point is over: the winner celebrates, the loser slumps. */
  celebrate(winner: Side): void {
    const now = performance.now();
    const loser: Side = winner === 'player' ? 'opp' : 'player';
    this.jump[winner] = now;
    this.mood[winner] = { m: 'cheer', until: now + 1600 };
    this.mood[loser] = { m: 'sad', until: now + 1600 };
    this.boost = 1;
    if (winner === 'player') this.confettiBurst(PLAYER_X, 200, 36);
  }

  celebrateMatch(won: boolean): void {
    const now = performance.now();
    this.mood.player = { m: won ? 'cheer' : 'sad', until: now + 1e7 };
    this.mood.opp = { m: won ? 'sad' : 'cheer', until: now + 1e7 };
    this.jump[won ? 'player' : 'opp'] = now;
    this.boost = 1;
    if (won) this.confettiUntil = now + 4000;
  }

  // --- simulation ----------------------------------------------------------

  private contactPoint(side: Side): { x: number; y: number } {
    return { x: side === 'opp' ? OPP_X + PADDLE_REACH : PLAYER_X - PADDLE_REACH, y: HIT_Y };
  }

  private shake(mag: number, dur: number): void {
    this.shakeInfo = { start: performance.now(), dur, mag };
  }

  private emit(p: Partial<Particle> & Pick<Particle, 'kind' | 'x' | 'y'>): void {
    this.particles.push({
      vx: 0,
      vy: 0,
      g: 0,
      life: 0.5,
      max: 0.5,
      size: 3,
      color: '#fff',
      rot: 0,
      vr: 0,
      ...p,
    });
  }

  private burst(x: number, y: number, power: number, dir: number): void {
    this.emit({ kind: 'ring', x, y, life: 0.3, max: 0.3, size: 8, color: power > 1.2 ? '#ff6b35' : '#ffffff' });
    const n = Math.round(6 + power * 8);
    for (let i = 0; i < n; i++) {
      const ang = (Math.random() - 0.5) * 2.2 + (dir > 0 ? 0 : Math.PI);
      const sp = 90 + Math.random() * 220 * power;
      const life = 0.25 + Math.random() * 0.3;
      this.emit({
        kind: 'spark',
        x,
        y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp - 40,
        g: 380,
        life,
        max: life,
        size: 2 + Math.random() * 2,
        color: power > 1.2 ? (Math.random() < 0.5 ? '#ffb703' : '#ff6b35') : '#fff3b0',
      });
    }
  }

  private confettiBurst(x: number, y: number, n: number, rain = false): void {
    for (let i = 0; i < n; i++) {
      const ang = (rain ? Math.PI / 2 : -Math.PI / 2) + (Math.random() - 0.5) * (rain ? 1 : 1.8);
      const sp = rain ? 40 + Math.random() * 90 : 200 + Math.random() * 300;
      const life = rain ? 2.6 + Math.random() : 1.4 + Math.random() * 1.2;
      this.emit({
        kind: 'confetti',
        x,
        y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp,
        g: 360,
        life,
        max: life,
        size: 6 + Math.random() * 5,
        color: CONFETTI[Math.floor(Math.random() * CONFETTI.length)] as string,
        rot: Math.random() * 6,
        vr: (Math.random() - 0.5) * 14,
      });
    }
  }

  private update(dt: number, now: number): void {
    for (const p of this.particles) {
      p.life -= dt;
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      if (p.kind === 'confetti') p.vx *= 1 - 0.8 * dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    if (this.particles.length > 600) this.particles.splice(0, this.particles.length - 600);

    const floorBoost = Math.min(0.7, this.rally * 0.12);
    this.boost = Math.max(floorBoost, this.boost - dt * 0.35);

    if (now < this.confettiUntil) this.confettiBurst(Math.random() * W, -10, 4, true);

    for (const side of ['opp', 'player'] as const) {
      const target = this.swingTarget(side, now);
      this.swingPos[side] += (target - this.swingPos[side]) * (1 - Math.exp(-dt * 26));
    }

    const f = this.flight;
    if (f) {
      const p = (now - f.start) / f.duration;
      if (!f.bounced && p >= BOUNCE_AT) {
        f.bounced = true;
        const x0 = this.contactPoint(f.from).x;
        const x1 = this.contactPoint(f.from === 'opp' ? 'player' : 'opp').x;
        const bx = x0 + (x1 - x0) * BOUNCE_AT;
        this.squashUntil = now + 110;
        this.bounceSpot = { x: bx, t: now };
        for (let i = 0; i < 7; i++) {
          this.emit({
            kind: 'dust',
            x: bx,
            y: TABLE_TOP,
            vx: (Math.random() - 0.5) * 110,
            vy: -30 - Math.random() * 70,
            g: 160,
            life: 0.35,
            max: 0.35,
            size: 2 + Math.random() * 2.5,
            color: '#cde8dc',
          });
        }
        this.onEvent('bounce');
      }
      if (!f.passed && p >= 1) {
        f.passed = true;
        if (f.miss) {
          const receiver: Side = f.from === 'opp' ? 'player' : 'opp';
          this.lunge[receiver] = now;
          this.mood[receiver] = { m: 'sad', until: now + 1600 };
          this.onEvent('miss');
        }
      }
    }

    const ball = this.ballPos(now);
    if (ball) {
      this.trail.push({ x: ball.x, y: ball.y, t: now });
      const hot = this.hotLevel();
      if (hot > 0 && f && !f.passed) {
        this.emit({
          kind: 'fire',
          x: ball.x + (Math.random() - 0.5) * 4,
          y: ball.y + (Math.random() - 0.5) * 4,
          vx: (Math.random() - 0.5) * 30,
          vy: -20 - Math.random() * 30,
          life: 0.3,
          max: 0.3,
          size: 3 + hot * 3,
          color: hot > 1 ? '#ff4d00' : '#ffb703',
        });
      }
      if (f) this.spin += dt * (f.from === 'opp' ? 1 : -1) * (14 + (f.power - 1) * 14);
    }
    const keep = 230 + this.hotLevel() * 160;
    while (this.trail.length > 0 && now - (this.trail[0] as { t: number }).t > keep) this.trail.shift();
  }

  /** 0 = normal ball, 1 = hot (long rally), 2 = smash. */
  private hotLevel(): number {
    const f = this.flight;
    if (f && f.power > 1.2) return 2;
    return this.rally >= 3 ? 1 : 0;
  }

  private swingTarget(side: Side, now: number): number {
    const sw = this.swings[side];
    const t = (now - sw.start) / SWING_MS;
    if (t >= 0 && t < 1) return sw.power * Math.sin(Math.PI * Math.pow(t, 0.75));
    const f = this.flight;
    if (f && f.from !== side) {
      const remaining = f.start + f.duration - now;
      if (remaining > 0 && remaining < 650) {
        return remaining > 330 ? -0.9 * smooth((650 - remaining) / 320) : -0.9 * (remaining / 330);
      }
    }
    return 0;
  }

  private moodOf(side: Side, now: number): Mood {
    const m = this.mood[side];
    if (now < m.until) return m.m;
    const f = this.flight;
    if (f && f.from !== side && !f.hurried && (now - f.start) / f.duration > 0.45) return 'focus';
    return 'neutral';
  }

  // --- ball ----------------------------------------------------------------

  private ballPos(now: number): { x: number; y: number } | null {
    const f = this.flight;
    if (!f) {
      const c = this.contactPoint(this.heldBy);
      return c;
    }
    const dir = f.from === 'opp' ? 1 : -1;
    const a = this.contactPoint(f.from);
    const b = this.contactPoint(f.from === 'opp' ? 'player' : 'opp');
    const p = (now - f.start) / f.duration;
    if (p < 1) return this.arc(a.x, b.x, p);
    if (!f.miss) return { x: b.x, y: HIT_Y };
    const t = ((p - 1) * f.duration) / 1000;
    const y = HIT_Y + 520 * t * t;
    return y > H + 20 ? null : { x: b.x + dir * 90 * t, y };
  }

  private arc(x0: number, x1: number, p: number): { x: number; y: number } {
    const x = x0 + (x1 - x0) * p;
    if (p < BOUNCE_AT) {
      const q = p / BOUNCE_AT;
      return { x, y: HIT_Y + (TABLE_TOP - HIT_Y) * q - 80 * Math.sin(Math.PI * q) };
    }
    const q = (p - BOUNCE_AT) / (1 - BOUNCE_AT);
    return { x, y: TABLE_TOP + (HIT_Y - TABLE_TOP) * q - 30 * Math.sin(Math.PI * q) };
  }

  // --- drawing -------------------------------------------------------------

  private draw(now: number): void {
    const c = this.ctx;
    c.setTransform(S, 0, 0, S, 0, 0);
    c.clearRect(0, 0, W, H);

    c.save();
    const st = (now - this.shakeInfo.start) / this.shakeInfo.dur;
    if (st >= 0 && st < 1) {
      const m = this.shakeInfo.mag * (1 - st);
      c.translate((Math.random() - 0.5) * 2 * m, (Math.random() - 0.5) * 2 * m);
      const zoom = 1 + 0.035 * Math.sin(Math.PI * Math.min(1, st * 1.6));
      c.translate(W / 2, H / 2);
      c.scale(zoom, zoom);
      c.translate(-W / 2, -H / 2);
    }

    this.drawArena(c, now);
    this.drawFloor(c);
    this.drawReflections(c, now);
    this.drawTable(c, now);
    this.drawAthlete(c, 'opp', now);
    this.drawAthlete(c, 'player', now);
    const ball = this.ballPos(now);
    if (ball) {
      this.drawTrail(c, now);
      this.drawBall(c, ball.x, ball.y, now);
    }
    this.drawParticles(c);
    this.drawFlashes(c, now);
    c.restore();
    this.drawUrgency(c, now);
  }

  private buildCrowd(): void {
    const shirts = ['#e63946', '#f1c453', '#2a9d8f', '#8e7dbe', '#f4a261', '#4cc9f0', '#ff70a6', '#90be6d'];
    for (let row = 0; row < 2; row++) {
      for (let x = row ? 12 : 30; x < W; x += 38) {
        this.crowd.push({
          x: x + (Math.random() - 0.5) * 8,
          row,
          shirt: shirts[Math.floor(Math.random() * shirts.length)] as string,
          skin: SKINS[Math.floor(Math.random() * SKINS.length)] as string,
          phase: Math.random() * 6.28,
          size: 1 + Math.random() * 0.15,
        });
      }
    }
  }

  private drawArena(c: CanvasRenderingContext2D, now: number): void {
    const wall = c.createLinearGradient(0, 0, 0, FLOOR);
    wall.addColorStop(0, '#101c33');
    wall.addColorStop(1, '#22456f');
    c.fillStyle = wall;
    c.fillRect(0, 0, W, FLOOR);

    // stands
    c.fillStyle = '#0c1424';
    c.fillRect(0, 78, W, 130);
    const t = now / 1000;
    for (const m of this.crowd) {
      const baseY = m.row === 0 ? 128 : 172;
      const amp = 1 + this.boost * 7;
      const bob = Math.abs(Math.sin(t * (3 + this.boost * 5) + m.phase)) * amp;
      const y = baseY - bob;
      c.fillStyle = m.shirt;
      c.beginPath();
      c.roundRect(m.x - 10 * m.size, y, 20 * m.size, 30, 7);
      c.fill();
      c.fillStyle = m.skin;
      c.beginPath();
      c.arc(m.x, y - 6, 8 * m.size, 0, Math.PI * 2);
      c.fill();
      if (this.boost > 0.45 && Math.sin(m.phase * 3) > -0.2) {
        c.strokeStyle = m.skin;
        c.lineWidth = 4;
        c.lineCap = 'round';
        const wave = Math.sin(t * 9 + m.phase) * 4;
        c.beginPath();
        c.moveTo(m.x - 9 * m.size, y + 8);
        c.lineTo(m.x - 14 * m.size + wave, y - 12);
        c.moveTo(m.x + 9 * m.size, y + 8);
        c.lineTo(m.x + 14 * m.size - wave, y - 12);
        c.stroke();
      }
    }
    c.fillStyle = 'rgba(8,14,28,0.42)'; // dim the crowd so the players stand out
    c.fillRect(0, 78, W, 130);
    c.fillStyle = '#2b3a58';
    c.fillRect(0, 205, W, 8);
    c.fillStyle = '#3a4d73';
    c.fillRect(0, 205, W, 2);

    // pennants
    for (let x = 0; x < W + 40; x += 40) {
      c.fillStyle = CONFETTI[(x / 40) % CONFETTI.length] as string;
      c.beginPath();
      c.moveTo(x, 66);
      c.lineTo(x + 28, 66);
      c.lineTo(x + 14, 90);
      c.fill();
    }
    c.strokeStyle = '#8a97b3';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(0, 66);
    c.lineTo(W, 66);
    c.stroke();

    // LED scoreboard
    c.fillStyle = '#05080f';
    c.beginPath();
    c.roundRect(W / 2 - 150, 8, 300, 50, 8);
    c.fill();
    c.strokeStyle = '#3a4d73';
    c.lineWidth = 2;
    c.stroke();
    c.font = '700 24px "Courier New", monospace';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = '#ffb703';
    c.fillText(`YOU ${this.score.player} : ${this.score.opp} ${this.oppName.split(' ')[0]?.toUpperCase()}`, W / 2, 34);
    c.textBaseline = 'alphabetic';

    // spotlights
    c.save();
    c.globalCompositeOperation = 'lighter';
    for (const x of [200, 400, 600]) {
      const g = c.createLinearGradient(x, 0, x, TABLE_TOP);
      g.addColorStop(0, 'rgba(255,244,200,0.16)');
      g.addColorStop(1, 'rgba(255,244,200,0)');
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(x - 12, 0);
      c.lineTo(x + 12, 0);
      c.lineTo(x + 90, TABLE_TOP + 40);
      c.lineTo(x - 90, TABLE_TOP + 40);
      c.fill();
    }
    c.restore();
  }

  private drawFloor(c: CanvasRenderingContext2D): void {
    const g = c.createLinearGradient(0, FLOOR, 0, H);
    g.addColorStop(0, '#c4915a');
    g.addColorStop(1, '#8c5e33');
    c.fillStyle = g;
    c.fillRect(0, FLOOR, W, H - FLOOR);
    c.fillStyle = 'rgba(0,0,0,0.14)';
    for (let y = FLOOR + 10; y < H; y += 12) c.fillRect(0, y, W, 1);
    c.fillStyle = 'rgba(255,255,255,0.22)';
    c.fillRect(0, FLOOR, W, 3);
  }

  private drawReflections(c: CanvasRenderingContext2D, now: number): void {
    c.save();
    c.beginPath();
    c.rect(0, FLOOR, W, H - FLOOR);
    c.clip();
    c.globalAlpha = 0.16;
    c.translate(0, 2 * FLOOR);
    c.scale(1, -1);
    this.drawAthlete(c, 'opp', now);
    this.drawAthlete(c, 'player', now);
    c.restore();
  }

  private drawTable(c: CanvasRenderingContext2D, now: number): void {
    // shadow on the floor
    c.fillStyle = 'rgba(0,0,0,0.28)';
    c.beginPath();
    c.ellipse(NET_X, FLOOR + 6, 290, 9, 0, 0, Math.PI * 2);
    c.fill();
    // legs and brace
    c.fillStyle = '#1f2937';
    for (const x of [TABLE_LEFT + 28, TABLE_RIGHT - 36]) c.fillRect(x, TABLE_TOP, 8, FLOOR - TABLE_TOP);
    c.fillStyle = '#374151';
    c.fillRect(TABLE_LEFT + 30, TABLE_TOP + 36, TABLE_RIGHT - TABLE_LEFT - 62, 5);
    // top surface with a shine
    const top = c.createLinearGradient(0, TABLE_TOP, 0, TABLE_TOP + 13);
    top.addColorStop(0, '#13a07a');
    top.addColorStop(1, '#0a6a50');
    c.fillStyle = top;
    c.beginPath();
    c.roundRect(TABLE_LEFT, TABLE_TOP, TABLE_RIGHT - TABLE_LEFT, 13, 3);
    c.fill();
    c.fillStyle = '#f3f4f6';
    c.fillRect(TABLE_LEFT, TABLE_TOP - 2, TABLE_RIGHT - TABLE_LEFT, 2.5);
    c.fillStyle = 'rgba(255,255,255,0.28)';
    c.fillRect(TABLE_LEFT + 20, TABLE_TOP + 3, TABLE_RIGHT - TABLE_LEFT - 40, 2);
    // bounce glow
    if (this.bounceSpot) {
      const a = 1 - (now - this.bounceSpot.t) / 450;
      if (a > 0) {
        c.fillStyle = `rgba(255,255,255,${a * 0.55})`;
        c.beginPath();
        c.ellipse(this.bounceSpot.x, TABLE_TOP - 1, 22 * (1.4 - a * 0.4), 4, 0, 0, Math.PI * 2);
        c.fill();
      }
    }
    // net with mesh and posts
    c.strokeStyle = 'rgba(255,255,255,0.45)';
    c.lineWidth = 1;
    for (let y = TABLE_TOP - 34; y < TABLE_TOP - 2; y += 6) {
      c.beginPath();
      c.moveTo(NET_X - 1.5, y);
      c.lineTo(NET_X + 1.5, y);
      c.stroke();
    }
    c.fillStyle = 'rgba(255,255,255,0.35)';
    c.fillRect(NET_X - 2, TABLE_TOP - 36, 4, 36);
    c.fillStyle = '#ffffff';
    c.fillRect(NET_X - 6, TABLE_TOP - 39, 12, 5);
    c.fillStyle = '#9ca3af';
    c.fillRect(NET_X - 3, TABLE_TOP - 2, 6, 3);
  }

  private drawAthlete(c: CanvasRenderingContext2D, side: Side, now: number): void {
    const look = this.looks[side];
    const dir = side === 'opp' ? 1 : -1;
    const homeX = side === 'opp' ? OPP_X : PLAYER_X;
    const a = this.swingPos[side];
    const t = now / 1000;

    // body motion: idle bounce, lunge toward the table after a miss, hops when celebrating
    const lt = clamp01((now - this.lunge[side]) / 500);
    const lungeX = dir * 22 * Math.sin(Math.PI * Math.min(1, lt * 1.4)) * (lt < 1 ? 1 : 0);
    const jt = (now - this.jump[side]) / 1100;
    const jumpY = jt >= 0 && jt < 1 ? -Math.abs(Math.sin(jt * Math.PI * 2)) * 46 * (1 - jt * 0.4) : 0;
    const bob = Math.sin(t * 5 + (side === 'opp' ? 0 : 1.5)) * 1.8;
    const x = homeX + lungeX;
    const hipY = FLOOR - 66 + bob + jumpY;
    const mood = this.moodOf(side, now);

    // floor shadow shrinks while airborne
    c.fillStyle = 'rgba(0,0,0,0.3)';
    c.beginPath();
    c.ellipse(x, FLOOR + 3, 26 - Math.abs(jumpY) * 0.25, 6, 0, 0, Math.PI * 2);
    c.fill();

    // legs
    const step = Math.sin(t * 5 + (side === 'opp' ? 0 : 1.5)) * 3;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    for (const [off, foot] of [
      [-7, -step],
      [7, step],
    ] as const) {
      const footX = x + off * 1.5 + foot + dir * 4 + (jumpY < -4 ? 0 : 0);
      const footY = FLOOR + jumpY * 0.4;
      c.strokeStyle = look.skin;
      c.lineWidth = 8;
      c.beginPath();
      c.moveTo(x + off, hipY + 6);
      c.quadraticCurveTo(x + off + dir * 9, (hipY + footY) / 2 + 4, footX, footY - 5);
      c.stroke();
      c.fillStyle = '#f9fafb';
      c.beginPath();
      c.ellipse(footX + dir * 3, footY - 2, 9, 4.5, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = look.shirt;
      c.fillRect(footX - 4, footY - 9, 8, 3);
    }

    // torso, leaning with the swing
    const lean = dir * a * 0.13;
    c.save();
    c.translate(x, hipY);
    c.rotate(lean);
    c.fillStyle = '#1e293b'; // shorts
    c.beginPath();
    c.roundRect(-17, -2, 34, 20, 6);
    c.fill();
    c.fillStyle = look.shirt;
    c.beginPath();
    c.roundRect(-19, -62, 38, 66, 12);
    c.fill();
    c.fillStyle = 'rgba(255,255,255,0.22)';
    c.fillRect(-19, -30, 38, 4);
    c.fillStyle = 'rgba(255,255,255,0.9)';
    c.font = '800 18px "Trebuchet MS", sans-serif';
    c.textAlign = 'center';
    c.fillText(side === 'opp' ? '9' : '1', 0, -38);
    this.drawHead(c, look, dir, mood, now);
    c.restore();

    // shoulder position after the lean, then arm and paddle in world coordinates
    const sx = x + Math.sin(lean) * 52 - dir * 2;
    const sy = hipY - Math.cos(lean) * 52;
    this.drawArmAndPaddle(c, side, look, dir, a, sx, sy, now, lungeX);
  }

  private drawHead(c: CanvasRenderingContext2D, look: Look, dir: number, mood: Mood, now: number): void {
    const hy = -84;
    c.fillStyle = look.skin;
    c.fillRect(-4, -66, 8, 8);
    c.beginPath();
    c.arc(0, hy, 21, 0, Math.PI * 2);
    c.fill();
    // hair and headband
    c.fillStyle = look.hair;
    c.beginPath();
    c.arc(0, hy - 2, 22, Math.PI * 1.02, Math.PI * 1.98);
    c.lineTo(-dir * 21, hy - 4);
    c.fill();
    c.beginPath();
    c.ellipse(-dir * 18, hy + 2, 6, 11, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = look.band;
    c.fillRect(-21, hy - 11, 42, 6);
    // eyes
    const ex = dir * 8;
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.ellipse(ex, hy - 1, 6, mood === 'cheer' || mood === 'happy' ? 4 : 6, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#111827';
    c.beginPath();
    c.arc(ex + dir * 2, hy - 1, 2.8, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#111827';
    c.lineWidth = 2.2;
    c.beginPath();
    if (mood === 'focus') {
      c.moveTo(ex - 7, hy - 11 - dir * 0);
      c.lineTo(ex + 7, hy - 6);
    } else if (mood === 'sad') {
      c.moveTo(ex - 6, hy - 6);
      c.lineTo(ex + 6, hy - 11);
    } else {
      c.moveTo(ex - 6, hy - 9);
      c.lineTo(ex + 6, hy - 9);
    }
    c.stroke();
    // cheeks and mouth
    c.fillStyle = 'rgba(239,71,111,0.35)';
    c.beginPath();
    c.arc(dir * 12, hy + 7, 4, 0, Math.PI * 2);
    c.fill();
    const mx = dir * 9;
    c.strokeStyle = '#7f1d1d';
    c.fillStyle = '#7f1d1d';
    c.lineWidth = 2.4;
    c.beginPath();
    if (mood === 'cheer') {
      c.ellipse(mx, hy + 10, 6, 5 + Math.sin(now / 90) * 1.2, 0, 0, Math.PI * 2);
      c.fill();
    } else if (mood === 'happy') {
      c.arc(mx, hy + 6, 6, 0.15 * Math.PI, 0.85 * Math.PI);
      c.stroke();
    } else if (mood === 'sad') {
      c.arc(mx, hy + 16, 6, 1.15 * Math.PI, 1.85 * Math.PI);
      c.stroke();
    } else if (mood === 'focus') {
      c.moveTo(mx - 5, hy + 11);
      c.lineTo(mx + 5, hy + 11);
      c.stroke();
    } else {
      c.arc(mx, hy + 8, 5, 0.2 * Math.PI, 0.8 * Math.PI);
      c.stroke();
    }
  }

  private drawArmAndPaddle(
    c: CanvasRenderingContext2D,
    side: Side,
    look: Look,
    dir: number,
    a: number,
    sx: number,
    sy: number,
    now: number,
    bodyDx: number,
  ): void {
    const cp = this.contactPoint(side);
    const celebrating = this.moodOf(side, now) === 'cheer' && now - this.jump[side] < 1100;
    // the paddle's blade centre: back and up on the wind-up, forward and up on the follow-through
    let px = cp.x + bodyDx + dir * (a >= 0 ? a * 24 : a * 20);
    let py = HIT_Y - (a >= 0 ? a * 36 : -a * 14);
    const f = this.flight;
    if (f && f.miss && f.from !== side) {
      const remaining = f.start + f.duration - now;
      if (remaining < 420) py += 28 * smooth((420 - remaining) / 300); // swings under the ball
    }
    if (celebrating) {
      px = sx + dir * 14;
      py = sy - 56 - Math.abs(Math.sin(now / 110)) * 10;
    }
    const tilt = 0.45 + a * 0.9;
    const vx = dir * Math.sin(tilt) * 18;
    const vy = -Math.cos(tilt) * 18;
    const hx = px - vx;
    const hy = py - vy;

    // arm: upper arm in shirt colour, forearm in skin
    const ex = (sx + hx) / 2 - dir * 4;
    const ey = (sy + hy) / 2 + 14;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.strokeStyle = look.shirt;
    c.lineWidth = 11;
    c.beginPath();
    c.moveTo(sx, sy);
    c.lineTo(ex, ey);
    c.stroke();
    c.strokeStyle = look.skin;
    c.lineWidth = 8;
    c.beginPath();
    c.moveTo(ex, ey);
    c.lineTo(hx, hy);
    c.stroke();

    // paddle: wooden handle and a red rubber blade
    c.strokeStyle = '#8a5a2b';
    c.lineWidth = 5;
    c.beginPath();
    c.moveTo(hx - vx * 0.3, hy - vy * 0.3);
    c.lineTo(px, py);
    c.stroke();
    const hot = side === 'player' ? this.swings.player.power > 1.2 && now - this.swings.player.start < 380 : this.swings.opp.power > 1.2 && now - this.swings.opp.start < 380;
    if (hot) {
      c.save();
      c.globalCompositeOperation = 'lighter';
      const g = c.createRadialGradient(px, py, 2, px, py, 34);
      g.addColorStop(0, 'rgba(255,140,40,0.85)');
      g.addColorStop(1, 'rgba(255,140,40,0)');
      c.fillStyle = g;
      c.beginPath();
      c.arc(px, py, 34, 0, Math.PI * 2);
      c.fill();
      c.restore();
    }
    c.fillStyle = '#d62828';
    c.beginPath();
    c.arc(px + vx * 0.25, py + vy * 0.25 - 2, 15, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#111827';
    c.lineWidth = 2;
    c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.28)';
    c.beginPath();
    c.arc(px + vx * 0.25 - 4, py + vy * 0.25 - 7, 5, 0, Math.PI * 2);
    c.fill();
  }

  private drawTrail(c: CanvasRenderingContext2D, now: number): void {
    const hot = this.hotLevel();
    const n = this.trail.length;
    if (n < 2) return;
    c.save();
    c.globalCompositeOperation = hot > 0 ? 'lighter' : 'source-over';
    for (let i = 0; i < n; i++) {
      const p = this.trail[i] as { x: number; y: number; t: number };
      const k = (i + 1) / n;
      const age = clamp01((now - p.t) / (230 + hot * 160));
      const alpha = (1 - age) * 0.5 * k + 0.02;
      c.fillStyle = hot > 1 ? `rgba(255,90,20,${alpha})` : hot > 0 ? `rgba(255,190,60,${alpha})` : `rgba(255,255,255,${alpha * 0.8})`;
      c.beginPath();
      c.arc(p.x, p.y, 2 + k * (hot ? 7 : 5), 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
  }

  private drawBall(c: CanvasRenderingContext2D, x: number, y: number, now: number): void {
    const f = this.flight;
    // shadow on the table: smaller and fainter the higher the ball is
    if (y < TABLE_TOP && x > TABLE_LEFT && x < TABLE_RIGHT) {
      const h = clamp01((TABLE_TOP - y) / 110);
      c.fillStyle = `rgba(0,0,0,${0.32 - h * 0.2})`;
      c.beginPath();
      c.ellipse(x, TABLE_TOP + 5, 9 - h * 4, 3 - h, 0, 0, Math.PI * 2);
      c.fill();
    }
    // urgency glow while the time to spell is running out
    if (f && f.from === 'opp' && !f.miss && !f.hurried) {
      const u = clamp01(((now - f.start) / f.duration - 0.6) / 0.4);
      if (u > 0) {
        const pulse = 0.6 + 0.4 * Math.sin(now / (130 - u * 80));
        c.save();
        c.globalCompositeOperation = 'lighter';
        const g = c.createRadialGradient(x, y, 2, x, y, 12 + u * 16);
        g.addColorStop(0, `rgba(255,60,60,${0.9 * u * pulse})`);
        g.addColorStop(1, 'rgba(255,60,60,0)');
        c.fillStyle = g;
        c.beginPath();
        c.arc(x, y, 12 + u * 16, 0, Math.PI * 2);
        c.fill();
        c.restore();
      }
    }
    const squash = now < this.squashUntil ? 1 - (this.squashUntil - now) / 110 : 1;
    const sx = 1 + (1 - Math.sin(Math.PI * squash)) * 0 + (now < this.squashUntil ? 0.35 * Math.sin(Math.PI * squash) : 0);
    const sy = 1 - (now < this.squashUntil ? 0.3 * Math.sin(Math.PI * squash) : 0);
    c.save();
    c.translate(x, y);
    c.scale(sx, sy);
    const g = c.createRadialGradient(-2.5, -2.5, 1, 0, 0, 9);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, '#ffd9a0');
    c.fillStyle = g;
    c.beginPath();
    c.arc(0, 0, 8.5, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#f59e0b';
    c.lineWidth = 1.6;
    c.stroke();
    c.rotate(this.spin);
    c.strokeStyle = 'rgba(217,119,6,0.75)'; // spinning seam
    c.lineWidth = 1.6;
    c.beginPath();
    c.arc(0, 0, 5.5, -0.9, 0.9);
    c.stroke();
    c.restore();
  }

  private drawParticles(c: CanvasRenderingContext2D): void {
    for (const p of this.particles) {
      const k = clamp01(p.life / p.max);
      c.save();
      switch (p.kind) {
        case 'ring': {
          c.strokeStyle = p.color;
          c.globalAlpha = k;
          c.lineWidth = 3 * k + 1;
          c.beginPath();
          c.arc(p.x, p.y, p.size + (1 - k) * 34, 0, Math.PI * 2);
          c.stroke();
          break;
        }
        case 'spark': {
          c.strokeStyle = p.color;
          c.globalAlpha = k;
          c.lineWidth = p.size;
          c.lineCap = 'round';
          c.beginPath();
          c.moveTo(p.x, p.y);
          c.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04);
          c.stroke();
          break;
        }
        case 'dust': {
          c.fillStyle = p.color;
          c.globalAlpha = k * 0.7;
          c.beginPath();
          c.arc(p.x, p.y, p.size * (1.6 - k * 0.6), 0, Math.PI * 2);
          c.fill();
          break;
        }
        case 'fire': {
          c.globalCompositeOperation = 'lighter';
          c.fillStyle = p.color;
          c.globalAlpha = k * 0.8;
          c.beginPath();
          c.arc(p.x, p.y, p.size * k + 1, 0, Math.PI * 2);
          c.fill();
          break;
        }
        case 'confetti': {
          c.translate(p.x, p.y);
          c.rotate(p.rot);
          c.fillStyle = p.color;
          c.globalAlpha = Math.min(1, k * 2);
          c.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
          break;
        }
      }
      c.restore();
    }
  }

  private drawFlashes(c: CanvasRenderingContext2D, now: number): void {
    this.flashes = this.flashes.filter((f) => now - f.start < 1300);
    c.textAlign = 'center';
    for (const f of this.flashes) {
      const t = (now - f.start) / 1300;
      const pop = easeOutBack(clamp01(t * 5));
      const size = f.big ? 72 : 40;
      c.save();
      c.globalAlpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
      c.translate(W / 2, f.big ? 150 - t * 24 : 215 - t * 16);
      c.rotate(f.big ? -0.06 : 0);
      c.scale(pop, pop);
      c.font = `900 ${size}px "Trebuchet MS", system-ui, sans-serif`;
      c.lineJoin = 'round';
      c.lineWidth = f.big ? 11 : 8;
      c.strokeStyle = '#1f2937';
      c.strokeText(f.text, 0, 0);
      c.fillStyle = f.color;
      c.fillText(f.text, 0, 0);
      c.restore();
    }
  }

  /** Red vignette that pulses when the player's time is almost gone. */
  private drawUrgency(c: CanvasRenderingContext2D, now: number): void {
    const f = this.flight;
    if (!f || f.from !== 'opp' || f.miss || f.hurried) return;
    const u = clamp01(((now - f.start) / f.duration - 0.7) / 0.3);
    if (u <= 0) return;
    const pulse = 0.5 + 0.5 * Math.sin(now / (150 - u * 90));
    const g = c.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 0.95);
    g.addColorStop(0, 'rgba(255,40,40,0)');
    g.addColorStop(1, `rgba(255,40,40,${0.38 * u * pulse})`);
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
  }
}
