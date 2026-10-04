import { MAX_BOX, wordKey } from '../engine/srs';
import { store } from '../engine/store';
import { parseCustomWords } from '../engine/words';
import { h } from './dom';
import type { Nav, Screen } from './router';

const stars = (box: number) => '★'.repeat(box) + '☆'.repeat(MAX_BOX - box);

export function wordsScreen(nav: Nav): Screen {
  const el = h('main', { class: 'screen words' });
  const message = h('p', { class: 'muted' });
  const textarea = h('textarea', {
    rows: '4',
    spellcheck: 'false',
    placeholder: 'One word per line or separated by commas.\nOptional sentence: necessary | A coat is necessary in the snow.',
  });
  const list = h('div', { class: 'word-list' });

  const renderList = () => {
    const progress = store.progress();
    const rows = store
      .allWords()
      .sort((a, b) => Number(!!b.custom) - Number(!!a.custom) || a.word.localeCompare(b.word))
      .map((w) => {
        const p = progress[wordKey(w)];
        return h(
          'div',
          { class: 'word-row' },
          h('span', { class: 'w' }, w.word, w.custom ? h('em', {}, ' (added)') : null),
          h('span', { class: 'stars' }, stars(p?.box ?? 0)),
          w.custom
            ? h(
                'button',
                {
                  class: 'link',
                  onclick: () => {
                    store.removeCustomWord(w.word);
                    renderList();
                  },
                },
                'remove',
              )
            : h('span', {}),
        );
      });
    list.replaceChildren(...rows);
  };

  const add = () => {
    const { words, rejected } = parseCustomWords(textarea.value);
    const { added, skipped } = store.addCustomWords(words);
    const parts = [`Added ${added} word${added === 1 ? '' : 's'}.`];
    if (skipped) parts.push(`${skipped} already in the list.`);
    if (rejected.length) parts.push(`Skipped (letters only): ${rejected.join(', ')}.`);
    message.textContent = parts.join(' ');
    if (added) textarea.value = '';
    renderList();
  };

  el.append(
    h('button', { class: 'back', onclick: () => nav('home') }, '← Back'),
    h('h2', {}, 'My Words'),
    h('p', { class: 'muted' }, 'Add this week’s school words. They show up in every match and get extra practice.'),
    textarea,
    h('button', { class: 'btn', onclick: add }, 'Add words'),
    message,
    h('h3', {}, 'All words'),
    h('p', { class: 'muted' }, '★ shows how well he knows each word: 0 stars is new, 5 stars is mastered.'),
    list,
    h(
      'button',
      {
        class: 'link danger',
        onclick: () => {
          if (confirm('Erase all progress, added words, and wins?')) {
            store.resetAll();
            nav('home');
          }
        },
      },
      'Reset everything',
    ),
  );
  renderList();
  return { el };
}
