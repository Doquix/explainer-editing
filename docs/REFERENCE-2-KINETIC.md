# Reference 2: kinetic "Every X Explained" style

Source: `Every_Game_Engine_Explained_in_19_Minutes.mp4`, supplied by Luke on 2026 11 23 as a second editing style for the engine.
1280×720, 30 fps, 19:27. Method: scene detection, a frame every 5 s across the whole video, 0.3 s motion strips at five windows, loudness and level measurements. Audio measured, not listened to.

## The big difference from reference 1

Reference 1 is **footage led**: a source clip fills the frame and changes every ~2.3 s.
Reference 2 is **graphics led**: only 30 hard cuts in 19.5 minutes, yet something new appears on screen every 1 to 2 seconds. The picture is built from text, logos, screenshots and small reaction images placed on a white page and animated in as the narrator names them. Very little moving footage.

This style is **cheaper to source and safer on rights**: logos, product screenshots, text and the narrator's own graphics carry most of the screen.

## Building blocks seen

| Element | What it does | Engine component |
|---|---|---|
| Chapter grid + badge | Same convention as reference 1: grid of round logo badges, current one moves to center, then shrinks to a persistent top left badge | `ChapterGrid`, `ChapterBadge` (already on the roadmap) |
| Word by word text | Sentence types in word by word in sync with the voice, each word sliding up out of a blur; the punchline word turns red ("anything") | `KineticText` with per word timing from timing.json, `emphasis` word list |
| Keyword cards | One or two big words alone on white ("SO", "The bottom rung", "135 million registered users") | `Keyword` (exists) in a sans font |
| Staggered pop ins | Logos, covers or faces appear one at a time as each is named (3 game covers, 4 platform icons, list of 5 features placed around the frame) | `Collage`: items each anchored to a word, soft blur fade in |
| Screenshot cards | UI screenshots in rounded corner cards with soft shadow, slow push in | `SourceShot` with `radius` and `shadow` options |
| Name labels | Photo of people with names underneath and arrows pointing up at each | `Label` + `Arrow` overlays (exist) |
| Strike / cross out | Red X draws over a word ("Commercial") | `Strike` overlay |
| Price / stat callouts | Big red number ("$99.99"), "FREE!" starburst | `Stat` card, `Burst` sticker |
| Map + flag overlay | Country outline with flag fills in over a photo to say where something is from | `MapPin` (needs country outlines) |
| Reaction inserts | Small meme images and stick figure drawings for jokes | `SourceShot` small; **conflicts with C10 (GIFs removed)** and many are copyrighted characters |
| Transitions | Blur cross dissolve and elements leaving with motion blur, not pushes | `transitionIn: "blur"` |

## Typography and layout

- Rounded, slightly hand drawn sans for body text; one accent red for emphasis. Not the serif of the original channel look.
- Everything centered on white with generous space; most frames hold one idea.
- Logos and screenshots sit around 40 to 60% of frame width, smaller than reference 1's footage.

## Audio

- −16.3 LUFS integrated. The quietest 5% sits around −42 dB, so pauses are close to silent: **little or no music bed**, unlike reference 1. Needs a listening check.

## What the engine needs for this style

1. A **style preset system**: `style: "original" | "footage" (ref 1) | "kinetic" (ref 2)` choosing fonts, transitions, shadows and default beat types.
2. `KineticText` driven by word timings: the single most used element here.
3. `Collage` with items anchored to words, so things appear exactly when named.
4. `Strike`, `Stat`, `Burst` overlays.
5. Blur transition.
6. Word timings must be real (faster-whisper), because this style lives on sync.

## Conflicts to decide

| Feature | Current rule | Question for Luke |
|---|---|---|
| Rounded sans body font | Original look is serif | Kinetic preset only, or channel wide? |
| Meme / reaction images | C10 removed GIFs | Allow small still reactions in kinetic preset? Avoid copyrighted characters either way |
| Near silent pauses | Reference 1 has a music bed | Music optional per preset |
