import { TIME_OPTIONS } from '../engine/match';
import { MASTERED_BOX } from '../engine/packs';
import { MAX_BOX, wordKey } from '../engine/srs';
import { chooseBrowserVoice, listVoices, onVoicesChanged, speakWithBrowser } from '../engine/speech';
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
      .activeWords()
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
    h(
      'p',
      { class: 'muted' },
      `★ shows how well he knows each word: 0 stars is new. ${MASTERED_BOX} or more stars counts as mastered. Words from locked packs appear once unlocked.`,
    ),
    list,
    backupSection(nav, message),
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

/** Parent tools: back up or restore all progress, and unlock every pack early. */
function backupSection(nav: Nav, message: HTMLElement): HTMLElement {
  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', class: 'hidden' });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    if (!confirm('Replace all progress and added words with this backup?')) {
      fileInput.value = '';
      return;
    }
    if (store.importJson(await file.text())) nav('home');
    else message.textContent = 'That file is not a Spelling Smash backup.';
    fileInput.value = '';
  });
  return h(
    'section',
    { class: 'backup' },
    h('h3', {}, 'Parent tools'),
    h(
      'p',
      { class: 'muted' },
      'Progress is saved in this browser only. Download a backup to keep it safe or move it to another computer.',
    ),
    h(
      'div',
      { class: 'row left' },
      h('button', { class: 'btn small', onclick: downloadBackup }, 'Download backup'),
      h('button', { class: 'btn small', onclick: () => fileInput.click() }, 'Restore from backup'),
      h(
        'button',
        {
          class: 'btn small',
          onclick: () => {
            store.unlockAllPacks();
            nav('home');
          },
        },
        'Unlock all word packs',
      ),
    ),
    fileInput,
    timePicker(),
    voicePicker(),
  );
}

/** How long he gets to type each word. Slower typists need more; the ball just flies slower. */
function timePicker(): HTMLElement {
  const select = h(
    'select',
    { class: 'voice-select', 'aria-label': 'Typing time' },
    ...TIME_OPTIONS.map((o) =>
      h('option', { value: String(o.value), selected: o.value === store.settings().timeMultiplier }, `${o.label} (×${o.value})`),
    ),
  );
  select.addEventListener('change', () => store.updateSettings({ timeMultiplier: Number(select.value) }));
  return h(
    'div',
    { class: 'voice-picker' },
    h('p', { class: 'muted' }, 'Typing time: how long he gets to spell each word. Raise it if he needs longer to find the keys.'),
    select,
  );
}

/** Words you add are spoken by the browser's voice (built-in words use recordings), so let a parent pick the clearest one. */
function voicePicker(): HTMLElement {
  const select = h('select', { class: 'voice-select', 'aria-label': 'Voice for added words' });
  const fill = () => {
    const voices = listVoices();
    select.replaceChildren(...voices.map((v) => h('option', { value: v.uri, selected: v.selected }, v.label)));
  };
  select.addEventListener('change', () => chooseBrowserVoice(select.value));
  fill();
  onVoicesChanged(fill);
  return h(
    'div',
    { class: 'voice-picker' },
    h('p', { class: 'muted' }, 'Voice for words you add (built-in words use recordings). Pick the one that is easiest to understand:'),
    h(
      'div',
      { class: 'row left' },
      select,
      h('button', { class: 'btn small', onclick: () => speakWithBrowser('necessary') }, '▶ Test'),
    ),
  );
}

function downloadBackup(): void {
  const url = URL.createObjectURL(new Blob([store.exportJson()], { type: 'application/json' }));
  const a = h('a', { href: url, download: `spelling-smash-backup-${new Date().toISOString().slice(0, 10)}.json` });
  a.click();
  URL.revokeObjectURL(url);
}
