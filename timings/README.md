# Per-sentence audio timings

The player at `book/The_Son_of_God.html` highlights the currently-spoken
sentence and auto-scrolls along with the audio. To do that accurately it
needs a JSON file per audio track giving the **start time of every sentence**
in seconds.

## File layout

```
book/
  audio/
    01_The_Epigraph.mp3
    02_The_Revelation.mp3
    ...
    16_Closing_Credits.mp3
  timings/
    sentences.json          ← source-of-truth sentence list (auto-generated)
    _template.json          ← format example
    01_The_Epigraph.json    ← drop these in, one per audio file
    02_The_Revelation.json
    ...
```

The player reads `timings/<basename>.json` (matching the audio file's basename).
If the file is missing or malformed, **highlighting is disabled for that
section** (auto-scroll still works) — so it's safe to ship before all 17
files exist.

## JSON format

Two equivalent shapes are accepted. Use whichever your tool emits.

### Shape A — array of objects (recommended)

```json
{
  "version": 1,
  "audio": "06_Section_1.mp3",
  "section_id": "section-1",
  "sentences": [
    { "start": 0.42, "end": 4.18, "text": "..." },
    { "start": 4.18, "end": 9.91, "text": "..." }
  ]
}
```

- `start` — seconds from the beginning of the MP3 (required)
- `end` — seconds (optional; the player infers `end` as the next sentence's `start`)
- `text` — optional, only for human verification; the player ignores it

### Shape B — bare array

```json
[
  { "start": 0.42 },
  { "start": 4.18 },
  { "start": 9.91 }
]
```

## Sentence indexing — important

The Nth entry in `sentences[]` corresponds to the **Nth sentence in document
order** within that section's HTML. The player counts sentences exactly the
same way the alignment job needs to: walking each `<p>` in the section and
splitting on `. ! ? ”` boundaries followed by whitespace + a capital letter
or opening quote.

The exact sentence list — already split, in order, per section — lives in
**`book/timings/sentences.json`**. Treat that file as the source of truth
for what counts as "sentence N." If you regenerate it, re-run the alignment.

If your alignment tool gives you fewer entries than the section has, that's
fine — sentences past the last entry simply won't highlight. If it gives you
more, the extras are ignored.

## Recommended pipeline (forced alignment)

Forced alignment is much more reliable than transcription-then-match because
we already have the exact text. Two solid options:

### Option 1 — WhisperX (fast, accurate, GPU-friendly)

```bash
pip install whisperx
# For each audio file:
whisperx audio/06_Section_1.mp3 \
  --model large-v3 \
  --align_model WAV2VEC2_ASR_LARGE_LV60K_960H \
  --language en \
  --output_format json \
  --output_dir whisperx_out/
```

WhisperX emits word-level timestamps. Convert to per-sentence timestamps
by walking the words in order and grouping them by the sentences in
`sentences.json` for that section — when the running word-text matches the
end of sentence N, record that word's `end` time and advance to sentence N+1.

### Option 2 — `aeneas` (pure forced alignment, no transcription)

```bash
pip install aeneas
# Build a plaintext file: one sentence per line, in order
python -m aeneas.tools.execute_task \
  audio/06_Section_1.mp3 \
  sentences_section_1.txt \
  "task_language=eng|is_text_type=plain|os_task_file_format=json" \
  output/06_Section_1.aeneas.json
```

`aeneas` outputs a `fragments` array with `begin` and `end` strings — convert
each fragment to `{ start: parseFloat(begin), end: parseFloat(end) }` and write
the result to `book/timings/06_Section_1.json`.

### Convenience: `align.py`

A reference Python script lives at `book/timings/align.py`. It uses WhisperX
+ word matching against `sentences.json` to emit one timings file per
audio track. Run from the repo root:

```bash
python book/timings/align.py            # all 15 talked sections
python book/timings/align.py section-1  # just one
```

## What about credits / non-spoken-text tracks?

`00_Opening_Credits.mp3` and `16_Closing_Credits.mp3` aren't text-aligned
(they're music + announce). Don't generate timings files for them. The player
already knows not to highlight on those sections.

## Quick sanity check before shipping

1. Open `book/The_Son_of_God.html` in a browser, open devtools.
2. Network tab → play any section that has a timings file → confirm
   `timings/<basename>.json` returns `200`.
3. Watch the page — the highlighted sentence should advance with the voice.
4. If it's a sentence ahead/behind: tighten/loosen the lock by editing
   `DRIFT_TOLERANCE_MS` near the top of `book/book.js` (currently `350`).
