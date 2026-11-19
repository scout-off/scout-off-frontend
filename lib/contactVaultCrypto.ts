/**
 * Envelope encryption for player contact details (issue #1301).
 *
 * Finding: `pay_to_contact` returns `ContactDetails` as its on-chain return
 * value (`lib/contract.ts#payToContact`), and Soroban return values +
 * contract storage are world-readable — a free `simulateTransaction` by any
 * account, or a `getLedgerEntries` read of contract state, yields the same
 * plaintext without paying. The on-chain gate is therefore cosmetic until
 * the contract stops returning/storing PII.
 *
 * This module is the off-chain half of the fix: players upload contact
 * details to the backend vault (`POST /api/contact/vault`), where they are
 * encrypted with AES-256-GCM under a server-side key before touching disk.
 * Scouts retrieve them only through `GET /api/contact/:playerId`, which
 * requires (a) an authenticated session and (b) a `player_contacted` payment
 * proof in the indexer (see lib/contactAccess.ts). Plaintext exists only in
 * process memory during encrypt/decrypt — never on-chain, never in IPFS,
 * never in logs (lib/logger.ts already redacts contact-shaped keys).
 *
 * Key management (issue #1472): the 256-bit data key comes from a keyring.
 * `CONTACT_VAULT_KEYS="kid1:<hex>,kid2:<hex>"` plus `CONTACT_VAULT_ACTIVE_KID`
 * selects the active key; `CONTACT_VAULT_KEY` remains a backwards-compatible
 * single-key shorthand. New ciphertexts use the v2 envelope
 * `v2:<kid>:<base64(iv||ct||tag)>` with the player id bound as GCM AAD, so a
 * ciphertext copied onto another player's row fails to decrypt. Legacy
 * un-prefixed ciphertexts still decrypt as `kid = legacy`. Rotation is done
 * online by re-encrypting vault rows (scripts/rotate-contact-vault-key.mts);
 * see docs/contact-details-encryption.md for the runbook. Key handling is
 * deliberately boring: no per-scout keys (the player is offline at pay time,
 * so per-scout encryption is impossible without interaction), no key escrow
 * in the client bundle.
 */
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  type CipherGCMTypes,
} from 'crypto';

const ALGORITHM: CipherGCMTypes = 'aes-256-gcm';
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const ENVELOPE_VERSION = 'v2';
const LEGACY_KID = 'legacy';

// NOTE: this module avoids Buffer on purpose. @types/node >=22 types
// Buffer's backing as ArrayBufferLike (possibly SharedArrayBuffer), which
// is not assignable to the Uint8Array<ArrayBuffer> the node:crypto typings
// now demand (same root cause as lib/session.ts's timingSafeEqual note).
// Everything here is Uint8Array + base64 strings; runtime behaviour is
// identical.
function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function decodeKey(raw: string, source: string): Uint8Array {
  const trimmed = raw.trim();
  let key: Uint8Array;
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    key = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      key[i] = parseInt(trimmed.slice(i * 2, i * 2 + 2), 16);
    }
  } else {
    key = base64ToBytes(trimmed);
  }
  if (key.length !== 32) {
    throw new Error(
      `${source} must decode to exactly 32 bytes (64 hex chars or 44 base64 chars).`,
    );
  }
  return key;
}

/** Short, stable key id: first 8 hex chars of SHA-256(key). */
export function deriveKeyId(key: Uint8Array): string {
  return createHash('sha256').update(key).digest('hex').slice(0, 8);
}

interface Keyring {
  keys: Map<string, Uint8Array>;
  activeKid: string;
}

function loadKeyring(): Keyring {
  const keys = new Map<string, Uint8Array>();
  const rawKeys = process.env.CONTACT_VAULT_KEYS;
  if (rawKeys && rawKeys.trim()) {
    for (const entry of rawKeys.split(',')) {
      const trimmed = entry.trim();
      if (!trimmed) continue;
      const sep = trimmed.indexOf(':');
      if (sep <= 0) {
        throw new Error(
          'CONTACT_VAULT_KEYS entries must be `kid:<hex>` pairs (see .env.example).',
        );
      }
      const kid = trimmed.slice(0, sep).trim();
      const key = decodeKey(trimmed.slice(sep + 1), `CONTACT_VAULT_KEYS[${kid}]`);
      keys.set(kid, key);
    }
  }

  // Backwards-compatible single-key shorthand.
  const single = process.env.CONTACT_VAULT_KEY;
  if (single && single.trim()) {
    const key = decodeKey(single, 'CONTACT_VAULT_KEY');
    const kid = deriveKeyId(key);
    if (!keys.has(kid)) keys.set(kid, key);
  }

  if (keys.size === 0) {
    throw new Error(
      'CONTACT_VAULT_KEY (or CONTACT_VAULT_KEYS) is not configured. Generate one with ' +
        '`openssl rand -hex 32` and set it in the hosting environment (see .env.example).',
    );
  }

  const configuredActive = process.env.CONTACT_VAULT_ACTIVE_KID?.trim();
  let activeKid: string;
  if (configuredActive) {
    if (!keys.has(configuredActive)) {
      throw new Error(
        `CONTACT_VAULT_ACTIVE_KID=${configuredActive} is not present in CONTACT_VAULT_KEYS.`,
      );
    }
    activeKid = configuredActive;
  } else if (keys.size === 1) {
    activeKid = keys.keys().next().value as string;
  } else {
    throw new Error(
      'CONTACT_VAULT_ACTIVE_KID must be set when CONTACT_VAULT_KEYS holds multiple keys.',
    );
  }

  return { keys, activeKid };
}

/** Returns the active key id (used by the rotation script / config status). */
export function getActiveKeyId(): string {
  return loadKeyring().activeKid;
}

export interface SealedContactDetails {
  /** base64 nonce — stored alongside the ciphertext, not secret. */
  iv: string;
  /**
   * v2 envelope `v2:<kid>:<base64(iv||ct||tag)>`. Legacy rows hold the bare
   * base64 blob (no kid) and are read as `kid = legacy`.
   */
  ciphertext: string;
}

/** Extracts the key id from a stored ciphertext (legacy rows → `legacy`). */
export function getCiphertextKeyId(ciphertext: string): string {
  if (ciphertext.startsWith(`${ENVELOPE_VERSION}:`)) {
    const rest = ciphertext.slice(ENVELOPE_VERSION.length + 1);
    const sep = rest.indexOf(':');
    if (sep > 0) return rest.slice(0, sep);
  }
  return LEGACY_KID;
}

function splitEnvelope(ciphertext: string): { kid: string; blob: string } {
  if (ciphertext.startsWith(`${ENVELOPE_VERSION}:`)) {
    const rest = ciphertext.slice(ENVELOPE_VERSION.length + 1);
    const sep = rest.indexOf(':');
    if (sep <= 0) throw new Error('Malformed sealed contact details.');
    return { kid: rest.slice(0, sep), blob: rest.slice(sep + 1) };
  }
  return { kid: LEGACY_KID, blob: ciphertext };
}

/**
 * Encrypts contact-details JSON. Plaintext never leaves this call's scope.
 * `playerId` is bound as GCM AAD so the ciphertext cannot be replayed onto
 * another player's row.
 */
export function sealContactDetails(
  plaintextJson: string,
  playerId: string,
): SealedContactDetails {
  const { keys, activeKid } = loadKeyring();
  const key = keys.get(activeKid)!;
  // `new Uint8Array(buffer)` copy (not Uint8Array.from): sidesteps the
  // @types/node-vs-DOM-lib generic mismatch documented in
  // lib/uploadVerification.ts — Buffer's ArrayBufferLike backing doesn't
  // satisfy the Uint8Array<ArrayBuffer> node:crypto typings demand.
  const iv = new Uint8Array(randomBytes(IV_BYTES));
  const cipher = createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(new TextEncoder().encode(playerId));
  const head = new Uint8Array(cipher.update(plaintextJson, 'utf8'));
  const tail = new Uint8Array(cipher.final());
  const authTag = new Uint8Array(cipher.getAuthTag());
  const blob = bytesToBase64(concatBytes(head, tail, authTag));
  return {
    iv: bytesToBase64(iv),
    // Auth tag appended so the store needs a single blob column.
    ciphertext: `${ENVELOPE_VERSION}:${activeKid}:${blob}`,
  };
}

/**
 * Decrypts a vault row. Throws (never returns partial plaintext) when the
 * ciphertext was tampered with, the key is wrong, or the row's player id
 * does not match the AAD it was sealed under — AES-GCM authentication
 * failure surfaces as an exception from `decipher.final()`.
 */
export function unsealContactDetails(
  sealed: SealedContactDetails,
  playerId: string,
): string {
  const { kid, blob } = splitEnvelope(sealed.ciphertext);
  const { keys } = loadKeyring();
  const key = kid === LEGACY_KID ? keys.get(loadKeyring().activeKid) : keys.get(kid);
  if (!key) {
    throw new Error(`No contact-vault key configured for kid=${kid}.`);
  }
  const iv = base64ToBytes(sealed.iv);
  const combined = base64ToBytes(blob);
  if (iv.length !== IV_BYTES || combined.length < AUTH_TAG_BYTES) {
    throw new Error('Malformed sealed contact details.');
  }
  const ciphertext = combined.slice(0, combined.length - AUTH_TAG_BYTES);
  const authTag = combined.slice(combined.length - AUTH_TAG_BYTES);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  if (kid !== LEGACY_KID) {
    decipher.setAAD(new TextEncoder().encode(playerId));
  }
  decipher.setAuthTag(authTag);
  const head = new Uint8Array(decipher.update(ciphertext));
  const tail = new Uint8Array(decipher.final());
  return new TextDecoder().decode(concatBytes(head, tail));
}
