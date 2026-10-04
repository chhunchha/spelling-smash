export type Side = 'opp' | 'player';

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
const SWING_MS = 240;

interface Flight {
  from: Side;
  start: number;
  duration: number;
  /** When true the ball is not returned: it passes the receiver and falls. */
  miss: boolean;
}

/** Canvas drawing of the table, the two players and the ball. Game logic lives elsewhere. */
export class Scene {
  private ctx: CanvasRenderingContext2D;
  private flight: Flight | null = null;
  private heldBy: Side = 'opp';
  private swing: Record<Side, number> = { opp: -1e9, player: -1e9 };
  private flash: { text: string; start: number } | null = null;
  private raf = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private oppColor: string,
  ) {
    canvas.width = W;
    canvas.height = H;
    this.ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  }

  start(): void {
    const loop = () => {
      this.draw(performance.now());
      this.raf = requestAnimationFrame(loop);
    };
    loop();
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
  }

  /** Hit the ball from `from` toward the other side over `durationMs`. */
  flyBall(from: Side, durationMs: number, miss = false): void {
    const now = performance.now();
    this.swing[from] = now;
    this.flight = { from, start: now, duration: durationMs, miss };
    this.heldBy = from === 'opp' ? 'player' : 'opp';
  }

  /** Speed the current flight up so it ends `ms` from now, keeping the ball where it is. */
  hurry(ms: number, miss = false): void {
    const f = this.flight;
    if (!f) return;
    const now = performance.now();
    const p = Math.min(1, (now - f.start) / f.duration);
    this.flight = { ...f, duration: ms / Math.max(1 - p, 0.05), start: now - p * (ms / Math.max(1 - p, 0.05)), miss };
  }

  /** Mark the current flight as a miss without changing its speed. */
  failFlight(): void {
    if (this.flight) this.flight = { ...this.flight, miss: true };
  }

  /** Show big text in the middle of the screen for a moment. */
  showFlash(text: string): void {
    this.flash = { text, start: performance.now() };
  }

  /** Put the ball back on the opponent's paddle with no motion. */
  resetBall(): void {
    this.flight = null;
    this.heldBy = 'opp';
  }

  // --- drawing -------------------------------------------------------------

  private ballPos(now: number): { x: number; y: number } | null {
    const f = this.flight;
    if (!f) {
      return { x: this.heldBy === 'opp' ? OPP_X + PADDLE_REACH : PLAYER_X - PADDLE_REACH, y: HIT_Y };
    }
    const dir = f.from === 'opp' ? 1 : -1;
    const x0 = f.from === 'opp' ? OPP_X + PADDLE_REACH : PLAYER_X - PADDLE_REACH;
    const x1 = f.from === 'opp' ? PLAYER_X - PADDLE_REACH : OPP_X + PADDLE_REACH;
    const p = (now - f.start) / f.duration;
    if (p < 1) return this.arc(x0, x1, p);
    const end = { x: x1, y: HIT_Y };
    if (!f.miss) return end;
    const t = ((p - 1) * f.duration) / 1000;
    const y = end.y + 520 * t * t;
    return y > H + 20 ? null : { x: end.x + dir * 90 * t, y };
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

  private draw(now: number): void {
    const c = this.ctx;
    c.clearRect(0, 0, W, H);
    this.drawRoom(c);
    this.drawTable(c);
    this.drawPlayer(c, OPP_X, 1, this.oppColor, this.swingAmount('opp', now));
    this.drawPlayer(c, PLAYER_X, -1, '#3b82f6', this.swingAmount('player', now));
    const ball = this.ballPos(now);
    if (ball) this.drawBall(c, ball.x, ball.y);
    this.drawFlash(c, now);
  }

  private swingAmount(side: Side, now: number): number {
    const t = (now - this.swing[side]) / SWING_MS;
    return t >= 0 && t < 1 ? Math.sin(Math.PI * t) : 0;
  }

  private drawRoom(c: CanvasRenderingContext2D): void {
    const wall = c.createLinearGradient(0, 0, 0, FLOOR);
    wall.addColorStop(0, '#1d3557');
    wall.addColorStop(1, '#274c77');
    c.fillStyle = wall;
    c.fillRect(0, 0, W, FLOOR);
    c.fillStyle = '#b5834f';
    c.fillRect(0, FLOOR, W, H - FLOOR);
    c.fillStyle = 'rgba(255,255,255,0.08)';
    for (let x = 30; x < W; x += 110) c.fillRect(x, 40, 60, 90); // gym windows
  }

  private drawTable(c: CanvasRenderingContext2D): void {
    c.fillStyle = '#1f2937';
    for (const x of [TABLE_LEFT + 30, TABLE_RIGHT - 38]) c.fillRect(x, TABLE_TOP, 8, FLOOR - TABLE_TOP);
    c.fillStyle = '#0b6e4f';
    c.fillRect(TABLE_LEFT, TABLE_TOP, TABLE_RIGHT - TABLE_LEFT, 12);
    c.fillStyle = '#e5e7eb';
    c.fillRect(NET_X - 1.5, TABLE_TOP - 4, 3, 4);
    c.fillRect(TABLE_LEFT, TABLE_TOP - 2, TABLE_RIGHT - TABLE_LEFT, 2);
    // net
    c.fillStyle = 'rgba(255,255,255,0.75)';
    c.fillRect(NET_X - 2, TABLE_TOP - 36, 4, 36);
    c.fillStyle = '#ffffff';
    c.fillRect(NET_X - 5, TABLE_TOP - 38, 10, 4);
  }

  private drawPlayer(c: CanvasRenderingContext2D, x: number, dir: number, color: string, swing: number): void {
    c.lineCap = 'round';
    c.strokeStyle = '#111827';
    c.lineWidth = 9;
    c.beginPath(); // legs
    c.moveTo(x - 10, FLOOR);
    c.lineTo(x, FLOOR - 70);
    c.lineTo(x + 10, FLOOR);
    c.stroke();
    c.fillStyle = color; // body
    c.beginPath();
    c.roundRect(x - 20, FLOOR - 160, 40, 95, 12);
    c.fill();
    c.fillStyle = '#f2c9a0'; // head
    c.beginPath();
    c.arc(x, FLOOR - 185, 20, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#111827';
    c.beginPath();
    c.arc(x + dir * 7, FLOOR - 188, 3, 0, Math.PI * 2);
    c.fill();
    // arm and paddle
    const px = x + dir * (PADDLE_REACH - 8 + swing * 14);
    const py = HIT_Y + 4 - swing * 18;
    c.strokeStyle = '#f2c9a0';
    c.lineWidth = 8;
    c.beginPath();
    c.moveTo(x, FLOOR - 140);
    c.lineTo(px - dir * 6, py);
    c.stroke();
    c.fillStyle = '#d62828';
    c.beginPath();
    c.arc(px, py - 4, 15, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#7f5539';
    c.lineWidth = 5;
    c.beginPath();
    c.moveTo(px - dir * 6, py + 8);
    c.lineTo(px - dir * 12, py + 20);
    c.stroke();
  }

  private drawBall(c: CanvasRenderingContext2D, x: number, y: number): void {
    if (y < TABLE_TOP) {
      c.fillStyle = 'rgba(0,0,0,0.25)';
      c.beginPath();
      c.ellipse(x, TABLE_TOP + 4, 8, 3, 0, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = '#fff7e6';
    c.beginPath();
    c.arc(x, y, 8, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#f59e0b';
    c.lineWidth = 2;
    c.stroke();
  }

  private drawFlash(c: CanvasRenderingContext2D, now: number): void {
    if (!this.flash) return;
    const t = (now - this.flash.start) / 1100;
    if (t >= 1) {
      this.flash = null;
      return;
    }
    c.save();
    c.globalAlpha = 1 - t * t;
    c.font = '900 64px "Trebuchet MS", system-ui, sans-serif';
    c.textAlign = 'center';
    c.lineWidth = 8;
    c.strokeStyle = '#1f2937';
    c.fillStyle = '#ffd166';
    const y = 120 - t * 30;
    c.strokeText(this.flash.text, W / 2, y);
    c.fillText(this.flash.text, W / 2, y);
    c.restore();
  }
}
