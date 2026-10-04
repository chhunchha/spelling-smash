# Spelling Smash 🏓

A table-tennis spelling game for a 4th grader. Listen to the word, type it before the ball
reaches you, win the point. Six opponents, from Rookie Rex to Champion Chen.

Everything runs in the browser. Progress is saved in that browser's localStorage, so there is
no login and no server.

## How it plays

- Each point starts with a spoken word (browser text-to-speech). The ball flies toward you;
  the timer bar is the ball's flight time. Press **↑** to hear the word again, **↓** to hear it
  in a sentence.
- Correct spelling returns the ball. Answering in under 45% of the time is a **SMASH** and is
  harder for the opponent to return. The opponent may miss, which wins you the point.
- A wrong spelling or timeout loses the point. The correct spelling is shown and he types it once.
- Missed words come back sooner (Leitner boxes in `src/engine/srs.ts`).
- Beating an opponent unlocks the next one. Later opponents are faster and use harder words.
  XP gives levels (Ball Boy → Legend) and there is a daily streak.

## Adding words

Open **My Words** and paste a list: one word per line, or separated by commas. To control the
sentence read aloud, write `word | sentence`. Added words appear in every match, at any
difficulty, and are practiced more often. They are stored per browser.

The built-in list lives in `src/data/grade4.json` as `[word, sentence, difficulty 1-3]`.

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
