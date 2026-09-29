<div align="center">

<img src="https://img.shields.io/badge/-LYRICS%20MOTION%20GENERATOR-1a1410?style=flat-square&labelColor=1a1410" alt="" height="28"/>

# A browser-based editing suite that turns timestamped lyrics into cinematic 9:16 videos — no backend, no render farm, no dropped frames.

Every video is composited offscreen and encoded frame-by-frame with WebCodecs, so playback speed never affects export quality. Built solo, end to end: parsing, sync, motion design, and deterministic MP4 export.

</div>

<br/>

<table width="100%">
<tr>
<td width="70%" valign="top">

### The problem it solves

Lyric videos are usually made in desktop motion software or by screen-recording a preview — both introduce dropped frames and require an app most casual creators don't have. This tool replaces both with a pipeline that runs entirely in a tab: import lyrics and audio, sync them to the waveform, design the look, and export a broadcast-safe MP4 that renders identically every time.

</td>
<td width="30%" valign="top">

**Stack**
<br/>
React 19 · TypeScript 6
<br/>
Vite 8
<br/>
WebCodecs + `mp4-muxer`
<br/>
Web Audio API

</td>
</tr>
</table>

---

## Engineering highlights

These are the parts that don't show up in a feature list but are where the actual difficulty lives.

**Deterministic export, not screen capture**
`video-exporter.ts` never plays the canvas in real time. It advances `currentTime = frameIndex / fps`, draws each frame to an offscreen canvas, and hands it to `VideoEncoder` directly. The output is byte-identical regardless of the machine it renders on — a live-recording approach can't make that guarantee.

**One timing model, one render path**
Preview, timeline and export resolve their output range through a single pure resolver (`lib/timeline/output-range.ts`) and build frames through a shared `createRenderContext` (`lib/render/render-context.ts`), so the preview and the exported MP4 resolve the same visual state at the same time. When audio is present it is the authoritative playback clock — the canvas reads `audio.currentTime` each frame rather than accumulating its own, so it can't drift from what you hear. Grain is seeded (`lib/render/determinism.ts`), so the same project renders the same texture every session.

**Export plan + codec probing**
An `ExportPlan` (`lib/render/export-plan.ts`) is computed once and threaded through the pipeline; frame timestamps come from the integer frame index so they never drift. Before rendering starts the exporter probes H.264 profiles (`avc1.640028 → 4D4028 → 42E028`) and AAC support, so an unsupported codec fails fast with an actionable error instead of rendering the whole video and failing at the mux. Cancellation is honoured in every phase (render, audio, encode, finalize).

**Lyric chunking that respects rhythm, not just character count**
`lyric-chunker.ts` splits raw LRC lines into 3–5 word visual blocks using a 42-character threshold, but it weighs punctuation and conjunctions before it cuts — so a line breaks where a singer would breathe, not wherever the character count runs out.

**A compositor built for reuse, not just output**
`LayerCompositor` sequences background, typography motion, procedural rain, and watermark layers through shared caches (`TextMeasurementCache`, `getNoiseCanvas`), so a 60fps export at 1080×1920 isn't re-measuring the same text hundreds of times.

**Zero backend, by design**
Lyrics search hits the public LRCLIB API directly from the client. Everything else — audio decoding, sync, rendering, export — happens on-device. There's no server to reason about, which was a constraint, not a shortcut.

---

## What it actually does

| Stage | Capability |
|---|---|
| **Import** | Standard LRC, word-level enhanced LRC, plain TXT, or LRCLIB search — plus energy-based auto-sync for untimed lyrics |
| **Sync** | Waveform-driven timeline: nudge, split, merge, and apply global offset to any line |
| **Design** | 7 editorial presets (`Deep Forest`, `Midnight Vintage`, `Olive Editorial`...), 4 serif typefaces, procedural grain and vignette |
| **Motion** | 8 text-reveal presets — word-by-word, mask reveal, tracking reveal, blur-to-sharp — plus procedural rain and watermark layers |
| **Validate** | Pre-flight audit blocks broken exports (negative duration, missing timestamps) and warns on quality issues (overlap, overflow) before you spend render time |
| **Export** | 720p or 1080p, 24/30/60fps, 5–12 Mbps, muxed audio, with a MediaRecorder fallback for non-Chromium browsers |

---

## How a project moves through the app

```
Create → Import lyrics + audio → Sync to waveform → Design & animate → Preview → Pre-flight audit → Export MP4
```

Each stage is a full page, not a modal — timeline edits, design choices, and motion settings all persist in one project state and serialize to a portable JSON file.

---

## Run it locally

```bash
npm install
npm run dev      # → http://localhost:5173
```

Requires Node 18+ and a Chromium-based browser (WebCodecs support). No `.env` file — LRCLIB requests are made directly from the browser, and WebCodecs needs a secure context, so use HTTPS in production or `localhost` in dev.

```bash
npm run build     # production build → dist/
npm test          # Vitest suite
npm run lint       # Oxlint
```

<details>
<summary><strong>Source layout</strong></summary>

```text
src/
├── App.tsx                 # Centralized project state
├── components/pages/        # Projects · Lyrics · Timeline · Design · Preview · Export
└── lib/
    ├── audio/               # Decoding, waveform peaks, energy alignment
    ├── lyrics/               # LRC / enhanced LRC / TXT parsing
    ├── sync/                 # Timestamp editing, offsets
    ├── layout/               # Lyric chunking
    ├── motion/               # Text animation presets
    ├── layers/               # Rain, watermark, compositor
    ├── render/               # Render context · export plan · codec probing · seeded noise · offscreen canvas → WebCodecs → mp4-muxer
    ├── timeline/             # Output-range resolver · timeline model · snapping · timing-edit helpers
    ├── project/              # Snapshot hashing for dirty-state tracking
    └── validation/           # Pre-flight audit rules
```

</details>

---

## Current scope

Positioning and safe margins are tuned for 9:16 — 1:1 and 16:9 exist as types but aren't laid out yet. MP4 via WebCodecs is the primary path; MediaRecorder/WebM is the fallback for browsers without WebCodecs support.

**Known limitations / follow-ups**
- **Worker rendering is scaffolded, not enabled.** The message protocol and `canUseOffscreenCanvas()` feature detection exist (`lib/render/worker-protocol.ts`), but rendering still runs on the main thread because the grain/texture helpers use DOM-only canvas APIs that must be ported to `OffscreenCanvas` first. The main-thread path is the verified default.
- **Project files remain schema v1.** The normalized `ProjectDocumentV2` + migration described in the refactor plan is not implemented yet, so the version stays on the 1.x line until that lands.
- **Waveform** now renders to `<canvas>` (`components/WaveformCanvas.tsx`); the responsive/mobile-lite layout pass is still outstanding.

---

<div align="center">

**SYTE** — [github.com/SYTE001](https://github.com/SYTE001) · [bayualif828@gmail.com](mailto:bayualif828@gmail.com)
<br/>
<sub>Repository: <a href="https://github.com/SYTE001/Thisck">SYTE001/Thisck</a></sub>

</div>
