/**
 * TEXT NORMALIZATION (PRD Module D)
 *
 * Comparison-only canonical forms. The user's original text is NEVER modified —
 * every visible character in the editor/preview/export keeps its raw surface
 * form; these helpers only produce keys used by the alignment scorer.
 *
 * Adapted from the reference implementation's `lyric_text.py` (autolyric-studio):
 * NFKC unicode folding, apostrophe-variant folding, emoji stripping,
 * punctuation stripping (apostrophes kept or dropped), and spoken-number
 * folding so ASR output like "1" can match lyrics written as "one".
 */

const APOSTROPHES = ['\u2018', '\u2019', '\u02bc', '\u055a', '\u2032', '`', '\u00b4'];

// Emoji + symbol ranges that ASR never outputs but lyricists love.
const EMOJI_RE =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{FE0F}]/gu;

const NUMBER_WORDS: Record<string, string> = {
  // English
  zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6',
  seven: '7', eight: '8', nine: '9', ten: '10', eleven: '11', twelve: '12',
  twenty: '20', hundred: '100', thousand: '1000',
  // Bahasa Indonesia
  nol: '0', satu: '1', dua: '2', tiga: '3', empat: '4', lima: '5', enam: '6',
  tujuh: '7', delapan: '8', sembilan: '9', sepuluh: '10', sebelas: '11',
  seratus: '100', seribu: '1000',
};

/** Strips emoji and pictographic symbols ASR can never produce. */
export function stripEmoji(text: string): string {
  return text.replace(EMOJI_RE, '');
}

/** Folds curly/typographic apostrophes onto the ASCII apostrophe. */
export function normalizeApostrophes(text: string): string {
  let out = text;
  for (const ch of APOSTROPHES) out = out.split(ch).join("'");
  return out;
}

/**
 * Canonical comparison form of a token: NFKC, apostrophe variants folded,
 * emoji stripped, lowercased, punctuation removed. With `keepApostrophe`
 * (default) the apostrophe itself is retained ("don't" stays "don't"); with
 * it disabled the apostrophe is dropped too ("dont"), matching how ASR
 * frequently transcribes elisions.
 */
export function canonicalToken(token: string, keepApostrophe = false): string {
  let t = (token ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, ''); // strip diacritics after NFKD decomposition
  t = normalizeApostrophes(t);
  t = stripEmoji(t);
  t = t.toLowerCase();
  t = t.replace(/[^\p{L}\p{N}'\s]/gu, keepApostrophe ? '' : " ");
  if (!keepApostrophe) t = t.replace(/'/g, '');
  t = t.replace(/\s+/g, ' ').trim();
  return NUMBER_WORDS[t] ?? t;
}

/**
 * Splits a raw line into (surface, canonical) pairs. Tokens whose canonical
 * form is empty (pure punctuation, standalone emoji) are dropped — they have
 * no acoustic evidence, and their timing is interpolated from neighbours.
 */
export function tokenizePairs(line: string): Array<{ raw: string; canonical: string }> {
  const pairs: Array<{ raw: string; canonical: string }> = [];
  for (const raw of (line ?? '').trim().split(/\s+/)) {
    if (!raw) continue;
    const canonical = canonicalToken(raw);
    if (canonical) pairs.push({ raw, canonical });
  }
  return pairs;
}

/**
 * Rough "how long would this line take to sing" weight (syllable-ish count),
 * used to distribute untimed lines proportionally when there is no
 * transcription evidence at all.
 */
export function estimateWeight(text: string): number {
  const canonical = canonicalToken(text);
  if (!canonical) return 1;
  const vowels = (canonical.match(/[aeiouáéíóúàèìòù]/g) ?? []).length;
  const words = canonical.split(' ').length;
  return Math.max(words, vowels);
}
