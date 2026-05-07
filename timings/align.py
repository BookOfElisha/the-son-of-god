#!/usr/bin/env python3
"""
align.py — Generate per-sentence timings JSON files for the Son of God audiobook.

Uses WhisperX to get word-level timestamps, then walks the words in order,
matching them against the canonical sentence list in `sentences.json`.
Emits `book/timings/<audio_basename>.json` for each audio track.

Usage (run from repo root):

    pip install whisperx
    python book/timings/align.py                # process all sections
    python book/timings/align.py section-1      # process just one section
    python book/timings/align.py --device cpu   # force CPU (default: cuda if available)

Requires: ffmpeg on PATH; ~3GB RAM (CPU) or a CUDA GPU for the large model.
"""

from __future__ import annotations
import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent  # repo root
TIMINGS_DIR = ROOT / "book" / "timings"
AUDIO_DIR = ROOT / "book" / "audio"
SENTENCES_JSON = TIMINGS_DIR / "sentences.json"


def normalize(s: str) -> str:
    """Lowercase, strip punctuation, collapse whitespace — for matching."""
    s = s.lower()
    s = re.sub(r"[^\w\s']", " ", s)  # keep apostrophes inside contractions
    s = re.sub(r"\s+", " ", s).strip()
    return s


def words_of(text: str) -> list[str]:
    return [w for w in normalize(text).split(" ") if w]


def align_section(section_id: str, section_data: dict, model, align_model, align_meta, device: str) -> dict | None:
    audio_name = section_data["audio"]
    audio_path = AUDIO_DIR / audio_name
    if not audio_path.exists():
        print(f"  [skip] {section_id}: audio missing at {audio_path}")
        return None

    sentences = section_data["sentences"]
    if not sentences:
        print(f"  [skip] {section_id}: no sentences")
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

    # Flatten word list across segments
    words = []
    for seg in result["segments"]:
        for w in seg.get("words", []):
            if "start" not in w or "end" not in w:
                continue
            words.append({"word": w["word"], "start": float(w["start"]), "end": float(w["end"])})
    if not words:
        print(f"  [warn] no word-level timings produced for {section_id}")
        return None

    # Precompute normalized audio words
    audio_words = [normalize(w["word"]) for w in words]
    
    out = []
    wi = 0
    audio_dur = float(words[-1].get("end", 0.0)) if words else 0.0
    
    import difflib
    
    for s_idx, sent in enumerate(sentences):
        target = words_of(sent)
        if not target:
            continue
            
        # Search for this sentence in the next 1000 words of the audio using a sliding window
        best_ratio = 0
        best_start = 0
        best_end = 0
        
        window_size = len(target) + 15
        step = max(2, len(target) // 2)
        
        for offset in range(0, min(150, len(audio_words) - wi), step):
            window = audio_words[wi + offset : wi + offset + window_size]
            if not window:
                break
                
            sm = difflib.SequenceMatcher(None, target, window)
            r = sm.ratio()
            
            if r > best_ratio:
                best_ratio = r
                blocks = [b for b in sm.get_matching_blocks() if b.size >= 2]
                if not blocks and len(target) < 4:
                    blocks = [b for b in sm.get_matching_blocks() if b.size >= 1]
                    
                if blocks:
                    first = blocks[0]
                    last = blocks[-1]
                    s_off = max(0, first.b - first.a)
                    e_off = min(len(window) - 1, last.b + last.size - 1 + (len(target) - (last.a + last.size)))
                    best_start = offset + s_off
                    best_end = offset + e_off
                    
        if best_ratio > 0.4 and best_start <= best_end:
            start_wi = wi + best_start
            end_wi = wi + best_end
            
            # Find closest valid timestamps
            start_t = None
            for i in range(start_wi, min(len(words), start_wi + 5)):
                if "start" in words[i]:
                    start_t = float(words[i]["start"])
                    break
            
            end_t = None
            for i in range(end_wi, max(-1, end_wi - 5), -1):
                if "end" in words[i]:
                    end_t = float(words[i]["end"])
                    break
                    
            if start_t is None: start_t = float(words[wi].get("start", 0.0)) if wi < len(words) else 0.0
            if end_t is None: end_t = start_t
            if end_t < start_t: end_t = start_t
            
            wi = end_wi + 1
        else:
            # Sentence completely missing. Do not advance wi.
            start_t = float(words[wi].get("start", 0.0)) if wi < len(words) else 0.0
            end_t = start_t
            
        out.append({"start": round(start_t, 3), "end": round(end_t, 3), "text": sent})

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
        print(f"Missing {SENTENCES_JSON}. Open the page once to regenerate, or rebuild it.", file=sys.stderr)
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
