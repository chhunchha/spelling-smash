import {
  MatchState,
  OPPONENTS,
  SMASH_FRACTION,
  opponentReturns,
  timeLimitMs,
  xpForAnswer,
  type Opponent,
} from '../engine/match';
import { sfx } from '../engine/sfx';
import { say, stopSpeaking } from '../engine/speech';
import { pickWord, wordKey } from '../engine/srs';
import { store } from '../engine/store';
import type { Word } from '../types';
import { h } from '../ui/dom';
import { Scene } from './scene';

/** Where to go when the match screen closes: a screen, or the index of the next opponent. */
export type ExitTarget = 'home' | 'ladder' | number;

type Outcome = 'correct' | 'wrong' | 'timeout' | 'cancelled';

const RECENT_WORDS = 6;

/** Runs one match: draws the screen, serves words, scores points, and records progress. */
export class MatchController {
  private alive = true;
  private state: MatchState;
  private scene: Scene;
  private recent: string[] = [];
  private missed = new Map<string, Word>();
  private xpGained = 0;
  private cancelAsk: (() => void) | null = null;
  private cancelWait: (() => void) | null = null;

  private canvas = h('canvas', { class: 'court' });
  private playerScoreEl = h('span', { class: 'score-num' }, '0');
  private oppScoreEl = h('span', { class: 'score-num' }, '0');
  private rallyEl = h('div', { class: 'rally' }, ' ');
  private messageEl = h('div', { class: 'message' });
  private slotsEl = h('div', { class: 'slots' });
  private leftEl = h('div', { class: 'letters-left' });
  /** The word being spelled, and whether its letters are shown (when he retypes a missed word). */
  private target = '';
  private reveal = false;
  private shownLength = 0;
  private input = h('input', {
    class: 'answer',
    type: 'text',
    autocomplete: 'off',
    autocapitalize: 'none',
    autocorrect: 'off',
    spellcheck: 'false',
    maxlength: '24',
    'aria-label': 'Type the word',
  });
  private timerFill = h('div', { class: 'timer-fill' });
  private hearBtn = h('button', { class: 'btn small', type: 'button' }, '🔊 Say it slowly');
  private sentenceBtn = h('button', { class: 'btn small', type: 'button' }, '💬 Sentence');
  private goBtn = h('button', { class: 'btn', type: 'button' }, 'Spell it!');
  private promptEl = h('div', { class: 'prompt' });
  private overlay = h('div', { class: 'overlay' });
  private current: Word | null = null;

  constructor(
    private root: HTMLElement,
    private opp: Opponent,
    private oppIndex: number,
    private onExit: (target: ExitTarget) => void,
  ) {
    this.state = new MatchState(opp.target);
    this.scene = new Scene(this.canvas, opp.color, opp.name);
    this.scene.onEvent = (event) => {
      if (event === 'hit') sfx.hit();
      else if (event === 'smash') sfx.smash();
      else if (event === 'bounce') sfx.bounce();
    };
    this.build();
    this.scene.start();
    this.showIntro();
  }

  destroy(): void {
    this.alive = false;
    this.cancelAsk?.();
    this.cancelWait?.();
    this.scene.stop();
    stopSpeaking();
  }

  // --- layout --------------------------------------------------------------

  private build(): void {
    const header = h(
      'div',
      { class: 'scoreboard' },
      h('button', { class: 'back', onclick: () => this.leave('ladder') }, '← Quit'),
      h('div', { class: 'who' }, 'You ', this.playerScoreEl),
      h('div', { class: 'target' }, `First to ${this.opp.target}`),
      h('div', { class: 'who' }, this.oppScoreEl, ` ${this.opp.name}`),
    );
    this.hearBtn.addEventListener('click', () => this.hearWord());
    this.sentenceBtn.addEventListener('click', () => this.hearSentence());
    this.input.addEventListener('input', () => {
      this.slotsEl.classList.remove('shake');
      this.renderSlots();
    });
    // Clicking anywhere on the prompt brings the cursor back to the letter boxes.
    this.promptEl.addEventListener('click', (e) => {
      if (!this.input.disabled && !(e.target instanceof HTMLButtonElement)) this.input.focus();
    });
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.hearWord();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.hearSentence();
      }
    });
    this.promptEl.append(
      h('div', { class: 'timer' }, this.timerFill),
      this.messageEl,
      h('div', { class: 'entry' }, this.slotsEl, this.input),
      this.leftEl,
      h('div', { class: 'row' }, this.hearBtn, this.sentenceBtn, this.goBtn),
      h('div', { class: 'muted keys' }, '↑ hear it again, slower · ↓ hear a sentence · it submits when the word is right'),
    );
    this.setPromptActive(false);
    this.root.replaceChildren(
      h('div', { class: 'match' }, header, this.rallyEl, h('div', { class: 'court-wrap' }, this.canvas, this.overlay), this.promptEl),
    );
  }

  private setPromptActive(active: boolean): void {
    this.input.disabled = !active;
    this.goBtn.disabled = !active;
    this.hearBtn.disabled = !active;
    this.sentenceBtn.disabled = !active || !this.current?.sentence;
    this.promptEl.classList.toggle('idle', !active);
  }

  private showIntro(): void {
    this.overlay.className = 'overlay show';
    this.overlay.replaceChildren(
      h(
        'div',
        { class: 'panel' },
        h('h2', {}, `vs ${this.opp.name}`),
        h('p', {}, `${this.opp.blurb}. First to ${this.opp.target} points wins.`),
        h('p', { class: 'muted' }, 'Listen to the word, type it before the ball reaches you. Be quick for a SMASH!'),
        h('button', { class: 'btn big', onclick: () => this.begin() }, 'Serve!'),
      ),
    );
  }

  private begin(): void {
    this.overlay.className = 'overlay';
    this.overlay.replaceChildren();
    store.touchStreak();
    void this.run();
  }

  private leave(target: ExitTarget): void {
    this.destroy();
    this.onExit(target);
  }

  // --- game loop -----------------------------------------------------------

  private async run(): Promise<void> {
    while (this.alive && !this.state.over) {
      await this.playPoint();
    }
    if (this.alive) this.finish();
  }

  private async playPoint(): Promise<void> {
    this.scene.resetBall();
    this.updateScoreboard();
    this.setMessage('Get ready…');
    await this.wait(900);
    while (this.alive) {
      const word = pickWord(store.activeWords(), store.progress(), this.recent, this.opp.maxDifficulty, Date.now(), Math.random);
      this.recent = [wordKey(word), ...this.recent].slice(0, RECENT_WORDS);
      const limit = timeLimitMs(word.word, this.opp, store.settings().timeMultiplier);

      this.scene.flyBall('opp', limit);
      this.presentWord(word, limit);
      const { outcome, elapsed } = await this.ask(word, limit);
      if (!this.alive || outcome === 'cancelled') return;

      const before = store.progress()[wordKey(word)];
      store.recordAnswer(word, outcome === 'correct');

      if (outcome !== 'correct') {
        await this.loseWord(word, outcome);
        if (!this.alive) return;
        this.setMessage('Got it! Point to your opponent.', '');
        this.state.pointTo('opponent');
        this.scene.celebrate('opp');
        break;
      }
      const smash = elapsed < limit * SMASH_FRACTION;
      const earned = xpForAnswer(before?.box ?? 0, smash);
      this.xpGained += earned;
      store.updateProfile((p) => ({ ...p, xp: p.xp + earned }));

      this.scene.hurry(250);
      await this.wait(270);
      if (!this.alive) return;
      this.state.playerReturned();
      this.scene.setRally(this.state.rally);
      this.updateScoreboard();
      const returns = opponentReturns(this.opp, this.state.rally, smash, Math.random);
      const flight = smash ? 450 : 650;
      if (smash) this.scene.showFlash('SMASH!');
      else if (this.state.rally >= 3) this.scene.showFlash(`RALLY ${this.state.rally}!`, false, '#ff9f1c');
      this.setMessage(smash ? `+${earned} XP · Lightning fast!` : `+${earned} XP · Nice return!`, 'good');
      this.scene.flyBall('player', flight, !returns, smash ? 1.6 : 1);
      await this.wait(flight + (returns ? 0 : 700));
      if (!this.alive) return;
      if (!returns) {
        sfx.point();
        sfx.cheer();
        this.scene.showFlash('POINT!');
        this.state.pointTo('player');
        this.scene.celebrate('player');
        break;
      }
    }
    if (!this.alive) return;
    this.scene.setRally(0);
    this.updateScoreboard();
    await this.wait(1000);
  }

  /** He missed: show the word and make him type it once before the opponent scores. */
  private async loseWord(word: Word, outcome: Outcome): Promise<void> {
    this.missed.set(wordKey(word), word);
    this.scene.hurry(350, true);
    sfx.miss();
    this.setMessage(outcome === 'timeout' ? "Time's up!" : 'Not quite.', 'bad');
    await this.wait(900);
    if (!this.alive) return;
    await this.retype(word);
  }

  // --- word prompt ---------------------------------------------------------

  private presentWord(word: Word, limitMs: number): void {
    this.current = word;
    this.setPromptActive(true);
    this.target = word.word;
    this.reveal = false;
    this.input.value = '';
    this.input.readOnly = false;
    this.renderSlots();
    this.setMessage('Listen and spell the word', '');
    this.input.focus();
    this.timerFill.style.transition = 'none';
    this.timerFill.style.width = '100%';
    void this.timerFill.offsetWidth; // restart the CSS transition
    this.timerFill.style.transition = `width ${limitMs}ms linear`;
    this.timerFill.style.width = '0%';
    say(word, 'word');
  }

  /**
   * Draw one box per letter. Typed letters fill the boxes from the left and the next empty box
   * blinks. Extra letters get red boxes. While he retypes a missed word the correct letters show
   * faintly in the boxes, and each typed letter turns green or red; during normal play no
   * feedback is given, so the boxes never give the spelling away.
   */
  private renderSlots(): void {
    const typed = this.input.value.toLowerCase();
    const target = this.target.toLowerCase();
    const count = Math.max(target.length, typed.length);
    const boxes: HTMLElement[] = [];
    for (let i = 0; i < count; i++) {
      const letter = typed[i];
      const classes = ['slot'];
      if (i >= target.length) classes.push('extra');
      if (letter !== undefined) {
        classes.push('filled');
        if (i === typed.length - 1 && typed.length > this.shownLength) classes.push('pop');
        if (this.reveal && i < target.length) classes.push(letter === target[i] ? 'ok' : 'bad');
      } else {
        if (i === typed.length) classes.push('active');
        if (this.reveal) classes.push('ghost');
      }
      const text = letter ?? (this.reveal ? target[i] : '');
      boxes.push(h('span', { class: classes.join(' ') }, text));
    }
    this.shownLength = typed.length;
    this.slotsEl.style.setProperty('--n', String(count));
    this.slotsEl.replaceChildren(...boxes);

    const left = target.length - typed.length;
    this.leftEl.textContent =
      this.target === ''
        ? ''
        : left > 0
          ? `${left} letter${left === 1 ? '' : 's'} to go`
          : left === 0
            ? 'All letters in! Press Enter to check'
            : `${-left} too many letter${left === -1 ? '' : 's'}: press Backspace`;
  }

  private freezeTimer(remaining: number): void {
    this.timerFill.style.transition = 'none';
    this.timerFill.style.width = `${Math.max(0, remaining) * 100}%`;
  }

  /** Asking again plays the slower, clearer recording. */
  private hearWord(): void {
    if (this.current) say(this.current, 'slow');
    this.input.focus();
  }

  private hearSentence(): void {
    if (this.current?.sentence) say(this.current, 'sentence');
    this.input.focus();
  }

  private ask(word: Word, limitMs: number): Promise<{ outcome: Outcome; elapsed: number }> {
    return new Promise((resolve) => {
      const t0 = performance.now();
      const answer = word.word.toLowerCase();
      const finish = (outcome: Outcome) => {
        clearTimeout(timer);
        this.input.removeEventListener('keydown', onKey);
        this.input.removeEventListener('input', onInput);
        this.goBtn.removeEventListener('click', submit);
        this.cancelAsk = null;
        this.input.readOnly = true;
        const elapsed = performance.now() - t0;
        this.freezeTimer(1 - elapsed / limitMs);
        resolve({ outcome, elapsed });
      };
      const submit = () => {
        const typed = this.input.value.trim().toLowerCase();
        if (typed) finish(typed === answer ? 'correct' : 'wrong');
      };
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          submit();
        }
      };
      // No need to press Enter once the word is right: that saves a slow typist a few seconds.
      const onInput = () => {
        if (this.input.value.trim().toLowerCase() === answer) finish('correct');
      };
      const timer = setTimeout(() => finish('timeout'), limitMs);
      this.cancelAsk = () => finish('cancelled');
      this.input.addEventListener('keydown', onKey);
      this.input.addEventListener('input', onInput);
      this.goBtn.addEventListener('click', submit);
    });
  }

  /** Untimed: show the right spelling and wait until he types it correctly. */
  private retype(word: Word): Promise<void> {
    return new Promise((resolve) => {
      const answer = word.word.toLowerCase();
      this.target = word.word;
      this.reveal = true;
      this.setMessage('Here is the word. Type it letter by letter to keep going!', 'bad');
      this.input.value = '';
      this.input.readOnly = false;
      this.renderSlots();
      this.freezeTimer(0);
      say(word, 'slow');
      this.input.focus();
      const done = () => {
        this.input.removeEventListener('keydown', onKey);
        this.input.removeEventListener('input', onInput);
        this.goBtn.removeEventListener('click', submit);
        this.reveal = false;
        this.input.readOnly = true;
        this.cancelAsk = null;
        resolve();
      };
      const submit = () => {
        if (this.input.value.trim().toLowerCase() === answer) {
          sfx.hit();
          done();
        } else {
          this.slotsEl.classList.remove('shake');
          void this.slotsEl.offsetWidth;
          this.slotsEl.classList.add('shake');
        }
      };
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          submit();
        }
      };
      const onInput = () => {
        if (this.input.value.trim().toLowerCase() === answer) submit();
      };
      this.cancelAsk = done;
      this.input.addEventListener('keydown', onKey);
      this.input.addEventListener('input', onInput);
      this.goBtn.addEventListener('click', submit);
    });
  }

  // --- scoreboard and results ---------------------------------------------

  private setMessage(text: string, tone: '' | 'good' | 'bad' = ''): void {
    this.messageEl.textContent = text;
    this.messageEl.className = `message ${tone}`.trim();
  }

  private updateScoreboard(): void {
    this.scene.setScore(this.state.player, this.state.opponent);
    this.playerScoreEl.textContent = String(this.state.player);
    this.oppScoreEl.textContent = String(this.state.opponent);
    this.rallyEl.textContent = this.state.rally > 0 ? `Rally: ${this.state.rally} 🏓` : ' ';
  }

  private finish(): void {
    this.setPromptActive(false);
    this.updateScoreboard();
    const won = this.state.playerWon;
    const bonus = won ? 30 + this.oppIndex * 10 : 0;
    this.xpGained += bonus;
    store.updateProfile((p) => ({
      ...p,
      xp: p.xp + bonus,
      wins: p.wins + (won ? 1 : 0),
      bestRally: Math.max(p.bestRally, this.state.bestRally),
      beaten: won && !p.beaten.includes(this.oppIndex) ? [...p.beaten, this.oppIndex] : p.beaten,
    }));
    const unlocked = store.refreshUnlocks();
    this.scene.celebrateMatch(won);
    if (won) sfx.cheer();
    (won ? sfx.win : sfx.lose)();

    const nextIndex = won && this.oppIndex + 1 < OPPONENTS.length ? this.oppIndex + 1 : null;
    const missedWords = [...this.missed.values()];
    this.overlay.className = 'overlay show';
    this.overlay.replaceChildren(
      h(
        'div',
        { class: 'panel' },
        h('h2', {}, won ? '🏆 You won!' : 'So close!'),
        h('p', { class: 'final-score' }, `${this.state.player} – ${this.state.opponent}`),
        h('p', {}, `Best rally: ${this.state.bestRally} · +${this.xpGained} XP`),
        ...unlocked.map((pack) =>
          h('p', { class: 'unlock' }, `${pack.emoji} New word pack unlocked: ${pack.name}!`),
        ),
        missedWords.length > 0
          ? h(
              'div',
              { class: 'missed' },
              h('strong', {}, 'Words to practice:'),
              h('div', { class: 'chips' }, ...missedWords.map((w) => h('span', { class: 'chip' }, w.word))),
            )
          : h('p', { class: 'good' }, 'No misses — perfect spelling!'),
        h(
          'div',
          { class: 'row' },
          nextIndex !== null
            ? h('button', { class: 'btn', onclick: () => this.leave(nextIndex) }, `Next: ${OPPONENTS[nextIndex]?.name}`)
            : null,
          h('button', { class: 'btn', onclick: () => this.leave(this.oppIndex) }, won ? 'Play again' : 'Try again'),
          h('button', { class: 'btn secondary', onclick: () => this.leave('ladder') }, 'Opponents'),
        ),
      ),
    );
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const t = setTimeout(() => {
        this.cancelWait = null;
        resolve();
      }, ms);
      this.cancelWait = () => {
        clearTimeout(t);
        resolve();
      };
    });
  }
}
