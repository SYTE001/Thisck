/**
 * SMART SPLIT ENGINE — pure, deterministic, no AI, no audio, no DOM.
 *
 * Raw LRC (immutable) -> Auto Arrange (Wrap Only | Smart Split | Audio Sync)
 *                    -> Processed lines -> chunkAllLyricLines / Lyrics Type
 *                    -> Lyrics Effect -> Renderer
 *
 * STRICT RESPONSIBILITY BOUNDARY:
 * This module controls SEGMENTATION and TIMING only. It contains zero animation
 * logic and does not import anything from lyricsEffects.ts, lyricsTypes.ts or
 * animationEngine.ts. Changing the Lyrics Effect can never change segmentation.
 *
 * The existing lib/layout/lyric-chunker.ts is a VISUAL line-wrapper: it breaks a
 * cue's text into 1-3 rendered lines. Smart Split operates one level up and
 * changes which cues exist on the timeline. Because Smart Split already caps a
 * cue at maxWordsPerCue / maxLines x maxCharsPerLine, the chunker can never
 * re-split a processed cue, so one cue always yields exactly one visual block.
 */

import type { LyricLine } from '../../types/lyrics';

// ─── Settings ─────────────────────────────────────────────────────────────────

export interface SmartSplitSettings {
  /** Hard maximum words per generated cue. Never exceeded. */
  maxWordsPerCue: number;
  /** Hard maximum characters per VISUAL line inside a cue. */
  maxCharsPerLine: number;
  /** Hard maximum visual lines per cue (1-3). */
  maxLines: number;
  /** 0-100. Shifts target words/cue and eagerness to split at weak boundaries. */
  splitAggressiveness: number;
  /** true = keep trailing commas; false = strip trailing , ; : from the visible text. */
  preservePunctuation: boolean;
  /** Never merge across original cues, never move an original start/end. */
  preserveOriginalBoundaries: boolean;
  /** Minimum duration of a generated chunk in seconds. */
  minChunkDuration: number;
  /** Cap used when a cue has no end time and no following cue. */
  maxDerivedDuration: number;
  /** Timestamp rounding grid in seconds. */
  timePrecision: number;
  /** Mobile Readability preset: prefers more cues, shorter text, balanced lines. */
  mobileReadability: boolean;
}

export const DEFAULT_SMART_SPLIT_SETTINGS: SmartSplitSettings = {
  maxWordsPerCue: 8,
  maxCharsPerLine: 32,
  maxLines: 3,
  splitAggressiveness: 50,
  preservePunctuation: true,
  preserveOriginalBoundaries: true,
  minChunkDuration: 0.6,
  maxDerivedDuration: 6,
  timePrecision: 0.01,
  mobileReadability: true,
};

export const MOBILE_READABILITY_SETTINGS: SmartSplitSettings = {
  ...DEFAULT_SMART_SPLIT_SETTINGS,
  maxWordsPerCue: 8,
  maxCharsPerLine: 32,
  maxLines: 3,
  splitAggressiveness: 60,
  mobileReadability: true,
};

export interface AutoArrangeLogEntry {
  level: 'info' | 'warning';
  message: string;
  lineId?: string;
}

export interface SmartSplitResult {
  lines: import('../../types/lyrics').LyricLine[];
  log: AutoArrangeLogEntry[];
}

// ─── Lexicon ──────────────────────────────────────────────────────────────────

/** Words that, when a line starts with them, signal a filler / ad-lib cue. */
const FILLER_WORDS = new Set([
  'mmm', 'mm', 'mmm', 'hmm', 'huh', 'oh', 'ooh', 'oofs', 'oooh', 'yeah', 'yeah',
  'yea', 'yep', 'yup', 'aye', 'ay', 'ayy', 'nah', 'nahh', 'hey', 'ho', 'whoa',
  'wow', 'eh', 'ah', 'aah', 'mmmh', 'hm', 'hmm', 'o', 'uh', 'um', 'ahh', 'aw',
  'ayy', 'woah', 'mmm-hmm', 'la', 'lala', 'la-la', 'da', 'dum', 'dada',
]);

/** Conjunctions that legitimately start a new clause. Split BEFORE these. */
const CONJUNCTIONS = new Set([
  'and', 'but', 'or', 'so', 'because', 'when', 'whenever', 'if', 'while', 'till',
  'until', 'cause', "'cause", 'although', 'though', 'unless', 'since', 'whereas',
  'nor', 'yet', 'plus', 'meanwhile',
]);

/** Prepositions that can start a new phrase. Split BEFORE these is acceptable. */
const PHRASE_PREPOSITIONS = new Set([
  'down', 'out', 'up', 'over', 'under', 'through', 'throughout', 'across',
  'around', 'away', 'back', 'along', 'behind', 'beyond', 'into', 'onto', 'upon',
  'with', 'without', 'from', 'for', 'to', 'at', 'on', 'in', 'off', 'about',
  'against', 'between', 'beneath', 'beside', 'during', 'near', 'of', 'past',
  'since', 'toward', 'towards', 'until', 'upon', 'within', 'after', 'before',
]);

/** Determiners/articles: never split between one of these and the noun after it. */
const DETERMINERS = new Set([
  'a', 'an', 'the', 'my', 'your', 'his', 'her', 'their', 'our', 'its', 'this',
  'that', 'these', 'those', 'some', 'any', 'each', 'every', 'no', 'another',
  'neither', 'either', 'both', 'all', 'most', 'much', 'many', 'few', 'little',
]);

/** Tight phrases that must never be broken apart. */
const TIGHT_PHRASES = new Set([
  'hold on', 'give up', 'hold up', 'give in', 'hang on', 'hang up', 'carry on',
  'go on', 'go over', 'go through', 'come back', 'come on', 'come up', 'turn on',
  'turn off', 'turn up', 'turn over', 'pick up', 'put on', 'put off', 'take off',
  'take on', 'take over', 'look up', 'look for', 'look after', 'look out',
  'find out', 'figure out', 'run out', 'run over', 'check out', 'show up',
  'show off', 'wipe out', 'get up', 'get out', 'get on', 'set up', 'set off',
  'a lot of', 'kind of', 'sort of', 'bit of', 'piece of', 'end up', 'ends up',
  'going on', 'let go', 'let down', 'so far', 'at all', 'in love', 'of course',
  'no more', 'over there', 'right now', 'so long', 'well i', 'all along',
]);

/** Words that are never a useful split target because a name follows. */
const NEVER_SPLIT_BEFORE = new Set(['of', 'the', 'a', 'an']);

const STRONG_TRAILING_PUNCT = /[,;:.!?—–-]$/;
const SOFT_TRAILING_PUNCT = /[,;:]$/;
const CLOSERS = /[)\]}'"]$/;
const OPENERS = /[({['\u2018\u201C]$/;
const CONTRACTION_TAIL = /^['\u2019](m|re|ve|ll|d|s|t|re)\b/i;

// ─── Tokenizer ────────────────────────────────────────────────────────────────

/**
 * A token is an indivisible visual unit. Parenthesised groups such as
 * "(oh oh)" are kept as a SINGLE token so we can never break inside them.
 */
interface Token {
  /** Display text including any attached punctuation. */
  raw: string;
  /** Lowercase word form with punctuation stripped, for lexicon lookups. */
  word: string;
  /** True when the token is a real word (not bare punctuation). */
  isWord: boolean;
  /** True when the token starts with an uppercase letter. */
  isCapitalized: boolean;
  /** True when the token is fully wrapped in parentheses/brackets. */
  isParenthetical: boolean;
  /** True when raw ends in strong punctuation (. , ; : ! ? —). */
  endsStrongPunct: boolean;
  /** True when raw ends in a closing bracket. */
  endsClosing: boolean;
  /** True when raw ends in a soft trailing comma/semicolon/colon. */
  endsSoftPunct: boolean;
  /** Number of whitespace-separated words inside this token. */
  wordCount: number;
}

function makeToken(raw: string): Token {
  const trimmed = raw.trim();
  const word = trimmed
    .toLowerCase()
    .replace(/^[^a-z0-9'\u2019]+|[^a-z0-9'\u2019]+$/g, '')
    .replace(/[''\u2019](s|m|d|re|ve|ll|t)$/i, '');
  const isParenthetical = /^[([][^)\]]*[)\]]$/.test(trimmed);
  return {
    raw: trimmed,
    word,
    isWord: word.length > 0,
    isCapitalized: /^[A-Z]/.test(trimmed),
    isParenthetical,
    endsStrongPunct: STRONG_TRAILING_PUNCT.test(trimmed),
    endsClosing: CLOSERS.test(trimmed),
    endsSoftPunct: SOFT_TRAILING_PUNCT.test(trimmed),
    wordCount: isParenthetical ? Math.max(1, trimmed.split(/\s+/).length) : 1,
  };
}

/**
 * Splits text into indivisible tokens. Whitespace-separated, except that a
 * parenthesised / bracketed group always collapses into one token.
 */
export function tokenize(text: string): Token[] {
  const raw = text.trim();
  if (!raw) return [];

  const parts = raw.split(/\s+/);
  const tokens: Token[] = [];
  let buffer: string | null = null;
  let depth = 0;

  for (const part of parts) {
    if (buffer === null) {
      // Start a new token.
      const opens = (part.match(/[([{]/g) || []).length;
      const closes = (part.match(/[)\]}]/g) || []).length;
      if (opens > closes) {
        buffer = part;
        depth = opens - closes;
      } else {
        tokens.push(makeToken(part));
      }
      continue;
    }

    // Inside an open group: always absorb.
    buffer += ` ${part}`;
    depth += (part.match(/[([{]/g) || []).length - (part.match(/[)\]}]/g) || []).length;
    if (depth <= 0) {
      tokens.push(makeToken(buffer));
      buffer = null;
      depth = 0;
    }
  }

  if (buffer !== null) tokens.push(makeToken(buffer));
  return tokens.filter((t) => t.raw.length > 0);
}

function joinTokens(tokens: Token[], settings: SmartSplitSettings): string {
  let text = tokens.map((t) => t.raw).join(' ');
  if (!settings.preservePunctuation) {
    // Strip a trailing soft punctuation mark from the last visible token.
    text = text.replace(/[,;:]+$/, '');
    // Also clean a soft comma now dangling before a closer, e.g. "(oh,)" -> "(oh)".
    text = text.replace(/([,;:])([)\]}])/g, '$2');
  }
  return text.replace(/\s+/g, ' ').trim();
}

function countWords(tokens: Token[]): number {
  return tokens.reduce((sum, t) => sum + t.wordCount, 0);
}

// ─── Split boundary scoring ───────────────────────────────────────────────────

/**
 * Signals available at a potential split point.
 * A split point is the index `j` in the token list: the first `j` tokens stay
 * on the left, token `j` begins the next chunk.
 */
interface BoundarySignals {
  /** Hard ban, no score. */
  allowed: boolean;
  /** 0-100. Higher = more natural phrase boundary. */
  score: number;
  /** True when a musical pause / strong punctuation justifies a short chunk. */
  justifiedShort: boolean;
  /** Human readable reason, used for logging. */
  reason: string;
}

function analyzeBoundary(
  tokens: Token[],
  j: number,
  chunkWords: number,
  remainingWords: number
): BoundarySignals {
  const prev = tokens[j - 1];
  const next = tokens[j];
  const deny = (reason: string): BoundarySignals => ({ allowed: false, score: 0, justifiedShort: false, reason });

  // ── Never split inside a parenthesised / bracketed group ──
  if (prev.raw && OPENERS.test(prev.raw)) {
    return deny('inside parentheses');
  }
  // A dangling opener means the tokenizer merged; refuse to break there.
  if (prev.isParenthetical && !prev.endsClosing) {
    return deny('inside parentheses');
  }

  // ── Never split inside contractions / possessives ──
  if (CONTRACTION_TAIL.test(next.raw) && prev.isWord) {
    return deny('inside contraction');
  }

  // ── Never split inside a name (two consecutive Capitalized words) ──
  if (prev.isWord && next.isWord && prev.isCapitalized && next.isCapitalized) {
    return deny('inside a name');
  }

  // ── Never split between a determiner/article and its noun ──
  if (prev.isWord && DETERMINERS.has(prev.word)) {
    return deny('determiner must stay with its noun');
  }
  if (next.isWord && (DETERMINERS.has(next.word) || NEVER_SPLIT_BEFORE.has(next.word))) {
    return deny('would strand a determiner');
  }

  // ── Never split inside a tight phrase ──
  if (prev.isWord && next.isWord) {
    const pair = `${prev.word} ${next.word}`;
    if (TIGHT_PHRASES.has(pair)) {
      return deny(`tight phrase "${pair}"`);
    }
    if (TIGHT_PHRASES.has(`${tokens[j - 2]?.word ?? ''} ${prev.word}`)) {
      return deny(`tight phrase ending at "${prev.word}"`);
    }
  }

  // ── Never break before a lone trailing word ──
  if (remainingWords <= 1) {
    return deny('would strand a trailing word');
  }
  if (remainingWords === 2 && !next.endsStrongPunct && !prev.endsStrongPunct) {
    // Allowed but strongly discouraged: handled by the score below.
  }

  // ── Score the naturalness of this boundary ──
  //
  // Rewards are deliberately modest next to the per-cue cost. A comma inside an
  // enumeration ("whenever, wherever, however, whatever") is a real boundary,
  // but it must NOT be strong enough to shatter an already well-balanced chunk:
  // balanced chunk sizes rank above raw punctuation in the priority order.
  let score = 0;
  let reason = 'weak boundary';
  let justifiedShort = false;

  if (prev.endsStrongPunct) {
    score += 55;
    reason = 'punctuation';
    justifiedShort = true;
  } else if (prev.endsClosing) {
    score += 50;
    reason = 'closing parenthesis';
    justifiedShort = true;
  } else if (prev.endsSoftPunct) {
    score += 45;
    reason = 'soft punctuation';
    justifiedShort = true;
  }

  if (next.isWord && CONJUNCTIONS.has(next.word)) {
    // A clause boundary outranks an enumeration comma: in
    // "...holding you down whenever, wherever, however, whatever" the break
    // belongs BEFORE the list, not inside it.
    score += 120;
    reason = reason === 'weak boundary' ? 'conjunction' : `${reason} + conjunction`;
    justifiedShort = true;
  } else if (next.isWord && PHRASE_PREPOSITIONS.has(next.word)) {
    score += 40;
    if (reason === 'weak boundary') reason = 'preposition';
  }

  // Cap so a punctuation + conjunction pair cannot dwarf a lone hard stop.
  score = Math.min(score, 200);

  // A 1-token chunk is a lone-word leftover: heavily discouraged unless
  // punctuation or a musical pause justifies it. Without a strong penalty the
  // greedy pass would happily emit "I" as its own cue.
  if (chunkWords <= 1 && !justifiedShort) {
    score -= 150;
  }

  return { allowed: true, score, justifiedShort, reason };
}

// ─── Target sizing ────────────────────────────────────────────────────────────

/**
 * Target words per cue. Never returns more than the hard max.
 *
 * - Mobile Readability biases toward more, shorter cues.
 * - Split aggressiveness (0-100) tightens the target.
 * - High words-per-second (fast rap) tightens the target further so dense
 *   delivery gets smaller chunks, while slow delivery is left alone.
 */
export function computeTargetWords(
  totalWords: number,
  duration: number,
  settings: SmartSplitSettings
): number {
  const max = settings.maxWordsPerCue;
  let target = settings.mobileReadability ? 5 : Math.round(max * 0.75);

  // Aggressiveness 0 -> target = max, 100 -> target = ~60% of max.
  const aggressionFactor = 1 - (settings.splitAggressiveness / 100) * 0.4;
  target = Math.round(target * aggressionFactor);

  // Fast delivery tightens the target. The response is deliberately centred on
  // NORMAL singing (wps <= 3 => factor 1.0) and steepens for genuinely dense
  // delivery, reaching ~0.55 around 8 words/sec (fast rap). Slow singing never
  // shrinks the target, and duration alone never forces a split.
  if (duration > 0) {
    const wps = totalWords / duration;
    const fastFactor = Math.max(0.55, Math.min(1, 1 - (wps - 3) * 0.12));
    target = Math.round(target * fastFactor);
  }

  return Math.max(2, Math.min(target, max));
}

// ─── Segmented chunk (before timing is assigned) ──────────────────────────────

/**
 * Cost charged for each additional cue. Growing with the cue index is what stops
 * the segmentation from drifting into many evenly-sized pieces that all
 * individually look "balanced", and it enforces the priority order:
 * mobile readability > natural phrasing > stable timing > short chunks.
 */
const CHUNK_COST = 10;

/** Weight of the "stay near the target word count" penalty. */
const BALANCE_WEIGHT = 12;

/**
 * Boundary rewards are scaled well below 1.0 so that a punctuation mark or a
 * conjunction influences WHICH partition wins, but can never on its own justify
 * creating an extra cue. Splitting a balanced chunk to land on a comma is a
 * readability regression, not an improvement.
 */
const BOUNDARY_REWARD_SCALE = 0.25;

export type RawChunk = {
  tokens: Token[];
  text: string;
  wordCount: number;
  /** True when punctuation / a musical pause justifies a short chunk. */
  justifiedShort: boolean;
};

/** Re-exported for the Audio Sync stage, which reuses the identical segmentation. */
export type { Token };

/** Exported for the Audio Sync stage, which reuses the identical segmentation. */
export function segmentForAudioSync(
  tokens: Token[],
  target: number,
  duration: number,
  settings: SmartSplitSettings
): RawChunk[] {
  return reduceToFitMinDuration(segmentTokens(tokens, target, settings), duration, settings);
}


/**
 * Segments a token list into chunks using a dynamic program that minimises the
 * TOTAL cost over the whole line.
 *
 * A greedy pass is myopic: it commits to the first attractive boundary and then
 * has to repair the leftovers, which inflates the cue count. The DP considers
 * every legal partition at once, so it finds the fewest, most balanced chunks
 * that still respect every hard limit and every "never split" rule.
 *
 * Deterministic: ties are resolved by preferring the earlier split index, and
 * the comparison is a strict `<` over a fixed iteration order.
 */
function segmentTokens(tokens: Token[], target: number, settings: SmartSplitSettings): RawChunk[] {
  const n = tokens.length;
  if (n === 0) return [];

  // Prefix sums of word counts let us score any range in O(1).
  const prefixWords: number[] = [0];
  for (let i = 0; i < n; i++) prefixWords.push(prefixWords[i] + tokens[i].wordCount);

  const wordsIn = (from: number, to: number): number => prefixWords[to] - prefixWords[from];

  // Minimum chunks we could possibly need, given the hard cap.
  const minChunks = Math.ceil(wordsIn(0, n) / settings.maxWordsPerCue);

  /**
   * Cost of making a chunk that ends at `end` (exclusive), i.e. covering
   * tokens[start..end-1]. Also records whether the boundary is justified.
   * Returns Infinity when the split at `start` is banned.
   */
  const costOf = (start: number, end: number): number => {
    const chunkWords = wordsIn(start, end);
    if (chunkWords > settings.maxWordsPerCue) return Infinity;

    let signals: BoundarySignals = {
      allowed: true,
      score: 0,
      justifiedShort: true,
      reason: 'start',
    };
    if (start > 0) {
      const remainingWords = wordsIn(start, n);
      signals = analyzeBoundary(tokens, start, wordsIn(0, start), remainingWords);
      if (!signals.allowed) return Infinity;
    }

    // Balance against the target size. This is the DOMINANT term: it is what
    // keeps chunks an even size rather than letting a single strong punctuation
    // mark dictate an arbitrarily lopsided split.
    let cost = Math.abs(chunkWords - target) * BALANCE_WEIGHT;

    // Reward genuinely natural phrase boundaries. The reward is deliberately
    // smaller than the per-cue cost, so a boundary is never worth creating an
    // extra cue on its own -- it can only break a tie between partitions that
    // already have the same number of cues.
    cost -= Math.min(signals.score, 200) * BOUNDARY_REWARD_SCALE;

    // Weak boundaries cost more the less aggressive the user asked for.
    if (start > 0 && signals.score === 0) {
      cost += (100 - settings.splitAggressiveness) * 0.35;
    }

    // Penalise leftover 1-2 word chunks that no pause justifies.
    if (start > 0 && chunkWords <= 2 && !signals.justifiedShort) {
      cost += chunkWords === 1 ? 150 : 40;
    }

    // Every additional cue costs progressively more, so the segmentation
    // settles at the FEWEST cues that satisfy the hard limits and land on
    // natural boundaries. A 20-word line stops at 3-4 cues instead of drifting
    // into 6 evenly-sized pieces that all score "balanced".
    if (start > 0) {
      const chunkIndex = Math.ceil(wordsIn(0, start) / settings.maxWordsPerCue);
      cost += CHUNK_COST * Math.max(1, chunkIndex);
    }

    return cost;
  };

  const justifiedAt = (start: number): boolean => {
    if (start === 0) return false;
    return analyzeBoundary(tokens, start, wordsIn(0, start), wordsIn(start, n)).justifiedShort;
  };

  // ── DP over positions ──
  const INF = Infinity;
  const best: number[] = new Array(n + 1).fill(INF);
  const prev: number[] = new Array(n + 1).fill(-1);
  best[0] = 0;

  for (let end = 1; end <= n; end++) {
    // The chunk's start can be at most `end` and at least far enough back to
    // respect the hard cap. Walking forward keeps the tie-break deterministic.
    const earliest = 0;
    for (let start = end - 1; start >= earliest; start--) {
      if (best[start] === INF) continue;
      const c = costOf(start, end);
      if (c === INF) continue;
      const total = best[start] + c;
      // Strict `<` keeps the FIRST (earliest-start) solution on ties.
      if (total < best[end]) {
        best[end] = total;
        prev[end] = start;
      }
    }
  }

  // Reconstruct the chosen partition.
  const cuts: number[] = [];
  if (best[n] === INF) {
    // No legal partition exists: fall back to fixed-size chunks at the hard max.
    for (let i = 0; i < n; i += settings.maxWordsPerCue) {
      cuts.push(i);
    }
  } else {
    let cursor = n;
    while (cursor > 0 && prev[cursor] !== -1) {
      cuts.push(prev[cursor]);
      cursor = prev[cursor];
    }
    cuts.reverse();
  }

  const boundaries = [0, ...cuts, n];
  const chunks: RawChunk[] = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const start = boundaries[i];
    const end = boundaries[i + 1];
    if (end <= start) continue;
    chunks.push(makeChunk(tokens.slice(start, end), justifiedAt(start)));
  }

  void minChunks;
  return repairLeftovers(chunks, settings);
}
function makeChunk(tokens: Token[], justifiedShort: boolean): RawChunk {
  return {
    tokens,
    text: tokens.map((t) => t.raw).join(' ').replace(/\s+/g, ' ').trim(),
    wordCount: countWords(tokens),
    justifiedShort,
  };
}

/**
 * Avoid 1-2 word leftovers. A short trailing chunk is only allowed when
 * punctuation or a musical pause justifies it; otherwise it is merged back into
 * its neighbour when the neighbour stays within the hard limits.
 */
function repairLeftovers(chunks: RawChunk[], settings: SmartSplitSettings): RawChunk[] {
  if (chunks.length < 2) return chunks;
  const out = [...chunks];

  for (let i = out.length - 1; i >= 1; i--) {
    const tail = out[i];
    if (tail.wordCount > 2 || tail.justifiedShort) continue;

    const prev = out[i - 1];
    const mergedWordCount = prev.wordCount + tail.wordCount;

    // Merge back only while the result respects the hard cap.
    if (mergedWordCount <= settings.maxWordsPerCue) {
      const merged = makeChunk([...prev.tokens, ...tail.tokens], prev.justifiedShort);
      out.splice(i - 1, 2, merged);
    } else {
      // Cannot merge: try shifting one token from the neighbour to the tail so
      // neither side is a lone word.
      if (tail.wordCount === 1 && prev.tokens.length > 1) {
        const moved = prev.tokens[prev.tokens.length - 1];
        const newPrev = makeChunk(prev.tokens.slice(0, -1), false);
        const newTail = makeChunk([moved, ...tail.tokens], false);
        out.splice(i - 1, 2, newPrev, newTail);
      } else {
        // Last resort: mark justified so the short chunk is kept as-is.
        tail.justifiedShort = true;
      }
    }
  }

  return out;
}

// ─── Duration redistribution ──────────────────────────────────────────────────

function roundTo(value: number, precision: number): number {
  const factor = 1 / precision;
  return Math.round(value * factor) / factor;
}

/**
 * Weights for duration allocation: primarily word count, blended with character
 * count so very uneven words (e.g. a long proper noun) still get fair time.
 */
function chunkWeights(chunks: RawChunk[]): number[] {
  const totalWords = chunks.reduce((s, c) => s + c.wordCount, 0) || 1;
  const totalChars = chunks.reduce((s, c) => s + c.text.length, 0) || 1;
  return chunks.map((c) => {
    const wordShare = c.wordCount / totalWords;
    const charShare = c.text.length / totalChars;
    // Blend: 80% word share, 20% character share. The char term only breaks ties
    // between chunks with identical word counts.
    return Math.max(1e-6, wordShare * 0.8 + charShare * 0.2);
  });
}

/**
 * Splits [start, end] into contiguous, gapless, non-overlapping durations.
 *
 * Guarantees:
 *  - chunk[0].start === start and last.end === end (exactly)
 *  - chunk[i].end === chunk[i+1].start (contiguous)
 *  - no negative durations
 *  - every chunk >= settings.minChunkDuration when the total duration allows it;
 *    otherwise the caller reduces the chunk count instead of violating the minimum
 */
export function redistributeDurations(
  chunks: RawChunk[],
  start: number,
  end: number,
  settings: SmartSplitSettings
): Array<{ start: number; end: number }> {
  if (chunks.length === 0) return [];
  if (chunks.length === 1) return [{ start, end }];

  const totalDuration = Math.max(0, end - start);
  const weights = chunkWeights(chunks);
  const weightSum = weights.reduce((a, b) => a + b, 0);

  // Build the cumulative split points in unrounded space.
  const cumulative: number[] = [0];
  let acc = 0;
  for (let i = 0; i < weights.length; i++) {
    acc += weights[i];
    cumulative.push((acc / weightSum) * totalDuration);
  }

  // Enforce a minimum duration. The clamp must be applied SEQUENTIALLY: each
  // boundary has to sit at least minDur after the previous one. Clamping each
  // boundary independently against the origin does not prevent two adjacent
  // boundaries from landing 0.59s apart, which is what previously produced
  // sub-minimum chunks.
  const minDur = settings.minChunkDuration;
  if (minDur * chunks.length <= totalDuration) {
    for (let i = 1; i < cumulative.length - 1; i++) {
      // Lower bound: keep this chunk and every earlier one at >= minDur.
      const lower = cumulative[i - 1] + minDur;
      // Upper bound: leave room for every later chunk to reach minDur.
      const upper = totalDuration - (chunks.length - i) * minDur;
      cumulative[i] = Math.min(Math.max(cumulative[i], lower), Math.max(lower, upper));
    }
  }

  // Map to absolute times. The rounding grid is applied to the CUMULATIVE
  // offsets first and the boundaries are then derived from a single rounded
  // value, so consecutive chunks always share an identical timestamp. Deriving
  // each end from its own independent rounding is what previously produced
  // 0.59s chunks (a 0.60s chunk rounded down at one edge and up at the other).
  const roundedCumulative = cumulative.map((c) => roundTo(c, settings.timePrecision));
  roundedCumulative[0] = 0;
  roundedCumulative[roundedCumulative.length - 1] = totalDuration;

  const timings: Array<{ start: number; end: number }> = [];
  for (let i = 0; i < chunks.length; i++) {
    const s = i === 0 ? start : roundTo(start + roundedCumulative[i], settings.timePrecision);
    const e =
      i === chunks.length - 1
        ? end // Outer edges are exact; rounding drift is absorbed here.
        : roundTo(start + roundedCumulative[i + 1], settings.timePrecision);
    timings.push({ start: s, end: Math.max(s, e) });
  }

  // Final contiguity pass: force each start to equal the previous end so rounding
  // can never introduce a gap or an overlap.
  for (let i = 1; i < timings.length; i++) {
    timings[i] = { start: timings[i - 1].end, end: Math.max(timings[i].start, timings[i].end) };
  }
  timings[timings.length - 1].end = end;
  timings[timings.length - 1].start = Math.min(
    timings[timings.length - 1].start,
    timings[timings.length - 1].end
  );

  return timings;
}

// ─── Cue timing normalization ─────────────────────────────────────────────────

interface ResolvedCue {
  index: number;
  line: LyricLine;
  start: number;
  end: number;
}

/**
 * Produces a safe [start, end] for every original cue WITHOUT mutating the input.
 *
 * - Derives a missing end time from the next cue's start, capped at
 *   settings.maxDerivedDuration.
 * - Clamps overlaps by trimming the EARLIER cue's end to the next start.
 * - Fixes zero/negative durations with a minimal adjustment.
 * originalLines is never modified: this works on a copy.
 */
export function resolveCueTimings(
  lines: LyricLine[],
  settings: SmartSplitSettings
): { cues: ResolvedCue[]; log: AutoArrangeLogEntry[] } {
  const log: AutoArrangeLogEntry[] = [];
  const cues: ResolvedCue[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startTime === null) {
      // Untimed line (plain TXT): pass through untouched.
      continue;
    }

    const start = Math.max(0, line.startTime);
    const nextStart =
      i + 1 < lines.length && lines[i + 1].startTime !== null
        ? Math.max(0, lines[i + 1].startTime as number)
        : null;

    let end: number;
    if (line.endTime !== null) {
      end = line.endTime;
    } else if (nextStart !== null) {
      // Derive from the next cue's start, capped at a sane maximum.
      end = Math.min(nextStart, start + settings.maxDerivedDuration);
    } else {
      end = start + Math.min(settings.maxDerivedDuration, 3.5);
    }

    // Overlap prevention: trim the earlier cue's end to the next cue's start.
    if (nextStart !== null && end > nextStart) {
      log.push({
        level: 'warning',
        lineId: line.id,
        message: `Cue "${line.text.slice(0, 32)}" overlapped the next cue by ${(end - nextStart).toFixed(3)}s; trimmed.`,
      });
      end = nextStart;
    }

    // Zero / negative duration: minimal adjustment.
    if (end <= start) {
      const minimum = nextStart !== null && nextStart > start ? 0.01 : 0.1;
      log.push({
        level: 'warning',
        lineId: line.id,
        message: `Cue "${line.text.slice(0, 32)}" had a non-positive duration; set to ${minimum}s.`,
      });
      end = start + minimum;
    }

    cues.push({ index: i, line, start, end });
  }

  return { cues, log };
}

/** A cue that is already within every hard limit stays completely untouched. */
function needsSplit(totalWords: number, totalChars: number, settings: SmartSplitSettings): boolean {
  if (totalWords > settings.maxWordsPerCue) return true;
  const maxChars = settings.maxLines * settings.maxCharsPerLine;
  return totalChars > maxChars;
}

/**
 * True when the whole cue is a filler / ad-lib token. These are never split and
 * never merged with anything else.
 */
export function isFillerCue(text: string): boolean {
  const tokens = tokenize(text);
  if (tokens.length === 0) return false;
  return tokens.every((t) => FILLER_WORDS.has(t.word) || !t.isWord);
}

/**
 * Reduces the chunk count until every chunk can honour minChunkDuration.
 * Merges the two shortest adjacent chunks (ties -> earliest index), so the
 * result stays deterministic.
 */
function reduceToFitMinDuration(
  chunks: RawChunk[],
  totalDuration: number,
  settings: SmartSplitSettings
): RawChunk[] {
  let out = [...chunks];
  const maxChunks = Math.max(1, Math.floor(totalDuration / settings.minChunkDuration));

  while (out.length > maxChunks) {
    let bestIdx = 0;
    let bestScore = Infinity;
    for (let i = 0; i < out.length - 1; i++) {
      const score = out[i].wordCount + out[i + 1].wordCount;
      if (score < bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    const merged = makeChunk(
      [...out[bestIdx].tokens, ...out[bestIdx + 1].tokens],
      out[bestIdx].justifiedShort
    );
    out.splice(bestIdx, 2, merged);
  }

  return out;
}

/**
 * Smart Split — the pure, deterministic entry point.
 *
 * (lines, settings) -> { lines, log }
 * No React, no Date, no Math.random, no audio, no network.
 */
export function smartSplitLyrics(
  lines: LyricLine[],
  settings: SmartSplitSettings = DEFAULT_SMART_SPLIT_SETTINGS
): SmartSplitResult {
  const log: AutoArrangeLogEntry[] = [];
  const out: LyricLine[] = [];

  const { cues, log: timingLog } = resolveCueTimings(lines, settings);
  log.push(...timingLog);

  // Untimed lines (plain TXT) are carried through untouched, in order.
  const timedIds = new Set(cues.map((c) => c.line.id));
  for (const line of lines) {
    if (!timedIds.has(line.id)) out.push({ ...line, generatedBy: 'original' });
  }

  for (const cue of cues) {
    const { line, start, end } = cue;
    const text = (line.text || '').trim();
    const duration = end - start;

    // Empty lines produce NO cue; the timing gap remains an instrumental break.
    if (text.length === 0) continue;

    const tokens = tokenize(text);
    const totalWords = countWords(tokens);
    const totalChars = text.length;

    // Filler cues are never split and never merged.
    if (isFillerCue(text)) {
      const fillerText = joinTokens(tokens, settings);
      out.push({
        ...line,
        id: `${line.id}#0`,
        text: fillerText,
        startTime: start,
        endTime: end,
        sourceLineId: line.id,
        generatedBy: 'smart-split',
        visualLines: [fillerText],
      });
      continue;
    }

    // Already within limits: completely untouched, timing included.
    if (!needsSplit(totalWords, totalChars, settings)) {
      out.push({
        ...line,
        id: `${line.id}#0`,
        text,
        startTime: start,
        endTime: end,
        sourceLineId: line.id,
        generatedBy: 'smart-split',
        visualLines: wrapText(text, settings),
      });
      continue;
    }

    const target = computeTargetWords(totalWords, duration, settings);
    let chunks = segmentTokens(tokens, target, settings);
    chunks = reduceToFitMinDuration(chunks, duration, settings);

    const timings = redistributeDurations(chunks, start, end, settings);

    for (let i = 0; i < chunks.length; i++) {
      const visibleText = joinTokens(chunks[i].tokens, settings);
      if (visibleText.length === 0) continue;
      out.push({
        id: `${line.id}#${i}`,
        text: visibleText,
        startTime: timings[i].start,
        endTime: timings[i].end,
        confidence: line.confidence,
        type: line.type,
        customStyleSeed: line.customStyleSeed,
        source: line.source,
        words: undefined,
        sourceFormat: line.sourceFormat,
        originalIndex: line.originalIndex,
        originalText: line.originalText,
        sourceLineId: line.id,
        generatedBy: 'smart-split',
        visualLines: wrapText(visibleText, settings),
      });
    }
  }

  out.sort((a, b) => {
    const as = a.startTime ?? Number.MAX_SAFE_INTEGER;
    const bs = b.startTime ?? Number.MAX_SAFE_INTEGER;
    if (as === bs) return 0;
    return as - bs;
  });

  return { lines: out, log };
}

// ─── WRAP ONLY ────────────────────────────────────────────────────────────────

/**
 * Computes balanced visual line breaks for a cue.
 *
 * Used by Smart Split (as visual metadata) and by Wrap Only (as the whole job).
 * Purely visual: it never changes cue count and never changes timing.
 */
export function wrapText(text: string, settings: SmartSplitSettings): string[] {
  const tokens = tokenize(text);
  if (tokens.length === 0) return [];

  const totalChars = tokens.map((t) => t.raw).join(' ').length;
  const lineCount = Math.max(1, Math.ceil(totalChars / settings.maxCharsPerLine));
  const targetLines = Math.min(lineCount, settings.maxLines);

  if (targetLines <= 1) return [tokens.map((t) => t.raw).join(' ')];

  // Balance: aim for an even character count per line, then fill greedily.
  const targetChars = Math.ceil(totalChars / targetLines);
  const lines: string[] = [];
  let current: string[] = [];
  let currentChars = 0;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const remainingTokens = tokens.length - i;
    const remainingLines = targetLines - lines.length;

    const projected = currentChars === 0 ? token.raw.length : currentChars + 1 + token.raw.length;

    // Start a new line when the current one is full AND we still have room for
    // the remaining lines. Never leave a trailing empty line.
    const mustBreak =
      current.length > 0 &&
      projected > targetChars &&
      projected > settings.maxCharsPerLine - 8 &&
      remainingLines > 1 &&
      remainingTokens > remainingLines;

    if (mustBreak) {
      lines.push(current.join(' '));
      current = [token.raw];
      currentChars = token.raw.length;
    } else {
      current.push(token.raw);
      currentChars = projected;
    }
  }

  if (current.length > 0) lines.push(current.join(' '));

  // A final safety pass: if any line still exceeds the hard char cap, greedily
  // re-flow it. This keeps typography consistent for pathological inputs.
  const safe: string[] = [];
  for (const line of lines) {
    if (line.length <= settings.maxCharsPerLine) {
      safe.push(line);
      continue;
    }
    const words = line.split(' ');
    let buf: string[] = [];
    let len = 0;
    for (const w of words) {
      if (buf.length > 0 && len + 1 + w.length > settings.maxCharsPerLine) {
        safe.push(buf.join(' '));
        buf = [w];
        len = w.length;
      } else {
        buf.push(w);
        len = buf.length === 1 ? w.length : len + 1 + w.length;
      }
    }
    if (buf.length > 0) safe.push(buf.join(' '));
  }

  return safe.length > 0 ? safe : [text];
}

/**
 * WRAP ONLY — keeps cue count and timing IDENTICAL and only sets visual line
 * breaks. No cue is ever split or merged.
 */
export function wrapOnlyLyrics(
  lines: LyricLine[],
  settings: SmartSplitSettings = DEFAULT_SMART_SPLIT_SETTINGS
): SmartSplitResult {
  const log: AutoArrangeLogEntry[] = [];

  const out = lines.map((line) => {
    const text = (line.text || '').trim();
    // Empty lines are preserved as-is: they carry no text to wrap.
    if (text.length === 0) {
      return { ...line, generatedBy: 'wrap' as const };
    }
    return {
      ...line,
      text,
      // Timing is deliberately untouched: same startTime, same endTime, same id.
      startTime: line.startTime,
      endTime: line.endTime,
      words: line.words,
      sourceLineId: line.id,
      generatedBy: 'wrap' as const,
      visualLines: wrapText(text, settings),
    };
  });

  return { lines: out, log };
}

