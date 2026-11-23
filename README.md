# explainer-editing

The render stage of an automated YouTube explainer pipeline. It takes the numbered voiceover and approved script that the n8n + Codex worker already produces and turns each segment into a finished 1920×1080 MP4:

```
editing-inputs/<job>/  ──prepare──▶  tightened VO + word timings
                       ──plan─────▶  plan.json (beats anchored to words) + assets.json (what each shot needs)
   you add assets/     ──build────▶  edl.json (frame accurate edit decision list) + SRT
                       ──render───▶  Remotion MP4, mastered to −14 LUFS
                       ──verify───▶  verification.json (technical checks only)
```

Built with AI coding agents (Claude Code), directed by Luke Akaiza. The pipeline design, creative rules and review decisions are his; see `docs/`.

## Why it exists

The first Doctor Doom segment was edited by hand in Remotion: file paths, beat times and graphics were hardcoded for that one segment, so seven segments stayed unedited. This repo replaces that with **one generic composition driven by data**. A new segment needs a plan and its assets, not new code.

## What is automated and what is not

| Step | Status |
|---|---|
| VO intake from the worker's `editing-inputs` folder | ✅ automatic |
| Pause tightening (no speed change, no regeneration, full edit map kept) | ✅ automatic |
| Word timings | ✅ faster-whisper when installed; otherwise *estimated* (fine for planning, not for captions) |
| Beat plan and asset request list | ✅ drafted automatically, **meant to be edited** |
| Finding images and clips | ❌ human: the planner says what each shot needs and gives search hints. Missing assets render as loud red placeholders and block a final render |
| Rendering, loudness mastering, SRT | ✅ automatic |
| Technical verification | ✅ automatic. Passing is **not** editorial approval |
| Moving the Trello card to Ready to Schedule | ❌ stays manual (Luke reviews every segment) |

## Requirements

Node 20+, Python 3.10+ with `numpy`, FFmpeg/FFprobe on PATH. Optional: `pip install faster-whisper` for accurate word timings.

```powershell
npm ci
pip install numpy faster-whisper
```

Remotion downloads its own headless Chrome on first render. To reuse one you already have:

```powershell
$env:REMOTION_BROWSER_EXECUTABLE = "C:\path\to\chrome-headless-shell.exe"
```

## Usage

```powershell
$in  = "C:\path\to\pipeline\editing-inputs\<job_id>"
$job = "jobs\<job_id>\seg-02"

node cli/explainer.mjs prepare --input $in --segment 2 --out $job
node cli/explainer.mjs plan    $job          # writes plan.json + assets.json (keeps your edits unless --force)
node cli/explainer.mjs assets  $job          # lists missing shots with search hints
#   put files in $job\assets\ named b01.jpg, b02.mp4 ... and fill source_url / rights in assets.json
node cli/explainer.mjs review  $job          # one still per beat → out/review-sheet.jpg
node cli/explainer.mjs render  $job          # add --draft to render with placeholders
node cli/explainer.mjs verify  $job
```

Or everything in one go (stops at the asset step if shots are missing):

```powershell
node cli/explainer.mjs run --input $in --segment 2 --out $job
```

`npm run studio` opens Remotion Studio for live previewing.

## Job folder

```
seg-02/
  job.json          card, job, segment, VO SHA-256, stage history
  script.txt        approved script, never edited
  original-vo.mp3   untouched copy
  narration.wav     tightened editing copy
  audio-edits.json  every removed pause, original→edited time map
  timing.json       script words with start/end seconds
  plan.json         ← you edit this
  assets.json       ← you edit this (file, source_url, credit, rights per shot)
  assets/           ← you add files here
  edl.json          generated render props
  out/              segment-02.mp4, segment-02.srt, review-sheet.jpg, verification.json
```

Re-running `prepare` on the same folder with different VO bytes is refused: originals are never overwritten.

## plan.json

Beats are anchored to **word indexes** in `timing.json`, so re-tightening the audio never breaks a plan.

```jsonc
{
  "style": {
    "captions": "off",                                   // "burned" to add captions; SRT is always written
    "music": {"file": "assets/music/bed.mp3", "volume": 0.12, "duckedVolume": 0.035},
    "sfx": {"whoosh": "assets/sfx/whoosh.wav", "pop": null}
  },
  "beats": [
    {"id": "b00", "fromWord": 0,  "visual": {"type": "title", "number": "2", "text": "Doom Weaponized A Wedding Guest List"}},
    {"id": "b01", "fromWord": 6,  "transitionIn": "pushLeft", "visual": {"type": "source", "asset": "b01", "move": "zoomIn"}},
    {"id": "b07", "fromWord": 54, "visual": {"type": "compare",
        "left":  {"asset": "b06", "label": "Needs a crowd"},
        "right": {"asset": "b07", "label": "Stays off the aisle"}, "revealRightAtWord": 58}},
    {"id": "b24", "fromWord": 194, "transitionIn": "pushUp", "visual": {"type": "keyword", "text": "He could not stop the vows.", "sub": "He could only make the guests forget…", "subAtWord": 200}}
  ],
  "overlays": [
    {"type": "circle", "fromWord": 16, "toWord": 21, "x": 1100, "y": 480, "d": 220},
    {"type": "label",  "fromWord": 30, "toWord": 38, "text": "Character footage: Fantastic Four (1994)"}
  ]
}
```

Visual types: `source` (image or clip, `move`: zoomIn, zoomOut, panLeft, panRight, none), `compare`, `keyword`, `title`.
Transitions: `cut` (default), `pushLeft`, `pushRight`, `pushUp`, `pushDown`.
Music is only used from a file you supply. It is ducked under the voice automatically.

## Look

The composition reproduces the channel's **original** edit: white canvas, serif type, one red accent, soft shadow on stills, gentle 3 to 7% zoom, two sided push transitions. The rejected Swiss redesign is not used. `docs/REFERENCE-BREAKDOWN.md` analyses the reference segment Luke supplied and lists the next components (chapter grid and badge, soundbites, highlighted article cards, tracked callouts).

## Tests

```powershell
npm test         # planner + EDL builder unit tests
npm run check    # TypeScript
```

## Rights

The engine records `source_url`, `credit` and `rights` per asset. It does not clear anything: publication rights in third party footage remain the channel owner's responsibility.
