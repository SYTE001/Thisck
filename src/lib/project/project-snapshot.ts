/**
 * Project snapshot hashing — PRD Section 18 (dirty state).
 *
 * A deterministic content hash of the serializable project. The app compares
 * the current hash against the last-saved hash to know whether there are
 * unsaved changes (isDirty), without deep-diffing state on every render.
 *
 * Only serializable, user-meaningful fields are hashed. Runtime-only values
 * (AudioBuffer, blob URLs, playback state) are intentionally excluded so that
 * playing/pausing or re-linking audio does not mark the project dirty.
 */

/** Stable stringify: object keys are emitted in sorted order at every level. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const parts = keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`);
  return `{${parts.join(',')}}`;
}

/** FNV-1a 32-bit hash rendered as an 8-char hex string. */
export function hashString(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** The serializable slice of app state that defines "the project content". */
export interface ProjectSnapshotInput {
  track: unknown;
  originalLines: unknown;
  processedLines: unknown;
  viewMode: unknown;
  arrangeSettings: unknown;
  style: unknown;
  exportSettings: unknown;
  motionLayers: unknown;
}

export function hashProject(input: ProjectSnapshotInput): string {
  return hashString(stableStringify(input));
}
