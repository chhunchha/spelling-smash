import { PACKS, mastery, wordsToUnlock } from '../engine/packs';
import { levelFromXp } from '../engine/profile';
import { store } from '../engine/store';
import { h } from './dom';
import type { Nav, Screen } from './router';

export function homeScreen(nav: Nav): Screen {
  store.refreshUnlocks(); // e.g. after restoring a backup or an update that adds packs
  const p = store.profile();
  const lvl = levelFromXp(p.xp);
  const pct = Math.round((lvl.into / lvl.needed) * 100);
  const progress = store.progress();
  const packCards = PACKS.map((pack) => {
    const unlocked = p.unlockedPacks.includes(pack.id);
    if (!unlocked) {
      const need = wordsToUnlock(pack, progress);
      const req = PACKS.find((r) => r.id === pack.requires?.pack);
      return h(
        'div',
        { class: 'pack locked' },
        h('span', { class: 'pack-emoji' }, '🔒'),
        h(
          'span',
          { class: 'pack-info' },
          h('strong', {}, pack.name),
          h('small', {}, `Master ${need} more ${req?.name ?? ''} word${need === 1 ? '' : 's'} to unlock`),
        ),
      );
    }
    const m = mastery(pack, progress);
    return h(
      'div',
      { class: 'pack' },
      h('span', { class: 'pack-emoji' }, pack.emoji),
      h(
        'span',
        { class: 'pack-info' },
        h('strong', {}, pack.name),
        h('div', { class: 'bar small' }, h('div', { class: 'bar-fill', style: `width:${Math.round((m.mastered / m.total) * 100)}%` })),
        h('small', {}, `${m.mastered} of ${m.total} mastered`),
      ),
    );
  });
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
    h('section', { class: 'card packs' }, h('div', { class: 'level-title' }, 'Word packs'), ...packCards),
  );
  return { el };
}
