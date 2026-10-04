# Spelling Smash 🏓

A table-tennis spelling game for a 4th grader. Listen to the word, type it before the ball
reaches you, win the point. Six opponents, from Rookie Rex to Champion Chen.

Everything runs in the browser. Progress is saved in that browser's localStorage, so there is
no login and no server.

## How it plays

- Each point starts with a spoken word (recorded clips). The ball flies toward you;
  the timer bar is the ball's flight time. Press **↑** to hear it again, slower, **↓** to hear it
  in a sentence.
- Correct spelling returns the ball. Answering in under 45% of the time is a **SMASH** and is
  harder for the opponent to return. The opponent may miss, which wins you the point.
- A wrong spelling or timeout loses the point. The correct spelling is shown and he types it once.
- Missed words come back sooner (Leitner boxes in `src/engine/srs.ts`).
- Beating an opponent unlocks the next one. Later opponents are faster and use harder words.
  XP gives levels (Ball Boy → Legend) and there is a daily streak.

## Spoken words

Browser text-to-speech varies a lot by device and was hard to understand, so every built-in
word has recorded clips in `public/audio/` made with the Kokoro neural voice (`af_heart`):
`words/` (normal pace), `slow/` (played when he asks to hear it again), and `sentences/`.
Words added in My Words have no clips and use the browser voice; **My Words → Parent tools**
lets you pick the clearest browser voice.

After adding words or a pack to `src/data/`, generate the missing clips and commit them:

```bash
python3.12 -m venv .venv-tts && .venv-tts/bin/pip install kokoro-onnx soundfile   # one time; also needs ffmpeg
# download kokoro-v1.0.onnx and voices-v1.0.bin (kokoro-onnx model-files-v1.0 release) into ~/tts-models
.venv-tts/bin/python scripts/make-audio.py --models ~/tts-models
```

## Word packs

Words are grouped into packs in `src/engine/packs.ts`, each backed by a JSON file in `src/data/`
as `[word, sentence, difficulty 1-3]`. Grade 4 is open from the start. Grade 5 unlocks when 70% of
Grade 4 is mastered, and Sports & Games when 30% is. Once unlocked, a pack stays unlocked.

A word is **mastered** at Leitner box 4 or higher. A correct answer only moves a word up a box when
the word is due, so repeating a word the same day doesn't count. That takes roughly a week of
practice per word.

To add a pack: drop a JSON file in `src/data/`, add an entry to `PACKS` with a `requires` rule,
and keep words unique across all packs (a test checks this).

## Adding words

Open **My Words** and paste a list: one word per line, or separated by commas. To control the
sentence read aloud, write `word | sentence`. Added words appear in every match, at any
difficulty, and are practiced more often. They are stored per browser.

**My Words → Parent tools** can download a backup of all progress and added words, restore it on
another computer, or unlock every pack early.

## Develop

```bash
npm install
npm run dev     # http://localhost:5173
npm test        # engine unit tests
npm run build   # type-check + production build into dist/
```

## Deploy

Pushes to `main` build and deploy to GitHub Pages via `.github/workflows/deploy.yml`.

## Layout

- `src/engine/` – word picking, spaced repetition, match rules, profile and save data (pure, tested)
- `src/game/` – canvas scene and the match controller
- `src/ui/` – home, opponent ladder, My Words
