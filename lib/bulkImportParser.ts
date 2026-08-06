/**
 * Client-side parsing and validation for the academy bulk player import flow
 * (issue #697). Accepts CSV or JSON text describing multiple players, using
 * the same field shape as the single-player onboarding wizard's `WizardData`
 * minus `ipfsHash` (bulk highlight-reel upload is out of scope — see the
 * PR description).
 *
 * Parsing and validation both happen entirely client-side, before any wallet
 * interaction, so an academy admin can review a full staged preview (valid
 * and invalid rows) before anything is submitted on-chain.
 */
import { sanitize } from '@/lib/sanitize';
import { AFRICAN_REGIONS } from '@/lib/regions';
import { FOOTBALL_POSITIONS } from '@/components/player/PlayerOnboardingWizard';

export type BulkImportFileFormat = 'csv' | 'json';

/** Column/field names accepted in the uploaded file, in canonical order. */
export const BULK_IMPORT_FIELDS = [
  'name',
  'age',
  'nationality',
  'region',
  'position',
  'bio',
] as const;

export type BulkImportField = (typeof BULK_IMPORT_FIELDS)[number];

const REQUIRED_FIELDS: BulkImportField[] = [
  'name',
  'age',
  'nationality',
  'region',
  'position',
];

/** Sane upper bound on batch size, enforced client-side to avoid a runaway signing session. */
export const MAX_BULK_IMPORT_ROWS = 500;

export interface BulkImportRow {
  name: string;
  age: string;
  nationality: string;
  region: string;
  position: string;
  bio: string;
}

export interface RowFieldError {
  field: BulkImportField | 'row';
  message: string;
}

export interface ParsedRow {
  /** 1-based index of this row among the data rows (header excluded). */
  rowNumber: number;
  /** Raw field values as read from the file (sanitized, not yet coerced). */
  data: BulkImportRow;
  /** Coerced/validated values, present when the row is fully valid. */
  valid: {
    name: string;
    age: number;
    nationality: string;
    region: string;
    position: string;
    bio: string;
  } | null;
  errors: RowFieldError[];
  isValid: boolean;
}

export interface BulkImportParseResult {
  rows: ParsedRow[];
  /** Fatal, file-level error (malformed JSON, empty file, too many rows, etc). Rows is [] when set. */
  fileError: string | null;
}

// ── Format detection ─────────────────────────────────────────────────────────

export function detectFormat(
  fileName: string,
  text: string,
): BulkImportFileFormat {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.json')) return 'json';
  if (lower.endsWith('.csv')) return 'csv';
  // Fall back to content sniffing when the extension is ambiguous.
  return text.trim().startsWith('[') ? 'json' : 'csv';
}

// ── CSV parsing ───────────────────────────────────────────────────────────────

/**
 * Minimal RFC4180-style CSV line splitter: handles quoted fields, embedded
 * commas/newlines within quotes, and doubled-quote escaping (`""` -> `"`).
 * Returns an array of records (rows-of-fields), including the header row.
 */
function parseCsvRecords(text: string): string[][] {
  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let inQuotes = false;
  let i = 0;
  const len = text.length;

  const pushField = () => {
    record.push(field);
    field = '';
  };
  const pushRecord = () => {
    pushField();
    records.push(record);
    record = [];
  };

  while (i < len) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (char === ',') {
      pushField();
      i += 1;
      continue;
    }
    if (char === '\r') {
      i += 1;
      continue;
    }
    if (char === '\n') {
      pushRecord();
      i += 1;
      continue;
    }
    field += char;
    i += 1;
  }

  // Trailing field/record (file may not end with a newline).
  if (field.length > 0 || record.length > 0) {
    pushRecord();
  }

  // Drop fully-empty trailing rows (e.g. trailing blank line).
  return records.filter((r) => !(r.length === 1 && r[0] === ''));
}

function parseCsv(text: string): Record<string, string>[] {
  const records = parseCsvRecords(text);
  if (records.length === 0) return [];

  const header = records[0].map((h) => h.trim().toLowerCase());
  const dataRecords = records.slice(1);

  return dataRecords.map((record) => {
    const obj: Record<string, string> = {};
    header.forEach((key, idx) => {
      obj[key] = (record[idx] ?? '').trim();
    });
    return obj;
  });
}

// ── JSON parsing ─────────────────────────────────────────────────────────────

function parseJson(text: string): Record<string, unknown>[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('File is not valid JSON.');
  }
  if (!Array.isArray(parsed)) {
    throw new Error(
      'JSON file must contain an array of player objects, e.g. [{ "name": ... }].',
    );
  }
  return parsed.map((entry) =>
    entry && typeof entry === 'object'
      ? (entry as Record<string, unknown>)
      : {},
  );
}

// ── Field-level validation ───────────────────────────────────────────────────

function toStringField(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

const VALID_REGION_VALUES = new Set(
  AFRICAN_REGIONS.map((r) => r.value.toLowerCase()),
);
const REGION_LABEL_TO_VALUE = new Map(
  AFRICAN_REGIONS.map((r) => [r.label.toLowerCase(), r.value]),
);

const VALID_POSITION_VALUES = new Set(
  FOOTBALL_POSITIONS.map((p) => p.value.toLowerCase()),
);
const POSITION_LABEL_TO_VALUE = new Map(
  FOOTBALL_POSITIONS.map((p) => [p.label.toLowerCase(), p.value]),
);

/** Resolve a raw region string (value or label, case-insensitive) to its canonical slug. */
function resolveRegion(raw: string): string | null {
  const lower = raw.toLowerCase();
  if (VALID_REGION_VALUES.has(lower)) return lower;
  const byLabel = REGION_LABEL_TO_VALUE.get(lower);
  return byLabel ?? null;
}

/** Resolve a raw position string (value or label, case-insensitive) to its canonical code. */
function resolvePosition(raw: string): string | null {
  const lower = raw.toLowerCase();
  if (VALID_POSITION_VALUES.has(lower)) {
    // Preserve canonical casing (e.g. "GK", not "gk").
    return (
      FOOTBALL_POSITIONS.find((p) => p.value.toLowerCase() === lower)?.value ??
      raw
    );
  }
  const byLabel = POSITION_LABEL_TO_VALUE.get(lower);
  return byLabel ?? null;
}

function validateRow(
  raw: Record<string, unknown>,
  rowNumber: number,
): ParsedRow {
  const errors: RowFieldError[] = [];

  const rawName = toStringField(raw.name);
  const rawAge = toStringField(raw.age);
  const rawNationality = toStringField(raw.nationality);
  const rawRegion = toStringField(raw.region);
  const rawPosition = toStringField(raw.position);
  const rawBio = toStringField(raw.bio);

  const name = sanitize(rawName);
  const nationality = sanitize(rawNationality);
  const bio = sanitize(rawBio);

  // Required-field presence
  for (const field of REQUIRED_FIELDS) {
    const value =
      field === 'name'
        ? rawName
        : field === 'age'
          ? rawAge
          : field === 'nationality'
            ? rawNationality
            : field === 'region'
              ? rawRegion
              : rawPosition;
    if (!value) {
      errors.push({ field, message: `${labelFor(field)} is required` });
    }
  }

  // Name
  if (rawName) {
    if (name.length < 2) {
      errors.push({
        field: 'name',
        message: 'Name must be at least 2 characters',
      });
    } else if (name.length > 50) {
      errors.push({
        field: 'name',
        message: 'Name must be 50 characters or fewer',
      });
    }
  }

  // Age
  let age: number | null = null;
  if (rawAge) {
    const n = Number(rawAge);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 14 || n > 45) {
      errors.push({
        field: 'age',
        message: 'Age must be a whole number between 14 and 45',
      });
    } else {
      age = n;
    }
  }

  // Nationality
  if (rawNationality && nationality.length > 56) {
    errors.push({
      field: 'nationality',
      message: 'Nationality must be 56 characters or fewer',
    });
  }

  // Region
  let region: string | null = null;
  if (rawRegion) {
    region = resolveRegion(rawRegion);
    if (!region) {
      errors.push({
        field: 'region',
        message: `"${rawRegion}" is not a recognised region`,
      });
    }
  }

  // Position
  let position: string | null = null;
  if (rawPosition) {
    position = resolvePosition(rawPosition);
    if (!position) {
      errors.push({
        field: 'position',
        message: `"${rawPosition}" is not a recognised position`,
      });
    }
  }

  // Bio (optional, but cap length so it doesn't blow up on-chain storage)
  if (bio.length > 500) {
    errors.push({
      field: 'bio',
      message: 'Bio must be 500 characters or fewer',
    });
  }

  const data: BulkImportRow = {
    name,
    age: rawAge,
    nationality,
    region: rawRegion,
    position: rawPosition,
    bio,
  };

  const isValid = errors.length === 0;
  const valid =
    isValid && age !== null && region !== null && position !== null
      ? { name, age, nationality, region, position, bio }
      : null;

  return {
    rowNumber,
    data,
    valid,
    errors,
    isValid: isValid && valid !== null,
  };
}

function labelFor(field: BulkImportField): string {
  switch (field) {
    case 'name':
      return 'Name';
    case 'age':
      return 'Age';
    case 'nationality':
      return 'Nationality';
    case 'region':
      return 'Region';
    case 'position':
      return 'Position';
    case 'bio':
      return 'Bio';
    default:
      return field;
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────

export function parseBulkImportFile(
  text: string,
  format: BulkImportFileFormat,
): BulkImportParseResult {
  let records: Record<string, unknown>[];
  try {
    records = format === 'json' ? parseJson(text) : parseCsv(text);
  } catch (err) {
    return {
      rows: [],
      fileError: err instanceof Error ? err.message : 'Failed to parse file.',
    };
  }

  if (records.length === 0) {
    return {
      rows: [],
      fileError:
        format === 'json'
          ? 'JSON file contains no player entries.'
          : 'CSV file contains no data rows (only a header, or the file is empty).',
    };
  }

  if (records.length > MAX_BULK_IMPORT_ROWS) {
    return {
      rows: [],
      fileError: `File contains ${records.length} rows, which exceeds the ${MAX_BULK_IMPORT_ROWS}-row limit per import. Please split it into smaller batches.`,
    };
  }

  const rows = records.map((record, idx) => validateRow(record, idx + 1));
  return { rows, fileError: null };
}
