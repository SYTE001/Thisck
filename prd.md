# PRD: AI Automatic Lyrics-Audio Synchronization (Forced Alignment)

**Project:** Thisck (Lyrics Motion Generator)  
**Target:** Implementation Guide for AI Agent / Developer  
**Status:** Ready for Implementation  
**Feature:** Automatic Lyrics & Audio Sync (Word & Line Level Alignment)

---

## 1. Problem Statement & Objectives

### 1.1 The Problem
Saat ini pengguna harus mengatur sinkronisasi baris lirik dengan lagu secara manual di timeline. Proses manual memakan waktu lama, rawan meleset akibat latensi audio browser, dan sangat sulit untuk menghasilkan timestamp tingkat kata (*word-by-word timestamps*) yang presisi untuk animasi tipe Karaoke atau Kinetic.

### 1.2 Objective
Membangun fitur **Full-Auto Lyrics Sync** yang dapat:
1. Menerima file audio (`.mp3`, `.wav`, `.m4a`) dan teks lirik mentah (tanpa timestamp / plain text).
2. Memproses audio menggunakan model AI Speech Recognition / Forced Alignment.
3. Menghasilkan timestamp presisi tinggi per-baris (`LyricLine.startTime`, `endTime`) dan per-kata (`Word.startTime`, `endTime`).
4. Menjaga integritas teks asli pengguna (ejaan, huruf kapital, tanda baca) sambil mengadopsi timing dari audio.
5. Berjalan secara non-blocking (UI tetap responsif selama proses berlangsung).

---

## 2. Technical Architecture & Approach

Sistem mengadopsi arsitektur **Hybrid Client-First** yang fleksibel:

```
┌────────────────────────────────────────────────────────┐
│                   User Input                           │
│     (Audio File + Raw Lyrics / Untimed Lines)          │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│                 Audio Preprocessor                     │
│  • Resample to 16kHz Mono Float32Array                 │
│  • Web Audio API (OfflineAudioContext)                 │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│             Alignment Engine Strategy                  │
│                                                        │
│  [Primary: In-Browser Web Worker]                      │
│  • @huggingface/transformers (Whisper ONNX / WebGPU)   │
│  • Zero-backend, 100% on-device                        │
│                                                        │
│  [Alternative: Fast API Endpoint / Bring-Your-Own-Key] │
│  • Groq / OpenAI Whisper Timestamped API               │
│  • Super fast (1-2 detik) via user API key             │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│         Fuzzy Text Aligner & Interpolator              │
│  • Levenshtein / Dynamic Time Warping (DTW)            │
│  • Maps audio timestamps back to original user text    │
│  • Assigns line bounds & word segments                 │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│        Output: Normalized `LyricLine[]` + `Word[]`     │
│        source = 'SOURCE_AUDIO_ALIGNMENT'               │
└────────────────────────────────────────────────────────┘
```

---

## 3. Data Contract & Model Specification

Output harus sesuai dengan skema eksisting `src/types/lyrics.ts`:

```typescript
export interface Word {
  id: string;
  text: string;
  startTime: number; // Detik (desimal, e.g. 12.45)
  endTime: number;   // Detik (desimal, e.g. 12.85)
  confidence?: number;
  type?: LyricType;
}

export interface LyricLine {
  id: string;
  text: string;
  startTime: number; // Detik
  endTime: number;   // Detik
  words?: Word[];    // Timestamp per kata untuk animasi Word-by-Word / Karaoke
  confidence?: number;
  source: 'SOURCE_AUDIO_ALIGNMENT';
  sourceFormat?: SourceFormat;
  originalText?: string;
  generatedBy?: 'audio-sync';
}
```

---

## 4. Key Functional Modules to Implement

### Module 1: Audio Preprocessor (`src/lib/audio/audio-resampler.ts`)
* **Tugas:** Menyiapkan audio untuk speech engine.
* **Spesifikasi:**
  * Gunakan `OfflineAudioContext` untuk decode audio file menjadi `AudioBuffer`.
  * Konversi channel menjadi **Mono (1 Channel)**.
  * Resample sample rate menjadi **16000 Hz (16 kHz)** (standar input Whisper/Wav2Vec).
  * Ekstrak `Float32Array` data audio.

### Module 2: AI Alignment Provider (`src/lib/sync/ai-aligner.ts`)
* **Dua Mode Eksekusi:**
  1. **Local Worker Mode (Default on-device):**
     * Memanfaatkan `@huggingface/transformers` (model `onnx-community/whisper-tiny` atau `whisper-base`).
     * Dijalankan di dalam Web Worker (`src/lib/sync/worker/aligner.worker.ts`) agar thread UI tidak *freeze*.
     * Output: Token-level / Word-level timestamps dari model.
  2. **API Mode (Opsional / Fast Mode):**
     * Input: API Key (OpenAI / Groq) dari modal settings pengguna.
     * Mengirim potongan audio ke API `v1/audio/transcriptions` dengan format `verbose_json` & `timestamp_granularities=word`.

### Module 3: Fuzzy Text-to-Audio Aligner (`src/lib/sync/text-matcher.ts`)
* **Tugas:** Menjaga teks lirik asli pengguna tidak berubah atau typo oleh AI.
* **Mekanisme:**
  * Lakukan pencocokan teks menggunakan algoritma string similarity (Levenshtein Distance / Needleman-Wunsch).
  * Pasangkan setiap kata dari teks input asli pengguna dengan timestamp kata dari hasil transkripsi AI.
  * Jika ada kata yang terlewat oleh AI, lakukan interpolasi linier berdasarkan durasi kata sebelum dan sesudahnya.
  * Hitung `startTime` dan `endTime` untuk setiap baris (`LyricLine`) berdasarkan rentang kata pertama dan kata terakhir pada baris tersebut.

### Module 4: UI / UX Integration
* **Komponen & Halaman:**
  1. **Tombol "AI Auto Sync"** di toolbar sinkronisasi (`LyricsPage` / `TimelinePage`).
  2. **Progress Modal / Dialog:**
     * Status bar: `[1/3] Preparing audio (16kHz)...` → `[2/3] Analyzing vocal waveforms & AI Alignment...` → `[3/3] Matching lyrics & building word timestamps...`.
     * Tombol `Cancel` untuk menghentikan proses.
  3. **Global Offset Quick-Tweak Bar:**
     * Setelah auto-sync selesai, sediakan slider cepat `Offset (± ms)` (misal -500ms s/d +500ms) untuk fine-tuning latensi audio output browser jika diperlukan.
  4. **Visual Indicator:**
     * Badge status `SOURCE_AUDIO_ALIGNMENT` pada baris yang berhasil di-sync otomatis.

---

## 5. Step-by-Step Implementation Roadmap for Agent

### Phase 1: Dependencies & Audio Preprocessing
1. Install `@huggingface/transformers` (atau siapkan struktur Web Worker & fetch client).
2. Buat helper `src/lib/audio/audio-resampler.ts`:
   * Fungsi `prepareAudioForWhisper(audioFile: File | ArrayBuffer): Promise<Float32Array>`.

### Phase 2: Web Worker & AI Engine
1. Buat `src/lib/sync/worker/aligner.worker.ts`:
   * Inisialisasi pipeline Automatic Speech Recognition dengan mode `return_timestamps: 'word'`.
   * Kirim pesan progress ke main thread (`{ type: 'progress', percent: number, stage: string }`).
2. Buat adapter `src/lib/sync/ai-aligner.ts` yang mengelola lifecycle Web Worker.

### Phase 3: Fuzzy Alignment Algorithm
1. Buat `src/lib/sync/text-matcher.ts`:
   * Fungsi `alignLyricsWithTranscription(rawLyricsLines: string[], recognizedWords: Array<{word: string, start: number, end: number}>): LyricLine[]`.
   * Tangani baris kosong, ad-lib, serta jeda antar verse/chorus.

### Phase 4: UI Integration & State Handling
1. Tambahkan state `isAligning`, `alignmentProgress`, dan modal di `src/components/pages/LyricsPage.tsx` atau komponen editor timeline terkait.
2. Hubungkan hasil auto-sync ke store project state (`setLyricLines(alignedLines)`).
3. Pastikan waveform timeline ter-update dengan timestamp baru.

### Phase 5: Verification & Tests
1. Unit test `text-matcher.ts` dengan skenario lirik pendek, lirik berulang (chorus), dan lirik dengan tanda baca.
2. Uji playback preview: pastikan animasi teks (Word by Word / Karaoke) menyala sinkron dengan audio.
3. Uji export MP4: pastikan WebCodecs render context membaca timestamp baru tanpa desync.

---

## 6. Edge Cases & Error Handling

| Kondisi | Penanganan Sistem |
|---|---|
| **Audio Instrumental Panjang (Intro/Solo)** | Aligner harus mendeteksi rentang hening/vokal kosong dan tidak memaksakan lirik pertama mulai di detik ke-0. |
| **Bahasa Non-Inggris / Campuran** | Gunakan model multilingual Whisper (`multilingual: true`) dengan auto language detection. |
| **Vocal Mix Tenggelam (Banyak Beat/Distorsi)** | Fallback ke interpolasi linier untuk kata dengan confidence rendah dan beri peringatan kuning di UI. |
| **User Menutup Tab / Klik Cancel** | Worker di-terminate (`worker.terminate()`) agar memory dibebaskan. |

---

## 7. Success Metrics
* Pengguna tidak perlu menggeser bar timeline manual dari awal untuk lagu baru.
* Deviasi akurasi timestamp rata-rata di bawah **±100ms** terhadap vokal asli.
* Word-level timestamps tersedia lengkap untuk mengaktifkan seluruh animasi visual lirik.
