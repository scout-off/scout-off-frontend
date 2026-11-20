import { z } from 'zod';

/**
 * Shared validators for the request schemas (issue #1714).
 */

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const ED25519_PUBLIC_KEY_VERSION_BYTE = 6 << 3; // 'G…' StrKey prefix

function base32Decode(input: string): Uint8Array {
  const out: number[] = [];
  let bits = 0;
  let value = 0;
  for (const char of input) {
    value = (value << 5) | BASE32_ALPHABET.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Uint8Array.from(out);
}

function crc16Xmodem(bytes: Uint8Array): number {
  let crc = 0;
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
    }
  }
  return crc & 0xffff;
}

/**
 * True for a well-formed Stellar account id (G-address): base32, the
 * ed25519 public-key version byte, and a valid CRC16-XModem checksum —
 * the same checks as `StrKey.isValidEd25519PublicKey` in the Stellar SDK.
 */
export function isValidStellarAddress(value: string): boolean {
  if (!/^G[A-Z2-7]{55}$/.test(value)) return false;
  const decoded = base32Decode(value); // 35 bytes: version + key + checksum
  if (decoded.length !== 35 || decoded[0] !== ED25519_PUBLIC_KEY_VERSION_BYTE) {
    return false;
  }
  const payload = decoded.subarray(0, 33);
  const checksum = decoded[33] | (decoded[34] << 8); // little-endian
  return crc16Xmodem(payload) === checksum;
}

export const stellarAddress = z
  .string()
  .refine(isValidStellarAddress, 'must be a valid Stellar account address');

/** A trimmed, non-empty string capped at `max` characters. */
export const text = (max: number) => z.string().trim().min(1).max(max);

export const id = text(128);

export const walletParams = z.object({ wallet: stellarAddress });
