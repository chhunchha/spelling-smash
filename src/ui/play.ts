import { OPPONENTS } from '../engine/match';
import { isUnlocked } from '../engine/profile';
import { store } from '../engine/store';
import { MatchController } from '../game/matchController';
import { h } from './dom';
import type { Nav, Screen } from './router';

const DIFFICULTY_LABEL = { 1: 'Easy words', 2: 'Medium words', 3: 'Tricky words' } as const;

export function playScreen(nav: Nav): Screen {
  const el = h('main', { class: 'screen play' });
  let controller: MatchController | null = null;

  const showLadder = () => {
    controller = null;
    const profile = store.profile();
    el.replaceChildren(
      h('button', { class: 'back', onclick: () => nav('home') }, '← Back'),
      h('h2', {}, 'Choose your opponent'),
      h(
        'div',
        { class: 'ladder' },
        ...OPPONENTS.map((opp, i) => {
          const unlocked = isUnlocked(profile, i);
          const beaten = profile.beaten.includes(i);
          return h(
            'button',
            {
              class: `opp-card${unlocked ? '' : ' locked'}`,
              disabled: !unlocked,
              onclick: () => startMatch(i),
            },
            h('span', { class: 'opp-dot', style: `background:${opp.color}` }),
            h(
              'span',
              { class: 'opp-info' },
              h('strong', {}, opp.name),
              h('small', {}, `${opp.blurb} · first to ${opp.target} · ${DIFFICULTY_LABEL[opp.maxDifficulty]}`),
            ),
            h('span', { class: 'opp-status' }, beaten ? '⭐ Beaten' : unlocked ? 'Play' : '🔒'),
          );
        }),
      ),
    );
  };

  const startMatch = (index: number) => {
    const opp = OPPONENTS[index];
    if (!opp) return;
    controller = new MatchController(el, opp, index, (next) => {
      if (next === 'home') nav('home');
      else if (typeof next === 'number') startMatch(next);
      else showLadder();
    });
  };

  showLadder();
  return { el, destroy: () => controller?.destroy() };
}
