import {
  CONTRACT_VERSION,
  decodeV1HorizonOperation,
  decodeV1SorobanEvent,
  type DecodedSchemaEvent,
  type EventType,
} from './v1';

export * from './v1';

/**
 * A versioned decoder for a single contract schema version. Each decoder
 * receives the raw event (Soroban topics/value or a Horizon operation) and
 * returns a `DecodedSchemaEvent` tagged with its `version`.
 */
export interface SchemaDecoder {
  version: number;
  decodeSoroban(topics: unknown[], value: unknown): DecodedSchemaEvent;
  decodeHorizon(operation: Record<string, unknown>): DecodedSchemaEvent;
}

const v1Decoder: SchemaDecoder = {
  version: CONTRACT_VERSION,
  decodeSoroban: (topics, value) =>
    decodeV1SorobanEvent(topics as never, value as never),
  decodeHorizon: (operation) => decodeV1HorizonOperation(operation),
};

/** Registry of known schema versions. Add v2 here when it ships. */
export const SCHEMA_REGISTRY: Record<number, SchemaDecoder> = {
  [CONTRACT_VERSION]: v1Decoder,
};

export const LATEST_SCHEMA_VERSION = Math.max(
  ...Object.keys(SCHEMA_REGISTRY).map(Number),
);

/**
 * Discriminated union returned by `decodeEvent`. `ok` events carry a decoded
 * payload; `quarantined` events could not be decoded and must be persisted raw
 * rather than dropped.
 */
export type DecodeResult =
  | {
      status: 'ok';
      schemaVersion: number;
      event: DecodedSchemaEvent;
    }
  | {
      status: 'quarantined';
      schemaVersion: number;
      error: string;
      raw: {
        topics: string[];
        value: string | null;
        operation?: Record<string, unknown>;
      };
    };

export interface DecodeOptions {
  /** Contract version the event was emitted under. Defaults to latest. */
  contractVersion?: number;
}

export interface RawSorobanEvent {
  topics: unknown[];
  value: unknown;
}

function serialiseTopics(topics: unknown[]): string[] {
  return topics.map((topic) => {
    try {
      const t = topic as { toXDR?: (fmt: string) => string };
      return typeof t?.toXDR === 'function' ? t.toXDR('base64') : String(topic);
    } catch {
      return String(topic);
    }
  });
}

function serialiseValue(value: unknown): string | null {
  if (value == null) return null;
  try {
    const v = value as { toXDR?: (fmt: string) => string };
    return typeof v?.toXDR === 'function' ? v.toXDR('base64') : String(value);
  } catch {
    return String(value);
  }
}

/**
 * Selects the decoder for the given contract version and decodes the raw
 * Soroban event. Unknown versions and undecodable payloads are returned as a
 * `quarantined` result instead of throwing, so callers can persist them raw.
 */
export function decodeEvent(
  raw: RawSorobanEvent,
  options: DecodeOptions = {},
): DecodeResult {
  const contractVersion = options.contractVersion ?? LATEST_SCHEMA_VERSION;
  const decoder = SCHEMA_REGISTRY[contractVersion];

  if (!decoder) {
    return {
      status: 'quarantined',
      schemaVersion: contractVersion,
      error: `No decoder registered for contract version ${contractVersion}`,
      raw: {
        topics: serialiseTopics(raw.topics),
        value: serialiseValue(raw.value),
      },
    };
  }

  try {
    const event = decoder.decodeSoroban(raw.topics, raw.value);
    return { status: 'ok', schemaVersion: decoder.version, event };
  } catch (err) {
    return {
      status: 'quarantined',
      schemaVersion: decoder.version,
      error: err instanceof Error ? err.message : String(err),
      raw: {
        topics: serialiseTopics(raw.topics),
        value: serialiseValue(raw.value),
      },
    };
  }
}

/**
 * Version-aware decoder for the Horizon operation fallback. Mirrors
 * `decodeEvent` but for operation-shaped input.
 */
export function decodeHorizonEvent(
  operation: Record<string, unknown>,
  options: DecodeOptions = {},
): DecodeResult {
  const contractVersion = options.contractVersion ?? LATEST_SCHEMA_VERSION;
  const decoder = SCHEMA_REGISTRY[contractVersion];

  if (!decoder) {
    return {
      status: 'quarantined',
      schemaVersion: contractVersion,
      error: `No decoder registered for contract version ${contractVersion}`,
      raw: { topics: [], value: null, operation },
    };
  }

  try {
    const event = decoder.decodeHorizon(operation);
    return { status: 'ok', schemaVersion: decoder.version, event };
  } catch (err) {
    return {
      status: 'quarantined',
      schemaVersion: decoder.version,
      error: err instanceof Error ? err.message : String(err),
      raw: { topics: [], value: null, operation },
    };
  }
}

/**
 * Normalised, versioned JSON shape exposed by the indexer API and SSE so the
 * frontend can handle multiple schema versions. Unknown future event types are
 * preserved as `type: 'unknown'` rather than throwing.
 */
export interface NormalisedEvent {
  v: number;
  type: EventType | string;
  data: Record<string, unknown>;
}

export function toNormalisedEvent(event: DecodedSchemaEvent): NormalisedEvent {
  return { v: event.version, type: event.type, data: event.data };
}
