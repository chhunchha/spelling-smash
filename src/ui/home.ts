import { levelFromXp } from '../engine/profile';
import { store } from '../engine/store';
import { h } from './dom';
import type { Nav, Screen } from './router';

export function homeScreen(nav: Nav): Screen {
  const p = store.profile();
  const lvl = levelFromXp(p.xp);
  const pct = Math.round((lvl.into / lvl.needed) * 100);
  const el = h(
    'main',
    { class: 'screen home' },
    h('div', { class: 'logo' }, '🏓'),
    h('h1', {}, 'Spelling Smash'),
    h('p', { class: 'tagline' }, 'Spell the word. Return the ball. Beat the champion!'),
    h(
      'section',
      { class: 'card player-card' },
      h('div', { class: 'level-title' }, `Level ${lvl.level} · ${lvl.title}`),
      h('div', { class: 'bar' }, h('div', { class: 'bar-fill', style: `width:${pct}%` })),
      h('div', { class: 'muted' }, `${lvl.into} / ${lvl.needed} XP to next level`),
      h(
        'div',
        { class: 'stats' },
        h('span', {}, `🔥 ${p.streak} day streak`),
        h('span', {}, `🏆 ${p.wins} wins`),
        h('span', {}, `⚡ best rally ${p.bestRally}`),
      ),
    ),
    h('button', { class: 'btn big', onclick: () => nav('play') }, 'Play a Match'),
    h('button', { class: 'btn secondary', onclick: () => nav('words') }, 'My Words'),
  );
  return { el };
}
