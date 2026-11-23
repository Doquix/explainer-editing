"""Prepare one segment for editing.

Reads the worker's editing-inputs/<job_id>/ folder (manifest.json, script-NN.txt,
original VO MP3), then writes a self-contained job folder:

  <out>/job.json          identity: card, job, segment, source paths, SHA-256 of VO
  <out>/script.txt        exact approved script (never edited)
  <out>/original-vo.mp3   untouched copy of the generated VO
  <out>/narration.wav     tightened editing copy (long pauses shortened)
  <out>/audio-edits.json  removed and kept intervals, original-to-edited map
  <out>/timing.json       script words with start/end seconds on narration.wav

Rules carried over from EDITING-WORKFLOW.md: never change speed, never rewrite
or regenerate narration, keep natural pauses, record every cut.

Usage:
  python prepare.py --input <editing-inputs/JOB> --segment 2 --out <jobs/JOB/seg-02>
"""
from __future__ import annotations

import argparse
import difflib
import hashlib
import json
import pathlib
import re
import shutil
import subprocess
import sys
import wave

import numpy as np

THRESHOLD_DB = -38
MIN_PAUSE = 0.45     # pauses longer than this get tightened
KEEP_BEFORE = 0.12   # silence kept after the last word
KEEP_AFTER = 0.16    # silence kept before the next word (0.28 s total, same as segment 17)
FADE = 0.004


def sha256(path: pathlib.Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def run(cmd: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, capture_output=True, text=True, check=True)


def silences(path: pathlib.Path, min_len: float) -> list[tuple[float, float]]:
    out = run(['ffmpeg', '-hide_banner', '-i', str(path), '-af', f'silencedetect=noise={THRESHOLD_DB}dB:d={min_len}', '-f', 'null', '-']).stderr
    starts = [float(s) for s in re.findall(r'silence_start: (-?[\d.]+)', out)]
    ends = [float(s) for s in re.findall(r'silence_end: ([\d.]+)', out)]
    return list(zip(starts, ends))


def tighten(source_wav: pathlib.Path, dest_wav: pathlib.Path) -> dict:
    with wave.open(str(source_wav), 'rb') as f:
        params = f.getparams()
        if params.sampwidth != 2:
            raise SystemExit('Expected 16-bit PCM after decoding.')
        samples = np.frombuffer(f.readframes(f.getnframes()), dtype=np.int16).reshape(-1, params.nchannels).copy()
    rate = params.framerate
    cuts = []
    for a, b in silences(source_wav, 0.25):
        if b - a >= MIN_PAUSE:
            lo, hi = round((max(a, 0) + KEEP_BEFORE) * rate), round((b - KEEP_AFTER) * rate)
            if hi > lo:
                cuts.append((lo, hi))
    kept, mapping, cursor, at = [], [], 0, 0
    fade = round(rate * FADE)
    for lo, hi in cuts + [(len(samples), len(samples))]:
        if lo > cursor:
            chunk = samples[cursor:lo].astype(np.float32)
            n = min(fade, len(chunk) // 2)
            # Tiny edge fades sit inside retained silence, so no speech is touched.
            if cursor > 0 and n:
                chunk[:n] *= np.linspace(0, 1, n)[:, None]
            if hi < len(samples) and n:
                chunk[-n:] *= np.linspace(1, 0, n)[:, None]
            kept.append(chunk.astype(np.int16))
            mapping.append({'original_start': cursor / rate, 'original_end': lo / rate,
                            'edited_start': at / rate, 'edited_end': (at + len(chunk)) / rate})
            at += len(chunk)
        cursor = hi
    audio = np.concatenate(kept) if kept else samples
    with wave.open(str(dest_wav), 'wb') as f:
        f.setparams(params)
        f.writeframes(audio.tobytes())
    return {
        'method': 'Energy based pause tightening; no speed change, wording change, or new TTS generation.',
        'threshold_db': THRESHOLD_DB, 'minimum_pause_seconds': MIN_PAUSE,
        'retained_pause_seconds': KEEP_BEFORE + KEEP_AFTER,
        'original_duration': len(samples) / rate, 'edited_duration': len(audio) / rate,
        'removed_seconds': (len(samples) - len(audio)) / rate,
        'removed_intervals': [{'start': a / rate, 'end': b / rate} for a, b in cuts],
        'kept_intervals': mapping,
    }


def script_words(text: str) -> list[str]:
    return text.split()


def norm(word: str) -> str:
    return re.sub(r"[^a-z0-9]", '', word.lower().replace('’', "'"))


def align_whisper(wav: pathlib.Path, words: list[str], model_name: str) -> tuple[list[dict], float]:
    """Transcribe with word timestamps, then map onto the approved script words.
    Script spelling always wins; only the times come from the transcript."""
    from faster_whisper import WhisperModel  # optional dependency
    model = WhisperModel(model_name, device='cpu', compute_type='int8')
    segments, _ = model.transcribe(str(wav), word_timestamps=True, language='en')
    heard = [w for s in segments for w in (s.words or [])]
    a = [norm(w) for w in words]
    b = [norm(w.word) for w in heard]
    times: list[tuple[float, float] | None] = [None] * len(words)
    matched = 0
    for block in difflib.SequenceMatcher(a=a, b=b, autojunk=False).get_matching_blocks():
        for k in range(block.size):
            h = heard[block.b + k]
            times[block.a + k] = (h.start, h.end)
            matched += 1
    # Unmatched script words (numbers, names) get times interpolated between neighbours.
    known = [i for i, t in enumerate(times) if t]
    for i, t in enumerate(times):
        if t:
            continue
        prev = max((k for k in known if k < i), default=None)
        nxt = min((k for k in known if k > i), default=None)
        start = times[prev][1] if prev is not None else 0.0
        end = times[nxt][0] if nxt is not None else start + 0.4
        span = (nxt if nxt is not None else len(words)) - (prev if prev is not None else -1)
        pos = i - (prev if prev is not None else -1)
        s = start + (end - start) * (pos - 1) / span
        times[i] = (s, s + (end - start) / span)
    out = [{'word': w, 'start': round(t[0], 3), 'end': round(t[1], 3)} for w, t in zip(words, times)]
    return out, matched / max(1, len(words))


def align_estimated(wav: pathlib.Path, words: list[str], duration: float) -> list[dict]:
    """Fallback when no speech model is available: spread words over the detected
    speech regions in proportion to their length. Good enough to plan beats;
    NOT accurate enough for burned in captions."""
    gaps = [(max(0.0, a), b) for a, b in silences(wav, 0.15)]
    regions, cursor = [], 0.0
    for a, b in gaps:
        if a > cursor:
            regions.append((cursor, a))
        cursor = max(cursor, b)
    if cursor < duration:
        regions.append((cursor, duration))
    weights = [len(norm(w)) + 2 for w in words]
    total_w, total_t = sum(weights), sum(b - a for a, b in regions)
    out, acc = [], 0.0
    for w, wt in zip(words, weights):
        start_t, end_t = acc, acc + total_t * wt / total_w
        acc = end_t
        out.append({'word': w, 'start': round(to_clock(start_t, regions), 3), 'end': round(to_clock(end_t, regions), 3)})
    return out


def to_clock(t: float, regions: list[tuple[float, float]]) -> float:
    for a, b in regions:
        if t <= b - a:
            return a + t
        t -= b - a
    return regions[-1][1] if regions else t


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--input', required=True, type=pathlib.Path, help='editing-inputs/<job_id> folder from the worker')
    ap.add_argument('--segment', required=True, type=int)
    ap.add_argument('--out', required=True, type=pathlib.Path)
    ap.add_argument('--align', choices=['auto', 'whisper', 'estimate'], default='auto')
    ap.add_argument('--model', default='base.en', help='faster-whisper model name')
    ap.add_argument('--no-tighten', action='store_true')
    args = ap.parse_args()

    manifest = json.loads((args.input / 'manifest.json').read_text(encoding='utf-8'))
    entry = next((s for s in manifest['segments'] if s['segment'] == args.segment), None)
    if not entry:
        raise SystemExit(f'Segment {args.segment} not in manifest.')
    vo = args.input / entry['expected_audio']
    script = args.input / entry['script']
    for p in (vo, script):
        if not p.exists():
            raise SystemExit(f'Missing input: {p}')

    out = args.out
    out.mkdir(parents=True, exist_ok=True)
    vo_hash = sha256(vo)
    job_path = out / 'job.json'
    if job_path.exists():
        previous = json.loads(job_path.read_text(encoding='utf-8'))
        if previous.get('vo_sha256') != vo_hash:
            raise SystemExit('This job folder was prepared from different VO bytes. Use a new --out folder; originals are never overwritten.')

    shutil.copyfile(vo, out / 'original-vo.mp3')
    shutil.copyfile(script, out / 'script.txt')
    decoded = out / '.decoded.wav'
    run(['ffmpeg', '-y', '-v', 'error', '-i', str(vo), '-ac', '1', '-ar', '48000', '-c:a', 'pcm_s16le', str(decoded)])
    if args.no_tighten:
        shutil.copyfile(decoded, out / 'narration.wav')
        with wave.open(str(decoded)) as f:
            d = f.getnframes() / f.getframerate()
        edits = {'method': 'No tightening requested.', 'original_duration': d, 'edited_duration': d, 'removed_seconds': 0,
                 'removed_intervals': [], 'kept_intervals': [{'original_start': 0, 'original_end': d, 'edited_start': 0, 'edited_end': d}]}
    else:
        edits = tighten(decoded, out / 'narration.wav')
    decoded.unlink()
    (out / 'audio-edits.json').write_text(json.dumps(edits, indent=2), encoding='utf-8')

    words = script_words(script.read_text(encoding='utf-8'))
    method, match = 'estimate', None
    if args.align in ('auto', 'whisper'):
        try:
            timed, match = align_whisper(out / 'narration.wav', words, args.model)
            method = f'faster-whisper {args.model}'
        except Exception as exc:  # model missing or offline
            if args.align == 'whisper':
                raise
            print(f'Whisper alignment unavailable ({exc.__class__.__name__}); using estimated timings.', file=sys.stderr)
    if method == 'estimate':
        timed = align_estimated(out / 'narration.wav', words, edits['edited_duration'])
    (out / 'timing.json').write_text(json.dumps({'method': method, 'script_match': match, 'words': timed}, indent=1), encoding='utf-8')

    job = {
        'card_id': manifest.get('card_id'), 'job_id': manifest.get('job_id'), 'topic': manifest.get('topic'),
        'segment': args.segment, 'segment_count': len(manifest['segments']),
        'source_vo': str(vo), 'source_script': str(script), 'vo_sha256': vo_hash,
        'stages': {'prepare': {'alignment': method, 'script_match': match, 'removed_seconds': round(edits['removed_seconds'], 3)}},
    }
    if job_path.exists():
        prev = json.loads(job_path.read_text(encoding='utf-8'))
        prev['stages'].update(job['stages'])
        job = {**prev, 'stages': prev['stages']}
    job_path.write_text(json.dumps(job, indent=2), encoding='utf-8')
    print(json.dumps({'segment': args.segment, 'words': len(words), 'alignment': method,
                      'original_s': round(edits['original_duration'], 2), 'edited_s': round(edits['edited_duration'], 2),
                      'removed_pauses': len(edits['removed_intervals'])}))


if __name__ == '__main__':
    main()
