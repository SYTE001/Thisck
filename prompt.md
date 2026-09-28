## TASK — REBUILD LYRICS ANIMATION SYSTEM

Refactor the current lyrics text animation system.

Masalah utama:
Current “word-by-word” animation terasa seperti teks bergerak/goyang. Itu bukan behavior yang diinginkan.

Referensi visual:
Gunakan video reference sebagai acuan. Teks terlihat solid, stabil, clean, dan typography-focused. Posisi teks tidak boleh ikut bergeser atau “dancing” hanya karena animasi lyrics.

### CORE CONCEPT

Pisahkan sistem menjadi 2 layer independen:

1. LYRICS TYPE
2. LYRICS EFFECT

Keduanya harus bisa dikombinasikan secara bebas.

---

# 1. LYRICS TYPE

Lyrics Type menentukan BAGAI MANA TEKS DITAMPILKAN, bukan bagaimana teks dianimasikan.

Contoh:

* Single Line
* Multi Line
* Paragraph
* Word by Word
* Character by Character
* Highlighted Word
* Progressive Reveal
* Karaoke
* Auto Fit / Auto Wrap
* Beat / Phrase Based

Behavior penting:

* Typography harus tetap solid dan stabil.
* Jangan membuat seluruh text block bergerak hanya karena menggunakan Word by Word.
* Word by Word harus berarti perubahan visibility/highlight secara berurutan, bukan position movement.
* Text position tetap konsisten.
* Line spacing, alignment, font size, dan bounding box tidak boleh berubah-ubah secara random.
* Jangan menggunakan bounce, shake, floating, elastic movement, atau random offset sebagai behavior default.

Contoh:

WE
DON'T
GOTTA
BE
IN LOVE

Tetap berada pada layout yang sama. Yang berubah hanya state teksnya.

---

# 2. LYRICS EFFECT

Lyrics Effect adalah layer ANIMASI VISUAL yang terpisah dari Lyrics Type.

Effect dapat diterapkan ke seluruh lyric, line, word, atau character tanpa mengubah struktur/layout dasar text.

Preset awal:

* None
* Fade In
* Fade Out
* Fade In + Out
* Wave
* Kinetic
* Scale
* Pop
* Blur In
* Slide
* Typewriter
* Bounce
* Glow
* Highlight
* Pulse

Effect harus modular.

Contoh:

Lyrics Type = Word by Word
+
Effect = Fade In

atau:

Lyrics Type = Paragraph
+
Effect = Wave

atau:

Lyrics Type = Single Line
+
Effect = Kinetic

Perubahan Effect tidak boleh mengubah Lyrics Type.

Perubahan Lyrics Type tidak boleh mengubah Effect.

---

# IMPORTANT BEHAVIOR

Default lyrics harus:

* static
* solid
* stable
* crisp
* predictable
* no unwanted movement

Animation hanya terjadi jika user memilih Effect.

JANGAN otomatis memberikan animation pada Lyrics Type.

Contoh yang SALAH:

Word by Word
→ setiap kata bergerak, membesar, bergeser, atau bouncing.

Contoh yang BENAR:

Word by Word
→ kata muncul satu per satu pada posisi tetap.

Kemudian:

Word by Word + Fade In
→ kata muncul satu per satu dengan opacity transition.

Word by Word + Kinetic
→ kata muncul satu per satu dengan kinetic animation yang berasal dari Effect layer.

---

# CAPCUT-LIKE UX

Struktur UI harus terasa seperti text animation workflow di CapCut.

Gunakan struktur:

TEXT
├── Lyrics Type
│   ├── Single Line
│   ├── Multi Line
│   ├── Paragraph
│   ├── Word by Word
│   ├── Character
│   ├── Karaoke
│   └── Progressive
│
└── Lyrics Effect
├── None
├── Fade
├── Wave
├── Kinetic
├── Scale
├── Pop
├── Blur
├── Slide
├── Typewriter
└── Custom

Lyrics Type = CONTENT / DISPLAY BEHAVIOR

Lyrics Effect = ANIMATION / VISUAL BEHAVIOR

---

# ANIMATION SYSTEM

Implement animation using a predictable timeline system.

Every effect should have:

* duration
* delay
* easing
* intensity
* direction
* stagger
* loop (when applicable)

Provide sensible defaults.

Avoid excessive animation.

Typography should remain readable even when effects are enabled.

For lyric videos, readability has priority over animation.

---

# REFERENCE STYLE

The visual direction should resemble modern lyric videos and CapCut typography presets:

* bold typography
* strong hierarchy
* stable positioning
* clean spacing
* minimal movement
* emphasis through scale / opacity / weight / color
* animation used as accent, not as the identity of the text

The system should feel professional rather than “AI-generated animated text”.

---

# REQUIRED RESULT

Refactor the current implementation so that:

1. Lyrics Type and Lyrics Effect are completely independent.
2. Word by Word no longer causes unwanted shaking/movement.
3. Text remains stable by default.
4. Animation only comes from Effects.
5. Multiple Types and Effects can be combined.
6. Existing lyric synchronization must continue working.
7. Existing typography settings must remain intact.
8. UI clearly communicates the difference between Type and Effect.
9. Preview must render exactly the same behavior as the final export.
10. Architecture should make adding new Types or Effects easy without rewriting the existing system.

Do not create unnecessary animation.

Prioritize:
READABILITY → STABILITY → SYNCHRONIZATION → EFFECTS.
 settings must update the preview using the existing state/update mechanism:

Watermark Type
Watermark Source
Position
Size
Opacity
Glass/Plain Style
Watermark Animation
Fade In Toggle
Fade Out Toggle
Fade In Duration
Fade Out Duration

Seeking must remain deterministic.

Test:

play
→ seek forward
→ pause
→ seek backward
→ play again

The rendered visual state must correspond to the exact playhead time.

22. PREVIEW MUST NOT DEPEND ON CSS ELAPSED TIME

Do not rely on browser CSS animation elapsed time as the semantic source of truth.

Bad:

click preset
→ CSS animation starts
→ timeline seeks
→ CSS animation remains at unrelated elapsed time

Correct:

project currentTime changes
→ animation resolver calculates visual state
→ renderer displays state for currentTime

This matters for timeline editing and seeking.

23. EXPORT REQUIREMENTS

Final export must include all enabled features:

Fade In
Fade Out
Video Watermark
Text Watermark

Do not silently skip configured layers.

Preview and export should use the same logical timeline calculations.

24. PERFORMANCE REQUIREMENTS

Avoid unnecessary per-frame work.

Video watermark

Reuse loaded video resources.

Do not re-decode or recreate the watermark from scratch for every frame when the renderer can reuse the media resource.

Text watermark

Cache static text layout.

Animate only the properties that need to change:

opacity

transform

filter when supported

Do not rebuild text geometry every frame.

Fade transitions

Use a simple opacity/compositing calculation.

Do not generate full-screen image assets for every frame.

25. TEST MATRIX

Create or update tests for:

Fade In

start
→ black

midpoint
→ partially visible

end
→ fully visible

Fade Out

before transition
→ normal

midpoint
→ partially black

end
→ black

Video watermark

Test:

load
position
size
opacity
start/end range
looping

Text watermark

Test:

text input
position
size
opacity
style
animation

Glass

Verify:

Plain output
≠
Glass output

Timeline

Test:

before start
inside range
at end
after end

Regression

Ensure the following still work:

lyrics

text animation

background

audio

preview

export

26. VISUAL ACCEPTANCE TEST

Use a real project and manually verify the following.

Test A — Fade In

Enable Fade In and restart preview.

Expected:

black
→ visual appears gradually

Test B — Fade Out

Jump near the end of the video.

Expected:

visual
→ black

Test C — Video Watermark

Upload a short .mp4.

Expected:

watermark visible
→ loops correctly
→ remains in configured position

Test D — Text Watermark

Enter:

@username

Expected:

text appears
→ opacity works
→ position works

Test E — Glass

Enable Glass.

Expected:

subtle translucent glass treatment

Test F — Rain

Inspect the existing Rain Overlay implementation.

If it is not genuinely functional:

Rain UI removed.

27. NO DUMMY IMPLEMENTATIONS

Forbidden:

button selected
→ state changes
→ renderer ignores it

Forbidden:

opacity slider
→ label changes
→ watermark stays identical

Forbidden:

Fade In enabled
→ no black overlay in renderer

Forbidden:

video watermark uploaded
→ preview shows it
→ export omits it

Every visible setting must have a direct path to the rendering result.

28. CLEANUP

Remove obsolete code related to the old watermark URL/data-URL workflow.

Remove Rain Overlay only if the investigation determines it is not worth fixing.

Do not leave:

dead UI

dead imports

unreachable renderer branches

duplicate state fields

obsolete watermark URL logic

unused effect controls

Run typecheck/lint/build after cleanup.

29. FINAL VERIFICATION REPORT

After implementation report exactly:

ROOT CAUSE

What was disconnected or broken.

CHANGES

Files changed and why.

VIDEO TRANSITIONS

Fade In:
working / not working

Fade Out:
working / not working

WATERMARK

Video:
working / not working

Text:
working / not working

Glass:
working / not working

RAIN

fixed
or
removed

PREVIEW

verified / not verified

EXPORT

verified / not verified

TESTS

typecheck:
lint:
build:
runtime/manual:

Do not report success based only on state changes.

Success requires visible renderer output.

30. DEFINITION OF DONE

[ ] Fade In visibly starts from black.
[ ] Fade Out visibly ends in black.
[ ] Fade durations affect timing.
[ ] Video watermark uploads successfully.
[ ] Video watermark loops correctly.
[ ] Video watermark position/size/opacity work.
[ ] Text watermark accepts arbitrary text.
[ ] Text watermark opacity works.
[ ] Text watermark position/size works.
[ ] Glass style visibly changes the text watermark.
[ ] Watermark appears in preview.
[ ] Watermark appears in export.
[ ] Preview and export use the same timeline calculations.
[ ] Rain is genuinely functional OR completely removed.
[ ] Old image URL/data URL watermark UI is removed.
[ ] No visible dummy controls remain.
[ ] Typecheck passes.
[ ] Lint passes.
[ ] Production build passes.

REFERENCES / IMPLEMENTATION CONCEPTS

Use these as implementation references, not as a requirement to copy their UI or animation style.

Adobe After Effects — text animators and selectors:
https://helpx.adobe.com/after-effects/desktop/animating-text/text-animation/animating-text.html

GSAP SplitText — splitting text into words/chars:
https://gsap.com/docs/v3/Plugins/SplitText/

GSAP Tween / stagger:
https://gsap.com/docs/v3/GSAP/Tween/

Remotion — TikTok-style captions:
https://www.remotion.dev/docs/captions/create-tiktok-style-captions

MDN — Web Animations API:
https://developer.mozilla.org/en-US/docs/Web/API/Web_Animations_API

MDN — Animation.currentTime:
https://developer.mozilla.org/en-US/docs/Web/API/Animation/currentTime

Use the architectural ideas:

timeline time
→ resolve state
→ render visual layer

Do not blindly copy external implementation details.

EXISTING PROJECT CONTEXT

The existing rendering specification already expects a dedicated text-animation abstraction where animation receives lyric start/end time, current time, animation progress, and text layout.

Preserve that architecture.

The project should converge on:

SETTING
→ STATE
→ TIMELINE
→ LAYER RESOLVER
→ RENDERER
→ PREVIEW
→ EXPORT

Every requested feature must complete this chain.

CORE PRINCIPLE

Do not optimize for the number of effects shown in the UI.

Optimize for:

REAL FEATURE
→ REAL STATE
→ REAL TIMELINE
→ REAL RENDER
→ REAL PREVIEW
→ REAL EXPORT

A smaller working system is preferable to a larger system containing placeholder effects.