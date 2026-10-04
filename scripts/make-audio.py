#!/usr/bin/env python3
"""Generate spoken audio for every built-in word with the Kokoro neural voice.

For each word this writes three mp3 files under public/audio/:
  words/<word>.mp3      the word at a clear pace
  slow/<word>.mp3       the word more slowly (used when he asks to hear it again)
  sentences/<word>.mp3  the example sentence

Existing files are skipped, so after adding a pack just run it again.

Setup (one time, needs Python 3.12 or older and ffmpeg):
  python3.12 -m venv .venv-tts && .venv-tts/bin/pip install kokoro-onnx soundfile
  Download kokoro-v1.0.onnx and voices-v1.0.bin from
  https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0
  into a folder (pass it with --models).

Run:
  .venv-tts/bin/python scripts/make-audio.py --models ~/tts-models
"""
import argparse
import json
import subprocess
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

ROOT = Path(__file__).resolve().parent.parent
VOICE = "af_heart"
LEAD_SECONDS = 0.18  # silence first, so a device that is still waking up doesn't clip the word
TAIL_SECONDS = 0.12
VARIANTS = {
    "words": ("{word}.", 0.85),
    "slow": ("{word}.", 0.6),
    "sentences": ("{sentence}", 0.92),
}


def load_entries() -> list[tuple[str, str]]:
    entries: list[tuple[str, str]] = []
    seen: set[str] = set()
    for path in sorted((ROOT / "src" / "data").glob("*.json")):
        for word, sentence, _difficulty in json.loads(path.read_text()):
            if word not in seen:
                seen.add(word)
                entries.append((word, sentence))
    return entries


def write_mp3(samples: np.ndarray, sample_rate: int, out: Path) -> None:
    peak = float(np.max(np.abs(samples))) or 1.0
    samples = samples / peak * 0.9
    pad_lead = np.zeros(int(sample_rate * LEAD_SECONDS), dtype=samples.dtype)
    pad_tail = np.zeros(int(sample_rate * TAIL_SECONDS), dtype=samples.dtype)
    audio = np.concatenate([pad_lead, samples, pad_tail])
    with tempfile.TemporaryDirectory() as tmp:
        wav = Path(tmp) / "clip.wav"
        sf.write(wav, audio, sample_rate)
        out.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav), "-ac", "1", "-b:a", "48k", str(out)],
            check=True,
        )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--models", type=Path, required=True, help="folder with kokoro-v1.0.onnx and voices-v1.0.bin")
    parser.add_argument("--force", action="store_true", help="regenerate files that already exist")
    args = parser.parse_args()

    kokoro = Kokoro(str(args.models / "kokoro-v1.0.onnx"), str(args.models / "voices-v1.0.bin"))
    entries = load_entries()
    made = 0
    for i, (word, sentence) in enumerate(entries, 1):
        for folder, (template, speed) in VARIANTS.items():
            out = ROOT / "public" / "audio" / folder / f"{word}.mp3"
            if out.exists() and not args.force:
                continue
            text = template.format(word=word, sentence=sentence)
            samples, rate = kokoro.create(text, voice=VOICE, speed=speed, lang="en-us")
            write_mp3(samples, rate, out)
            made += 1
        if i % 20 == 0:
            print(f"{i}/{len(entries)} words done", flush=True)
    print(f"done: {made} files written for {len(entries)} words")


if __name__ == "__main__":
    main()
