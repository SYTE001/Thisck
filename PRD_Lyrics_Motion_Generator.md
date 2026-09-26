# PRD / MASTER PROMPT — Spotify Lyrics Video Generator

## ROLE

You are a senior full-stack engineer, motion-graphics engineer, and product designer.

Build a production-ready web/local application called **Lyrics Motion Generator**.

The application converts a lyrics file into a short-form Spotify/Pinterest-style lyrics video similar to the supplied reference video.

Reference visual characteristics:
- Vertical social-video composition.
- Minimal editorial typography.
- Warm cream / deep burgundy color palette.
- Large bold serif display typography.
- Lyrics are the dominant visual element.
- 1–2 short lyric lines are shown at a time.
- Words/lines enter and leave with subtle motion.
- Some words appear emphasized through color/opacity/position.
- Small decorative star/spark symbol near the bottom.
- Subtle paper/grain/distressed texture.
- No generic AI aesthetic.
- No neon.
- No purple gradients.
- No excessive glassmorphism.
- No UI-looking cards.
- No unnecessary icons.
- The result should feel like a designed music editorial rather than an AI-generated template.

IMPORTANT:
Do not blindly copy the reference. Recreate its visual language while making the system configurable.

---



# 0. PRODUCT CONTRACT — TIMING & AUDIO

This is the most important product rule.

The application has TWO independent layers:

1. LYRIC TIMELINE
2. AUDIO TRACK

They must never be incorrectly coupled.

The lyric timeline is the source of truth for when text appears.
Audio is optional.

Supported workflows:

### MODE A — LRC → VIDEO WITHOUT AUDIO

Input:
- `.lrc`
- `.lrc` / Enhanced LRC

Output:
- MP4 video
- animated lyrics
- NO audio track

This mode must work completely offline after the application is loaded.

Flow:

LRC
→ parse timestamps
→ normalize timeline
→ motion engine
→ render video
→ silent MP4

### MODE B — LRC + AUDIO → VIDEO WITH AUDIO

Input:
- `.lrc`
- audio file supplied by the user

Output:
- MP4 video
- animated lyrics
- supplied audio

Flow:

LRC + AUDIO
→ parse timestamps
→ validate against audio duration
→ synchronize
→ motion engine
→ mux video + audio
→ final MP4

The application must NEVER download or extract protected music from Spotify simply because a song title or Spotify URL was provided.

### MODE C — TXT + AUDIO → AUDIO ALIGNMENT

Input:
- plain `.txt` lyrics
- user-provided audio

Output:
- detected lyric timestamps
- confidence scores
- animated lyrics
- optional audio in final render

Flow:

TXT + AUDIO
→ audio/lyrics alignment
→ generated timeline
→ confidence validation
→ user review
→ motion engine
→ render

If alignment confidence is insufficient, mark affected lines for review instead of pretending the timing is exact.

---

# 0.1 TIMING IS THE SOURCE OF TRUTH

Every visual event must derive from the lyric timeline.

Example:

Lyric A:
start = 12.30s
end = 15.80s

The renderer MUST show Lyric A only inside that interval.

The motion engine may animate inside that interval, but it must not change the lyric's actual start/end.

Do NOT do:

lyric duration = 3 seconds
because the template says 3 seconds.

Do:

lyric duration = endTime - startTime

For example:

12.30 → 15.80 = 3.50 seconds

The animation adapts to 3.50 seconds.

If the next lyric starts at 13.00s:

12.30 → 13.00 = 0.70 seconds

The animation must automatically compress.

Never allow an animation to extend into the next lyric's timing window unless an explicit overlap mode is configured.

---

# 0.2 ADAPTIVE ANIMATION ENGINE

Every lyric segment has:

startTime
endTime
duration

The motion engine calculates:

duration = endTime - startTime

Then selects animation parameters based on available duration.

### Long segment

If duration >= 2.0s:

ENTER:
200–350ms

HOLD:
remaining time

EXIT:
250–450ms

### Medium segment

If duration 1.0–2.0s:

ENTER:
150–250ms

HOLD:
remaining time

EXIT:
150–300ms

### Short segment

If duration < 1.0s:

ENTER:
80–150ms

HOLD:
majority of available duration

EXIT:
80–150ms

### Very short segment

If duration < 0.45s:

Use a minimal opacity/position interpolation.

Do NOT attempt a full entrance + hold + exit sequence.

The system must always satisfy:

animationStart >= lyricStart

animationEnd <= lyricEnd

unless overlap is explicitly enabled.

---

# 0.3 VISUAL EVENTS MUST BE TIMELINE-DRIVEN

Do not use fixed frame counts for lyric appearance.

Bad implementation:

show lyric for 90 frames

Correct implementation:

show lyric while:

currentTime >= lyric.startTime
AND
currentTime < lyric.endTime

All animation progress should be calculated from:

progress =
(currentTime - lyric.startTime) /
(lyric.endTime - lyric.startTime)

Clamp progress between 0 and 1.

This ensures the same project works with any song tempo.

---

# 0.4 LINE-LEVEL VS WORD-LEVEL ANIMATION

The renderer supports two timing resolutions.

### LINE MODE

Used when LRC contains line timestamps.

Example:

[00:12.30] I remember
[00:15.80] every word you said

The entire phrase is animated as one visual unit.

### WORD MODE

Used when Enhanced LRC or aligned word timestamps exist.

Example:

I:
12.30–12.65

remember:
12.65–13.20

every:
13.20–13.60

word:
13.60–14.00

The renderer can progressively emphasize each word.

Word animation must NEVER invent timing.

If word timestamps do not exist:
- use line mode
- do not estimate word timing unless the user explicitly enables an approximation mode.

Approximation mode must be visibly labeled as approximate.

---

# 0.5 AUDIO HANDLING

Audio is an optional project asset.

Project state:

audio:
{
  enabled: boolean,
  source: "USER_UPLOAD" | "NONE",
  file: string | null,
  duration: number | null
}

Rules:

- `.lrc` alone → silent video is valid.
- `.lrc + audio` → mux audio into final MP4.
- `.txt + audio` → audio alignment is available.
- `.txt alone` → exact synchronization is unavailable.

When audio exists:
- validate lyric timeline against audio duration.
- show waveform in timeline editor.
- allow audio playback during preview.
- final render must mux audio without changing its timing.

Do not alter audio speed automatically to hide synchronization problems.

If lyric duration exceeds audio:
- show warning.

If audio exceeds lyric duration:
- allow configurable ending behavior:
  - cut video at final lyric
  - preserve audio tail with final visual
  - custom end time

Default:
`preserve audio tail with final visual`

---

# 0.6 SILENT VIDEO MODE

Silent output must be treated as a first-class export type.

Export settings:

Audio:
- None
- Project Audio

Default for LRC-only projects:
`None`

File:
- MP4
- H.264
- AAC only when audio exists

For silent MP4:
- no unnecessary audio stream
- correct video duration
- standard H.264 compatibility

---

# 0.7 PROJECT TIMELINE EXAMPLE

Internal timeline:

[
  {
    "id": "line-001",
    "text": "I remember",
    "startTime": 12.30,
    "endTime": 15.80,
    "timingSource": "SOURCE_LRC"
  },
  {
    "id": "line-002",
    "text": "every word you said",
    "startTime": 15.80,
    "endTime": 18.42,
    "timingSource": "SOURCE_LRC"
  }
]

Renderer:

At 12.30:
- Line 001 enters.

Between 12.30 and 15.80:
- Line 001 remains active.

At approximately 15.80:
- Line 001 exits.
- Line 002 enters.

The transition is calculated from actual timestamps.

---

# 0.8 PREVIEW MUST SHOW TIMING SOURCE

Timeline UI should display:

`12.30s — 15.80s`

and:

`Timing: LRC`

or:

`Timing: Audio Aligned`

or:

`Timing: Manual`

For Enhanced LRC:

`Timing: Word-level`

This prevents users from confusing visual animation with actual lyric synchronization.

---

# 0.9 EXPORT VALIDATION

Before export, validate:

1. Every lyric line has startTime.
2. Every lyric line has endTime.
3. endTime > startTime.
4. No negative timestamps.
5. No invalid timestamp ordering.
6. No impossible overlaps unless explicitly allowed.
7. Video duration covers all required lyric segments.
8. If audio exists, lyric timeline is compatible with audio duration.
9. Animation duration fits inside each lyric interval.
10. Word timestamps, if present, are within their parent line.
11. Audio is never silently replaced or synthesized.
12. Silent export contains no audio stream.

Show a clear result:

`READY TO EXPORT`

or:

`3 TIMELINE ISSUES REQUIRE REVIEW`

---

# 0.10 DEFAULT USER EXPERIENCE

The simplest successful path should be:

### User uploads `.lrc`

App detects:

`Synced lyrics found — 42 timestamped lines`

Then immediately creates:

- timeline
- silent preview
- editorial animation

User clicks:

`Export Video`

Result:

`lyrics-video.mp4`

No audio required.

### User uploads `.lrc` + audio

App detects:

`42 synced lines`
`Audio: 3:27`

Preview includes audio.

User clicks:

`Export Video`

Result:

`lyrics-video.mp4`

with audio.

### User uploads `.txt`

App says:

`This file contains lyrics but no timestamps.`

Then:

`Upload audio to automatically align lyrics`

or:

`Import LRC`

Never fabricate timing.


# 1. CORE PRODUCT GOAL

User should be able to provide lyrics and generate a correctly timed lyrics video with minimal manual work.

Primary workflow:

1. User uploads a lyrics file.
2. App optionally uploads an audio file.
3. App parses the lyrics.
4. App determines whether timestamps are available.
4. If timestamps exist, use them exactly.
5. If timestamps do not exist, DO NOT invent timing.
6. The app must either:
   - obtain synced timestamps from a configured trusted lyrics/timing provider, OR
   - align the lyrics against user-provided audio using an audio-to-lyrics alignment engine.
7. User reviews the detected timeline.
8. App generates a preview.
9. User can adjust timing/style.
10. App renders/export the final video.

The application must treat timing accuracy as a first-class feature, not an optional enhancement.

---

# 2. CRITICAL TIMESTAMP RULE

NEVER generate fake timestamps by evenly distributing lyrics over the song duration.

Timestamp data determines lyric duration. Animation adapts to timestamp duration; it never overrides it.

Bad:
- 4 lyric lines / 20 seconds = 5 seconds each.

Never do this.

Acceptable timing sources, in priority order:

1. Existing timestamped `.lrc` / enhanced `.lrc`.
2. Trusted synced-lyrics API/provider configured by the developer.
3. Audio + lyrics alignment using a proper forced-alignment/audio-to-lyrics system.
4. Manual timeline editing by the user.

If none of these are available:
- clearly show `TIMESTAMP DATA REQUIRED`
- explain why exact synchronization cannot be guaranteed
- allow the user to upload `.lrc` or audio
- do not silently continue with guessed timing.

The UI should make the distinction between:
- `Exact / source timestamp`
- `Audio aligned`
- `Manual`
- `Unavailable`

visible to the user.

---

# 3. INPUT FORMATS

Support:

### A. LRC

Example:

[00:12.340] Secrets
[00:15.120] held in my
[00:17.430] heart
[00:20.100] are harder to
[00:22.400] forget

Enhanced LRC should also be supported where possible:

[00:12.340] se[00:12.700]crets

### B. Plain TXT

Example:

Secrets
held in my
heart
are harder to
forget

A TXT file alone does NOT contain enough timing information.

If TXT is uploaded:
- ask for audio OR
- resolve timestamps from an external synced source.
- never fabricate timing.

### C. JSON

Support a normalized internal structure:

{
  "title": "Song Title",
  "artist": "Artist",
  "lines": [
    {
      "text": "Secrets",
      "start": 12.34,
      "end": 15.12
    }
  ]
}

---

# 4. INTERNAL DATA MODEL

Normalize every input into:

Track:
- title
- artist
- duration
- audioSource
- timingSource
- timingConfidence

LyricLine:
- id
- text
- startTime
- endTime
- words[]
- confidence
- source

Word:
- text
- startTime
- endTime
- confidence

TimingSource enum:

SOURCE_LRC
SOURCE_ENHANCED_LRC
SOURCE_SYNC_PROVIDER
SOURCE_AUDIO_ALIGNMENT
SOURCE_MANUAL
SOURCE_UNKNOWN

Never lose the original timestamp precision.

Store timestamps as milliseconds or floating-point seconds internally.

---

# 5. TIMELINE ENGINE

Create a deterministic timeline engine.

Each lyric line must have:

startTime
endTime
duration

If only line start timestamps are available:
- infer endTime from the next line's startTime.
- apply a configurable maximum hold duration.
- preserve original line starts.

If enhanced word timestamps exist:
- use word-level timing.

If only line-level timing exists:
- use line-level animation.

Do not pretend to have word-level timing when it does not exist.

Timeline editing features:

- drag line start/end
- split line
- merge line
- adjust offset globally
- shift selected lines
- ±100ms / ±250ms / ±500ms quick adjustment
- preview selected line
- zoom timeline
- snap to nearby timestamps
- playhead
- waveform when audio is available

Global timing controls:
- offset +/−
- playback speed
- start trim
- end trim

---

# 6. VIDEO DESIGN SYSTEM

Default preset: `EDITORIAL BURGUNDY`

Canvas:
- 1080 × 1920
- 9:16
- 30fps by default
- configurable 24/30/60fps

Background:
- deep burgundy
- warm cream
- alternating cream/burgundy scenes
- subtle paper texture
- subtle film grain
- optional vignette

Typography:
- editorial serif display font
- examples: Cormorant Garamond, Playfair Display, DM Serif Display, Libre Baskerville
- allow user font selection
- large typography
- strong weight
- tight line-height
- centered composition by default

Primary colors:
- burgundy: approximately #5B0B0B
- dark wine: approximately #3A0505
- cream: approximately #F1D39A
- muted brown: approximately #8D6650

Do not hard-code the colors if a theme system is implemented.

---

# 7. REFERENCE ANIMATION LANGUAGE

Recreate the following behavior:

A lyric phrase enters using:
- subtle opacity fade
- slight vertical movement
- slight scale change

Current lyric:
- large
- high contrast
- visually dominant

Previous/next lyric:
- lower opacity
- slightly different vertical position
- optionally blurred or faded

Word emphasis:
- active word can change opacity/color
- inactive words remain muted
- transition should feel smooth rather than karaoke-like unless the user explicitly chooses karaoke mode

Transitions:
- 200–500ms default
- configurable
- no excessive bounce
- no flashy zoom
- no particle explosion
- no generic template transitions

The animation should feel like typography moving on a printed editorial poster.

---

# 8. TEXT LAYOUT ENGINE

Automatically split lyrics into visually balanced chunks.

Rules:
- prioritize natural phrase boundaries
- do not split a word
- avoid orphan words
- avoid more than 2–3 lines unless explicitly configured
- maintain safe margins
- dynamically scale font if text is too long
- preserve readability

Example:

Instead of:

"i wanna be yours"

render:

i wanna be
yours

when that produces a better composition.

But timing must remain attached to the correct original lyric segment.

The layout engine must not alter lyric text.

---

# 9. VISUAL VARIATION ENGINE

Avoid every lyric frame looking identical.

Create controlled variations:

Scene A:
- burgundy background
- cream text

Scene B:
- cream background
- burgundy text

Scene C:
- large centered phrase

Scene D:
- phrase slightly above center

Scene E:
- previous phrase faintly visible behind current phrase

Variation must be deterministic using a seed.

Do not randomly change style every frame.

Maintain visual continuity.

---

# 10. DECORATIVE ELEMENTS

Optional small editorial decoration:

- 4-point star
- tiny cross/star symbol
- subtle dust
- paper scratches
- grain
- tiny offset registration-like imperfections

Decoration should remain secondary.

Never cover lyrics.

Never use:
- neon particles
- glowing AI effects
- huge lens flares
- futuristic HUD
- excessive gradients
- random 3D objects

---

# 11. VIDEO RENDER PIPELINE

Recommended architecture:

Frontend:
- Next.js / React
- TypeScript
- Tailwind or CSS modules
- timeline editor
- preview player

Rendering:
- Remotion + React
OR
- FFmpeg-based deterministic renderer

Use Remotion if possible because the video should be generated from the exact same timeline used in preview.

Audio:
- optional user-provided audio file
- no audio is required for silent LRC exports
- never download/extract protected music merely from a song URL
- never rely on browser playback timing as the final source of truth

Export:
- MP4
- H.264
- AAC
- 1080×1920
- 30fps
- configurable bitrate

Optional:
- WebM preview
- PNG frame export
- SRT export
- LRC export

---

# 12. PREVIEW ENGINE

The preview must reproduce the render output accurately.

Controls:
- play/pause
- restart
- timeline scrub
- current timestamp
- previous line
- next line
- zoom timeline
- mute
- fullscreen
- 0.5x / 1x / 1.5x playback

Important:
Preview and final render must use the same timeline and animation calculations.

Do not create a separate approximate preview implementation.

---

# 13. UI / UX

Design philosophy:

Apple-like minimal editorial interface.

Avoid AI-slop UI.

Use:
- neutral background
- clean spacing
- subtle borders
- restrained shadows
- compact controls
- clear hierarchy

Main layout:

LEFT:
Project / input

CENTER:
Video preview

BOTTOM:
Timeline

RIGHT:
Style / animation / export settings

Suggested navigation:

Project
Timeline
Style
Export

Status indicators:

TIMING:
✓ Exact LRC
✓ Audio aligned
⚠ Manual
× Missing

Do not use vague status such as:
"AI Magic"
"Smart Sync"
"AI Enhanced"

Use factual labels.

---

# 14. IMPORT FLOW

First screen:

"Create a lyrics video"

Upload:
- `.lrc`
- `.txt`
- `.json`

Optional:
- audio file

After upload:

If LRC:
`Synced lyrics detected.`

If enhanced LRC:
`Word-level timestamps detected.`

If TXT:
`No timestamps detected.`

Then show:

`How should timing be resolved?`

Options:
1. Find synced timing
2. Align with audio
3. Import LRC
4. Edit manually

If external provider is unavailable, do not fake success.

---

# 15. SYNC PROVIDER ARCHITECTURE

Implement a provider abstraction.

interface LyricsSyncProvider {
  search(track): Promise<SearchResult[]>
  getSyncedLyrics(track): Promise<SyncedLyrics>
}

The system must support providers through adapters.

Do not tightly couple the app to one provider.

Add:
- provider timeout
- retry
- rate-limit handling
- caching
- source metadata
- failure state

Never expose API keys to the browser.

All provider requests requiring secrets must run server-side.

---

# 16. AUDIO ALIGNMENT

If audio alignment is implemented:

Input:
- audio
- plain lyrics

Output:
- line timestamps
- optional word timestamps
- confidence score

Store:

{
  "start": 12.34,
  "end": 15.21,
  "confidence": 0.96
}

Show confidence in the UI.

If confidence is low:
- flag the affected line
- ask for manual verification
- do not silently mark it exact.

---

# 17. SONG METADATA

Support:

Title
Artist
Album
Cover art
Duration

Metadata can be entered manually or retrieved from a configured metadata provider.

Do not make the application dependent on Spotify login.

Do not assume Spotify itself provides freely accessible synced lyrics/timestamps.

The architecture should work even without Spotify API access.

---

# 18. COPYRIGHT / CONTENT SAFETY

The application is a user-side creative tool.

Do not bundle copyrighted songs into the application.

Do not ship a database containing copyrighted lyrics.

Do not scrape and permanently store lyrics from providers unless their terms explicitly allow it.

Store only what is necessary for the user's project.

When exporting, use audio supplied or authorized by the user.

---

# 19. PROJECT STRUCTURE

Use a modular structure.

Example:

/app
  /page
  /editor
  /api
    /lyrics
    /sync
    /render

/components
  /editor
  /timeline
  /preview
  /style-panel
  /upload

/lib
  /lyrics
  /timeline
  /sync
  /render
  /metadata

/types
  lyrics.ts
  timeline.ts
  project.ts

/templates
  editorial-burgundy.ts
  cream-editorial.ts

/render
  LyricsComposition.tsx

Do not create giant monolithic components.

---

# 20. PROJECT STATE

Project should be serializable.

Example:

{
  "version": 1,
  "track": {},
  "lyrics": {},
  "timeline": {},
  "style": {},
  "render": {}
}

Allow:
- save project
- reopen project
- duplicate project
- export project JSON

---

# 21. PERFORMANCE

Target mid-range laptops.

Requirements:
- lazy-load heavy editor components
- avoid rendering full-resolution video continuously when unnecessary
- debounce timeline updates
- memoize lyric scenes
- virtualize long lyric lists
- cache parsed lyrics
- avoid unnecessary React rerenders
- render preview at lower resolution when editing
- use final resolution only for export

The app should remain responsive with 1000+ lyric timing points.

---

# 22. ERROR HANDLING

Errors must be actionable.

Bad:
"Something went wrong."

Good:
"TXT contains no timestamps. Upload an LRC file or provide audio for alignment."

Other states:
- invalid LRC
- malformed timestamp
- missing lyric text
- overlapping timestamps
- provider timeout
- provider returned unsynced lyrics
- audio decoding failure
- render failure
- unsupported codec

Always explain:
1. what failed
2. why
3. what the user can do

---

# 23. DEFAULT PRESET

Create this preset:

Name:
`Editorial Burgundy`

Background:
Deep burgundy / warm cream alternating

Typography:
Bold editorial serif

Text:
Large centered

Animation:
Fade + slight vertical movement + subtle scale

Duration:
Use exact lyric timing

Decoration:
Small 4-point star at bottom

Texture:
Low-intensity paper grain

Overall:
Pinterest / Spotify lyric editorial aesthetic

---

# 24. EXPORT PRESETS

Preset 1:
TikTok / Reels
1080×1920
30fps
H.264

Preset 2:
Instagram Story
1080×1920
30fps

Preset 3:
YouTube Shorts
1080×1920
30fps

Allow custom export settings.

---

# 25. QUALITY CHECK BEFORE EXPORT

Run an automatic validation:

- Are all lyrics timed?
- Are there overlapping lines?
- Are there gaps?
- Are there lyrics outside audio duration?
- Are any timestamps negative?
- Are there suspiciously long gaps?
- Are any lines too long for viewport?
- Are any words outside safe area?
- Is the timing source known?
- Is audio duration consistent with timeline?

Show:

`Timeline Quality Check`

with warnings.

Do not block export for harmless warnings, but block impossible states.

---

# 26. TEST CASES

Create automated tests for:

1. Basic LRC parsing.
2. Enhanced LRC parsing.
3. TXT without timestamps.
4. Missing timestamps.
5. Overlapping timestamps.
6. Out-of-order timestamps.
7. Very long lyric line.
8. Empty lyric line.
9. Global +250ms offset.
10. Global -250ms offset.
11. Audio duration shorter than lyrics.
12. Exact preview/render synchronization.
13. 1000+ lyric lines.
14. Export with alternating scenes.
15. Word-level timing.

---

# 27. DEFINITION OF DONE

The project is finished only when:

- User can upload an LRC file.
- LRC-only projects can export a silent MP4.
- LRC + user audio projects can export MP4 with synchronized audio.
- TXT + user audio projects can run audio alignment.
- Lyrics are parsed correctly.
- Original timestamps are preserved.
- Timeline is visualized.
- Video preview follows timestamps exactly.
- Visual style matches the editorial reference direction.
- User can edit timing.
- User can change colors/fonts/animation.
- Final MP4 export works.
- Preview and final render match.
- Errors are actionable.
- No fake timestamps are generated.
- TXT-only input clearly requests a real timing source.
- Project can be saved/reopened.
- UI is responsive.
- Core functionality has automated tests.
- Production build succeeds.

---

# 28. AGENT EXECUTION RULES

You are not writing a mockup.

Build the actual working application.

Before coding:
1. Inspect the repository.
2. Detect existing framework and dependencies.
3. Reuse existing architecture when reasonable.
4. Do not rewrite working code unnecessarily.
5. Create an implementation checklist.
6. Implement in small verifiable stages.

After each major stage:
- run typecheck
- run lint
- run tests
- run build where applicable

Do not mark a task complete because code was written.

Verify the feature actually works.

When encountering a missing dependency or external API:
- implement an adapter/interface
- create a safe local/mock development provider
- document the required production credential/configuration
- never fake production data

Do not use placeholder functionality for core timing or rendering.

---

# 29. VISUAL QUALITY BAR

The final result should feel closer to:

- premium editorial music content
- Pinterest lyric posts
- Spotify Canvas-inspired typography
- modern magazine typography

It should NOT feel like:

- AI dashboard
- SaaS landing page
- generic Canva template
- cyberpunk motion graphics
- neon AI template
- random gradient generator

Prioritize typography, spacing, rhythm, composition, and timing.

---

# 30. FIRST IMPLEMENTATION TASK

Start by inspecting the current repository.

Then:

1. Build the lyrics parser.
2. Build normalized timeline model.
3. Build the timestamp-source abstraction.
4. Build LRC import.
5. Build timeline editor.
6. Build editorial visual renderer.
7. Connect preview to timeline.
8. Add export.
9. Add audio alignment/provider adapter.
10. Add quality validation.
11. Test the complete flow.
12. Polish UI and motion.

Do not skip directly to styling before the timing architecture works.

The fundamental product promise is:

**Upload real synced lyrics → preserve/resolve real timestamps → generate a polished lyrics video automatically.**
