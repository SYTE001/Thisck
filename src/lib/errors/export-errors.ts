/**
 * Typed export errors — PRD Section 14.
 *
 * Distinct error classes so callers can tell "the user cancelled" apart from
 * "the codec is unsupported" apart from "the configuration was invalid",
 * instead of string-matching an error message.
 */

export class ExportCanceledError extends Error {
  constructor(message = 'Export cancelled by user.') {
    super(message);
    this.name = 'ExportCanceledError';
  }
}

export class ExportCodecError extends Error {
  constructor(message = 'No supported video codec was found for export.') {
    super(message);
    this.name = 'ExportCodecError';
  }
}

export class ExportValidationError extends Error {
  constructor(message = 'Export configuration is invalid.') {
    super(message);
    this.name = 'ExportValidationError';
  }
}

export function isExportCanceled(err: unknown): boolean {
  return (
    err instanceof ExportCanceledError ||
    (err instanceof Error && err.message === 'Export cancelled by user.')
  );
}
