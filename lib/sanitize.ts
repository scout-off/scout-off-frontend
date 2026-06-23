// CIDv0: base58-encoded SHA2-256 multihash, always starts with "Qm" and is 46 chars total
const CID_V0_RE = /^Qm[1-9A-HJ-NP-Za-km-z]{44}$/;

// CIDv1: multibase-prefixed; base32 CIDv1 starts with "b" followed by lowercase a-z2-7
// The "bafy" prefix is the canonical CIDv1 sha2-256 form, but we validate the full base32 alphabet
const CID_V1_RE = /^b[a-z2-7]{58,}$/;

export function isValidCID(cid: string): boolean {
  if (typeof cid !== "string" || cid.length === 0) return false;
  return CID_V0_RE.test(cid) || CID_V1_RE.test(cid);
}
