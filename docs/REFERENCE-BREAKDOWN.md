# Reference breakdown: ideal segment output

Source: `sge220-copy.mp4` supplied by Luke on 2026 11 23 as "what the ideal output per segment should be".
One countdown entry ("Room for Jack", a Titanic ending), 1920×1080, 30 fps, 100.9 s, stereo AAC 44.1 kHz.

Method: scene change detection (threshold 0.25), 1 fps contact sheets, 0.2 s motion strips at the intro,
split screen, callout, quote, article, transition and outro windows, plus loudness and level measurements.
Audio was measured, **not listened to**: music and SFX statements below are inferences from levels.

## 1. Segment anatomy (timeline)

| Time | Part | What happens |
|---|---|---|
| 0.0 to 1.8 s | **Chapter grid intro** | All 15 entries shown as round thumbnails with short caps labels in a 5×3 grid. The current entry's circle lifts out, the rest fade to ~30% then out, current circle settles at center with its label |
| 1.8 to 3.3 s | **Chapter hold** | Current circle + label alone on white, centered |
| 3.3 s | **Badge handoff** | Circle shrinks to a small badge top left (about 60 px, label under it) and stays for the whole segment |
| 3.3 to 97 s | **Body** | Narrated explanation over source footage, ~35 shots |
| 97 to 99 s | **Chapter grid outro** | Grid returns, the *next* entry's circle flies to center, others fade |
| 99 to 100.9 s | **Next chapter hold** | Next entry circle + label centered: the hook into the following segment |

## 2. Body visual language

- **Canvas:** plain white, footage centered at roughly 70 to 80% of frame width, generous margins. No frame shadow on video. Same white page idea as our original edit, so it fits the SOP.
- **Footage first:** almost every shot is a moving clip (film scenes, behind the scenes, interviews, documentary B roll), not stills. Clips play at normal speed, muted under the narration.
- **Pacing:** 35 shots in 100.9 s. Median shot **2.3 s**, middle half between **1.6 and 3.9 s**, longest 9.5 s (a talking interview hold). Faster than our planner's current 1.6 to 6.5 s beats.
- **Motion:** slow push in on stills and documents. Clips are not zoomed.
- **Transitions:** overwhelmingly **hard cuts**. A few horizontal pushes where the next image slides in from the right.

### Graphic modes seen

| Mode | Example | Engine component |
|---|---|---|
| Single source clip | most shots | `SourceShot` (video, no shadow) |
| Split screen | 7.8 to 9 s, two clips side by side, no labels | `Split`: two media, no arrow or captions |
| Poster / cover insert | Titanic poster, MythBusters cover, documentary poster | `SourceShot` portrait image, smaller box, slow push |
| Tracked circle callout | 38 to 40 s, red hand drawn ring follows a person in moving footage | `Circle` with keyframed x/y over time |
| Article card + highlight | 48 to 52 s, screenshot of a Vanity Fair paragraph on a white card with soft shadow; yellow marker wipes across key phrases on cue; slow push in | `DocumentCard` with highlight boxes anchored to words |
| Dark article card | 79 to 80 s, same idea with a dark screenshot | same component |
| Cutout prop | 74 to 78 s and 89 to 90 s, the door panel as a PNG cutout with shadow and a small credit line under it ("Imaged by …") | `Cutout`: transparent PNG + credit |
| Reaction insert | 81 to 82 s, a square clip of someone covering their mouth | `SourceShot` square; note SOP currently removes reaction GIFs (C10) |
| Soundbite with quote line | 45 to 47 s, interview clip with a one line serif subtitle under the frame: "Maybe we screwed up." | `Soundbite`: clip audio up, narration pauses, quote text under frame |

### Captions

**No running captions.** The only on screen text under footage is the quote line during a soundbite.

## 3. Audio

- **No true silence anywhere** (nothing below −45 dB for 0.3 s). The quietest 5% sits around −43 dB and gaps between phrases sit around −35 to −40 dB, which points to a **continuous low music bed** under the voice.
- Integrated loudness **−24.8 LUFS**. That is quiet for YouTube; keep our −14 LUFS master target.
- SFX: not confirmed. Needs a listening pass.

## 4. Engine work this implies

Priority order. ✅ exists, 🔧 change, 🆕 new.

1. 🆕 **Chapter system.** A `chapters.json` per video (all entries: id, short caps label, round thumbnail). Components: `ChapterGrid` intro (current entry lifts out), persistent `ChapterBadge` top left, `ChapterGrid` outro (next entry lifts out). This is the strongest identity element in the reference.
2. 🔧 **Planner pacing.** Target 1.5 to 4 s shots; allow several shots per sentence; prefer **clips** in asset requests; hard cuts by default with an occasional push.
3. 🆕 **Soundbite beats.** Insert a source clip with its own audio, pause the narration, show a quote line. This changes the timeline model: total time = narration + inserted soundbites. Build resolves insert points at word boundaries.
4. 🆕 **DocumentCard** with timed highlight wipes (boxes given in image pixels, each anchored to a word).
5. 🆕 **Tracked circle** (keyframes instead of one fixed x/y).
6. 🆕 **Split** and **Cutout** components.
7. 🔧 **Music bed** always on when a track is supplied, ducked under voice (already built), never silent.
8. 🔧 **Captions default off**, matching the reference and SOP rule 9. Keep SRT sidecar.
9. 🔧 **Shadow only on stills, documents and cutouts**, never on video (already true for video).

## 5. Conflicts with the current SOP (need Luke's decision)

| Reference feature | Current rule | Proposed |
|---|---|---|
| Circle chapter badge + grid intro/outro | C23: do not silently import reference circle badges | Adopt: Luke supplied this as the ideal output. Record as a new user direction (C25) once confirmed |
| Reaction clip insert | C10: GIFs removed | Keep removed unless Luke restores them |
| Sans serif caps labels in the grid | Original edit uses serif | Labels only; body text stays serif |
| No running captions | Luke selected "synced captions" for the engine | Default off, switchable per job |
| Mostly moving footage | Doom segments are comic panel stills | Fine for comics; for film topics request clips |

Rights: every shot in the reference is third party media. Our engine records source and rights per asset; it does not make any of it cleared.
