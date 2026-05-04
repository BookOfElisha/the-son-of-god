#!/usr/bin/env python3
"""
align.py — Per-sentence audiobook timings using WhisperX.

v3 strategy: instead of one greedy pass, we do constrained search.
For each sentence, we find its anchor (the audio-word index where it begins)
inside a window biased toward the proportional position the sentence "should"
start at, then advance through the sentence's words with a small per-step lookahead.
This prevents the cursor from running away to the end of the audio when a few
sentences are missed in a row.

Usage (run from repo root):

    pip install whisperx
    python book/timings/align.py
    python book/timings/align.py section-1
    python book/timings/align.py --device cpu
"""

from __future__ import annotations
import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
TIMINGS_DIR = ROOT / "book" / "timings"
AUDIO_DIR = ROOT / "book" / "audio"
SENTENCES_JSON = TIMINGS_DIR / "sentences.json"


def normalize(s: str) -> str:
    s = s.lower()
    s = re.sub(r"[^a-z0-9'\s]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def words_of(text: str) -> list[str]:
    return [w for w in normalize(text).split(" ") if w]


def fuzzy_eq(a: str, b: str) -> bool:
    if not a or not b:
        return False
    if a == b:
        return True
    if len(a) >= 4 and len(b) >= 4:
        if a.startswith(b) or b.startswith(a):
            return True
    if abs(len(a) - len(b)) <= 1 and (len(a) >= 4 or len(b) >= 4):
        if len(a) == len(b):
            diffs = sum(1 for x, y in zip(a, b) if x != y)
            if diffs <= 1:
                return True
        else:
            longer, shorter = (a, b) if len(a) > len(b) else (b, a)
            for i in range(len(longer)):
                if longer[:i] + longer[i+1:] == shorter:
                    return True
    return False


def score_anchor(words: list[dict], idx: int, target: list[str], lookahead: int = 6) -> int:
    """Score how well words[idx:idx+lookahead] match target[:lookahead].
    Returns count of matched words."""
    score = 0
    n = min(lookahead, len(target), len(words) - idx)
    for k in range(n):
        if fuzzy_eq(normalize(words[idx + k]["word"]), target[k]):
            score += 1
    return score


def find_anchor(words: list[dict], target: list[str], cursor: int,
                expected_idx: int, search_radius: int) -> int:
    """Find the best audio-word index to anchor `target` at.

    Searches a window around expected_idx (the proportional position),
    starting no earlier than `cursor`. Picks the index with the highest
    score on target[:6]. Falls back to expected_idx if nothing scores.
    """
    if not target:
        return cursor
    lo = max(cursor, expected_idx - search_radius)
    hi = min(len(words), expected_idx + search_radius)
    if lo >= hi:
        return min(cursor, len(words) - 1)

    best_idx = -1
    best_score = 0
    # Require at least 2 of the first 6 target words to match — that's
    # strong enough to anchor in a transcript with substitutions.
    for i in range(lo, hi):
        score = score_anchor(words, i, target, lookahead=6)
        if score > best_score:
            best_score = score
            best_idx = i
            if score >= 5:  # near-perfect match, stop early
                break

    if best_score >= 2:
        return best_idx
    # Weak/no match — return proportional position as best guess.
    return min(max(cursor, expected_idx), len(words) - 1)


def walk_sentence(words: list[dict], target: list[str], anchor: int,
                  per_word_lookahead: int = 12) -> tuple[float, float, int]:
    """Walk through target words starting at anchor. Returns (start_t, end_t, last_audio_idx)."""
    start_t = float(words[anchor]["start"])
    end_t = start_t
    cursor = anchor
    last_matched = anchor
    for ti in range(len(target)):
        # Find this target word within a small window from cursor.
        best_idx = -1
        end = min(len(words), cursor + per_word_lookahead)
        for i in range(cursor, end):
            if fuzzy_eq(normalize(words[i]["word"]), target[ti]):
                best_idx = i
                break
        if best_idx >= 0:
            last_matched = best_idx
            end_t = float(words[best_idx]["end"])
            cursor = best_idx + 1
        else:
            cursor = min(cursor + 1, len(words))
    return start_t, max(end_t, start_t + 0.1), last_matched


def align_section(section_id: str, section_data: dict, model, align_model, align_meta, device: str) -> dict | None:
    audio_name = section_data["audio"]
    audio_path = AUDIO_DIR / audio_name
    if not audio_path.exists():
        print(f"  [skip] {section_id}: audio missing at {audio_path}")
        return None

    sentences = section_data["sentences"]
    if not sentences:
        return None

    import whisperx
    print(f"  transcribing {audio_name}…")
    audio = whisperx.load_audio(str(audio_path))
    result = model.transcribe(audio, batch_size=8, language="en")
    print(f"  aligning words…")
    result = whisperx.align(
        result["segments"], align_model, align_meta, audio, device,
        return_char_alignments=False,
    )

    words = []
    for seg in result["segments"]:
        for w in seg.get("words", []):
            if "start" not in w or "end" not in w:
                continue
            words.append({"word": w["word"], "start": float(w["start"]), "end": float(w["end"])})
    if not words:
        return None

    audio_dur = float(words[-1]["end"])
    total_audio_words = len(words)
    total_target_words = sum(len(words_of(s)) for s in sentences if s)

    print(f"  audio words: {total_audio_words}  target words: {total_target_words}  dur: {audio_dur:.1f}s")

    out = []
    cursor = 0           # earliest word index we'll search from
    target_word_offset = 0

    for s_idx, sent in enumerate(sentences):
        target = words_of(sent)
        if not target:
            continue

        # Where SHOULD this sentence start in the audio, proportionally?
        if total_target_words > 0:
            expected_idx = int(total_audio_words * (target_word_offset / total_target_words))
        else:
            expected_idx = cursor

        # Search radius: ±15% of total audio length, but at least 80 words.
        search_radius = max(80, int(total_audio_words * 0.15))

        anchor = find_anchor(words, target, cursor, expected_idx, search_radius)
        start_t, end_t, last_matched = walk_sentence(words, target, anchor)

        out.append({
            "start": round(start_t, 3),
            "end": round(end_t, 3),
            "text": sent,
        })

        # Advance cursor — but only modestly, so the next sentence can search backward
        # too if needed. Move cursor to roughly halfway between last_matched and end of target.
        cursor = min(last_matched + 1, len(words))
        target_word_offset += len(target)

    return {
        "version": 1,
        "audio": audio_name,
        "section_id": section_id,
        "sentence_count": len(out),
        "duration": round(audio_dur, 3),
        "sentences": out,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("section_ids", nargs="*", help="Section ids to process; default: all")
    ap.add_argument("--device", default=None, help="cuda or cpu (default: auto)")
    ap.add_argument("--model", default="large-v3", help="Whisper model name")
    args = ap.parse_args()

    if not SENTENCES_JSON.exists():
        print(f"Missing {SENTENCES_JSON}.", file=sys.stderr)
        sys.exit(1)

    data = json.loads(SENTENCES_JSON.read_text())
    sections = data["sections"]

    targets = args.section_ids or list(sections.keys())
    missing = [s for s in targets if s not in sections]
    if missing:
        print(f"Unknown sections: {missing}", file=sys.stderr)
        sys.exit(1)

    import torch
    import whisperx
    device = args.device or ("cuda" if torch.cuda.is_available() else "cpu")
    compute_type = "float16" if device == "cuda" else "int8"
    print(f"Loading whisper {args.model} on {device}…")
    model = whisperx.load_model(args.model, device, compute_type=compute_type, language="en")
    print("Loading alignment model…")
    align_model, align_meta = whisperx.load_align_model(language_code="en", device=device)

    for sid in targets:
        print(f"\n=== {sid} ===")
        result = align_section(sid, sections[sid], model, align_model, align_meta, device)
        if not result:
            continue
        out_path = TIMINGS_DIR / sections[sid]["timings_file"]
        out_path.write_text(json.dumps(result, indent=2))
        print(f"  wrote {out_path.relative_to(ROOT)} ({result['sentence_count']} sentences)")

    print("\nDone.")


if __name__ == "__main__":
    main()
