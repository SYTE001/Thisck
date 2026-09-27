# Lyrics Motion Generator

A client-side web application for designing, synchronizing, and rendering editorial short-form lyric motion videos with deterministic frame-by-frame MP4 export.

## Overview

Lyrics Motion Generator is an in-browser tool that converts synchronized lyrics (standard LRC, word-level enhanced LRC, or plain text) and audio into vertical (9:16) editorial lyric videos optimized for short-form platforms (TikTok, Instagram Reels, YouTube Shorts).

Producing typography-focused lyric videos traditionally requires desktop motion graphics software (such as Adobe After Effects) or real-time canvas screen captures that suffer from frame drops and jitter. This application solves that problem by running an end-to-end editorial pipeline in the browser: from lyric ingestion and audio waveform inspection to deterministic visual chunking, customizable motion layers, and frame-by-frame MP4 rendering via the WebCodecs API and `mp4-muxer`.

## Features

- **Multi-Format Lyrics Ingestion & Parsing**:
  - Standard timestamped LRC (`[mm:ss.xx]`) with ID3/LRC metadata parsing (`ti`, `ar`, `al`).
  - Word-level enhanced LRC (`[mm:ss.xx]word<mm:ss.xx>`) for syllable/word synchronization.
  - Plain un-timed TXT ingestion.
  - JSON project session export and import.
  - Integration with the public LRCLIB API (`https://lrclib.net`) to search and fetch synchronized lyrics by track and artist.
- **Audio Processing & Synchronization**:
  - In-browser audio decoding via Web Audio API (`AudioContext.decodeAudioData`).
  - Waveform peak generation (300-point resolution) for timeline display.
  - Energy/onset-based audio alignment for estimating timestamps on untimed lyrics.
- **Editorial Layout & Typography Engine**:
  - Automatic visual chunking splitting lyrics into 3–5 word blocks (42-character threshold) based on punctuation and conjunctions.
  - Safe margins (68–72% width boundary) to prevent text clipping on mobile viewports.
  - Pre-built editorial styling presets (Deep Forest, Olive Editorial, Sand Paper, Off White Editorial, Editorial Burgundy, Cream Editorial, Midnight Vintage) and custom typography controls (Cormorant Garamond, Playfair Display, DM Serif Display, Libre Baskerville).
  - Procedural film grain, vignette, and optional 4-point editorial star ornament.
- **Motion & Compositing Layers**:
  - 8 text animation presets: Slide Up, Slide Down, Fade Only, Scale In, Blur to Sharp, Tracking Reveal, Word by Word, Mask Reveal.
  - Procedural rain particle overlay with density, speed, opacity, angle, and time range controls.
  - Customizable watermark overlay (supporting image URL / Data URL, placement, scale, opacity, and subtle animation presets).
  - Offscreen canvas layer compositor and text measurement caching.
- **Interactive Multi-Track Timeline**:
  - Real-time playhead synchronization with audio playback.
  - Millisecond nudge controls (+/- 50ms, +/- 100ms, +/- 250ms), manual timestamp editing, line splitting, and line merging.
  - Global offset shifts across all timed lines.
  - Output trimming modes: AUTO, AUDIO, LYRICS, and MANUAL/CUSTOM.
- **Pre-Flight Quality Validation**:
  - Automated audit checking for blocking issues (missing timestamps, duration <= 0, inverted start/end times, negative timestamps, out-of-order timestamps).
  - Non-blocking quality warnings (line overlaps, long instrumental gaps, word boundary overflows, excessively long lines).
- **Deterministic Video Exporter**:
  - Frame-by-frame offline rendering pipeline preventing dropped frames.
  - Hardware-accelerated WebCodecs (`VideoEncoder`) paired with `mp4-muxer` for direct `.mp4` generation.
  - Output resolution presets: 1080x1920 (9:16 Full HD) and 720x1280 (9:16 HD).
  - Frame rate presets: 24, 30 (default standard), and 60 FPS.
  - Bitrate selection (5,000 to 12,000 kbps).
  - Optional audio track muxing into the final MP4 container.
  - Fallback exporter using `MediaRecorder` for environments without WebCodecs support.

## Tech Stack

- **Frontend**: React 19 (`react`, `react-dom`), TypeScript 6
- **Build & Development**: Vite 8, `@vitejs/plugin-react`
- **Video & Audio Processing**: WebCodecs API (`VideoEncoder`), `mp4-muxer`, Web Audio API (`AudioContext`, `AudioBuffer`)
- **Styling/UI**: Vanilla CSS (`src/index.css`, `src/App.css`), Lucide React (`lucide-react`)
- **External Services**: LRCLIB REST API (`https://lrclib.net/api`) for synchronized lyrics search
- **Testing & Quality Assurance**: Vitest (`vitest`), Oxlint (`oxlint`), TypeScript compiler (`tsc`)
- **Backend / Database / Authentication**: None (100% client-side, zero backend dependencies)

## Project Structure

```
konten/
├── index.html                    # Single-page application HTML entry point
├── package.json                  # Dependencies, scripts, and package metadata
├── tsconfig.json                 # TypeScript project configuration
├── vite.config.ts                # Vite build and plugin setup
├── .oxlintrc.json                # Oxlint linter configuration
├── public/                       # Static public assets
└── src/
    ├── main.tsx                  # Application bootstrap entry point
    ├── App.tsx                   # Main state store, global listeners, and tab routing
    ├── App.css                   # Layout-specific CSS rules
    ├── index.css                 # Comprehensive design system, CSS variables, and components
    ├── types/
    │   ├── lyrics.ts             # Type definitions for lyrics, timing sources, words, and validation
    │   └── project.ts            # Type definitions for style config, export settings, and project state
    ├── components/
    │   ├── Navigation.tsx        # Top navigation bar and session actions
    │   └── pages/
    │       ├── ProjectsPage.tsx  # Project metadata, sample track loader, and JSON session management
    │       ├── LyricsPage.tsx    # Lyrics editor, file dropzone, LRCLIB search, and audio alignment
    │       ├── TimelinePage.tsx  # Interactive waveform timeline with line timing adjustments
    │       ├── DesignPage.tsx    # Style preset picker, typography, colors, and layout settings
    │       ├── PreviewPage.tsx   # Real-time cinema player and output range selector
    │       ├── ExportPage.tsx    # Pre-flight audit, motion layers, and MP4 render controls
    │       └── SettingsPage.tsx  # Global export settings and defaults
    └── lib/
        ├── audio/                # Audio decoding, waveform peak extraction, and onset energy alignment
        ├── data/                 # Demo track fixtures (LRC, enhanced LRC, plain TXT)
        ├── layers/               # Rain overlay and watermark motion layer implementations
        ├── layout/               # Visual lyric chunking algorithm and line-breaking rules
        ├── lyrics/               # Parsers and serializers for LRC, TXT, and JSON formats
        ├── motion/               # Adaptive lyric motion and transition calculations
        ├── render/               # Canvas rendering engine, WebCodecs exporter, compositor, and cache
        ├── styles/               # Curated editorial style presets
        ├── sync/                 # LRCLIB API client integration
        ├── timeline/             # Timeline manipulation utilities (nudge, split, merge, offset)
        ├── validation/           # Quality audit and pre-flight validation rules
        └── __tests__/            # Vitest unit test suites for chunker, parser, timeline, and layers
```

## Getting Started

### Prerequisites

- **Node.js**: Node.js 18.0.0 or higher is recommended.
- **Browser**: Modern Chromium-based browser (Google Chrome 94+, Microsoft Edge 94+, Brave, etc.) supporting the WebCodecs API (`VideoEncoder`) for MP4 export.
- **npm**: npm 9+ (or compatible package manager).

### Installation

Clone the repository and install dependencies:

```bash
npm install
```

### Environment Variables

This application runs entirely in the browser and does not consume or require any environment variables. All public API requests (such as LRCLIB lyrics lookup) are executed directly via client-side `fetch`.

| Variable | Purpose | Required |
| -------- | ------- | -------- |
| None     | No environment variables are used or required by this project | No |

### Development

Run the local development server with Hot Module Replacement (HMR):

```bash
npm run dev
```

The application will be accessible at `http://localhost:5173`.

### Production Build

Run TypeScript type-checking and create an optimized production build:

```bash
npm run build
```

Preview the production build locally:

```bash
npm run preview
```

Run unit tests:

```bash
npm test
```

Run the linter:

```bash
npm run lint
```

## Usage

1. **Projects Tab**: Create a new project, load sample data (Standard LRC, Word-Level Enhanced LRC, or Plain TXT), or import/export a `.json` project file. Configure track title, artist name, and album.
2. **Lyrics Tab**: Ingest lyrics by uploading an `.lrc` or `.txt` file, typing manually, or searching the public LRCLIB database. If starting with un-timed plain text, upload an audio file to execute automated audio-to-lyrics energy alignment.
3. **Timeline Tab**: Inspect the lyrics alongside the decoded audio waveform. Adjust individual line start and end timestamps, nudge lines by milliseconds (+/- 50ms, 100ms, 250ms), split long phrases, merge adjacent lines, or apply a uniform global offset.
4. **Design Tab**: Choose an editorial theme preset or customize background colors, serif typography, font size ratio, line height, letter spacing, alignment, grain, vignette, and star decorations.
5. **Preview Tab**: Preview playback in real time with the cinema player. Adjust playback speed (0.5x–2.0x), step between lines, and verify the active output range (Auto, Audio, Lyrics, or Custom).
6. **Export Tab**: Verify the Pre-Flight Quality Audit to confirm that all lines are timed and valid. Configure motion layers (text animation preset, rain particle overlay, watermark), select export parameters (resolution, frame rate, bitrate, audio inclusion), and initiate MP4 rendering. The completed video downloads automatically to your machine.

## Architecture / Implementation

- **Deterministic Offline Rendering**: Instead of capturing live canvas frames via screen recording (which causes dropped frames if the machine lags), `video-exporter.ts` advances timestamps deterministically frame by frame (`currentTime = frameIndex / fps`). Each frame is drawn to an offscreen canvas and encoded using the browser's native `VideoEncoder` via WebCodecs, then packaged into an MP4 container using `mp4-muxer`.
- **Decoupled Visual Chunking**: LRC lines often span long sentences that wrap awkwardly on 9:16 mobile displays. `lyric-chunker.ts` splits phrases into clean visual blocks (3–5 words, 42-character threshold) based on punctuation, conjunctions, and rhythm, preserving timing continuity without previous-lyric ghosting.
- **Layer Compositor Pipeline**: The rendering stack uses an offscreen compositor (`LayerCompositor`) that sequences background effects (grain/vignette), text animation transforms, procedural particle overlays (rain simulation), and brand watermarks with dedicated cache invalidation (`TextMeasurementCache`, `getNoiseCanvas`).
- **State Management & Persistence**: Project state (lyrics, metadata, styling, export configuration, and motion layer settings) is managed via centralized React state in `App.tsx` and can be serialized to a portable JSON schema (`exportProjectToJson`).

## Deployment

Because this project is a purely static single-page application (SPA) with no backend or database dependencies, it can be deployed to any static hosting provider:

- Build output is placed in the `dist/` directory via `npm run build`.
- Compatible with platforms such as GitHub Pages, Vercel, Netlify, Cloudflare Pages, or AWS S3.
- **Important**: WebCodecs requires a Secure Context (`https://` or `http://localhost`). Ensure production deployments serve over HTTPS.

## Current Status

- **Implemented**:
  - Full LRC, Enhanced LRC, and TXT parsing and serialization.
  - LRCLIB online synchronized lyrics search and retrieval.
  - Web Audio decoding, peak waveform rendering, and energy-based alignment.
  - Visual chunking engine for vertical 9:16 aspect ratio.
  - Timeline editor with nudging, splitting, merging, and global offset.
  - Curated editorial design themes and typography customization.
  - Real-time preview player with speed controls and transport scrubber.
  - Pre-flight quality validation system with blocking error checks.
  - Motion layer compositor with text animation presets, rain overlay, and watermark.
  - Deterministic WebCodecs + mp4-muxer MP4 export with audio inclusion and MediaRecorder fallback.
  - Project file JSON import/export.
- **Partially Implemented**:
  - Aspect ratio types include `1:1` and `16:9` in `ExportSettings`, but typography positioning and safe margin layouts are currently optimized for vertical `9:16`.
  - WebM format is present in type definitions, while the primary export pipeline targets MP4 containers.
- **Planned / TODO**:
  - No pending feature backlog tracked in the repository; the core feature set is fully functional.

## Known Issues

- **WebCodecs Browser Support**: Hardware-accelerated offline MP4 export requires browser support for the WebCodecs API (`VideoEncoder`). While supported in Chromium-based browsers (Chrome, Edge), browsers lacking WebCodecs fall back to `MediaRecorder`, which records in real time and may produce WebM output depending on available browser codecs.

## Development Notes

- **Unit Testing**: Run `npm test` to execute Vitest suites covering lyric chunking, parsing, timeline operations, and motion layer rendering.
- **Linting**: Run `npm run lint` to execute Oxlint.
- **WebCodecs Local Testing**: When developing or testing video exports locally, always use `http://localhost` or an HTTPS connection to meet the browser's Secure Context requirement.

## License

License: Not specified.

## Author

SYTE (<bayualif828@gmail.com>)
Repository: [https://github.com/SYTE001/Thisck](https://github.com/SYTE001/Thisck)
