import { isValidCID } from "../../lib/sanitize";

const VALID_CIDv0 = "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG";
const VALID_CIDv1 = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";

describe("isValidCID — CIDv0", () => {
  test("accepts a valid CIDv0 (Qm-prefixed, 46 chars)", () => {
    expect(isValidCID(VALID_CIDv0)).toBe(true);
  });

  test("rejects CIDv0 that is too short", () => {
    expect(isValidCID("QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbd")).toBe(false);
  });

  test("rejects CIDv0 that is too long", () => {
    expect(isValidCID("QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdGX")).toBe(false);
  });

  test("rejects CIDv0 with invalid base58 char (0)", () => {
    expect(isValidCID("Qm0wAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG")).toBe(false);
  });

  test("rejects CIDv0 with wrong prefix", () => {
    expect(isValidCID("QnYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG")).toBe(false);
  });
});

describe("isValidCID — CIDv1", () => {
  test("accepts a valid CIDv1 (bafy... base32)", () => {
    expect(isValidCID(VALID_CIDv1)).toBe(true);
  });

  test("accepts other valid bafy CIDv1 values", () => {
    expect(isValidCID("bafybeif2pall7dybz7vecqka3zo24irdwabwdi4wc55mdulzr2subf5mmu")).toBe(true);
  });

  test("rejects CIDv1 with uppercase characters", () => {
    expect(isValidCID("BAFYBEIGDYRZT5SFP7UDM7HU76UH7Y26NF3EFUYLQABF3OCLGTQY55FBZDI")).toBe(false);
  });

  test("rejects CIDv1 that is too short", () => {
    expect(isValidCID("bafybei")).toBe(false);
  });

  test("rejects CIDv1 with invalid base32 char (digit 9)", () => {
    // base32 only allows 2-7 for digits; 9 is not valid
    expect(isValidCID("bafybeigdyrzt9sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi")).toBe(false);
  });
});

describe("isValidCID — invalid / malicious inputs", () => {
  test("rejects empty string", () => {
    expect(isValidCID("")).toBe(false);
  });

  test("rejects path traversal attempt", () => {
    expect(isValidCID("../etc/passwd")).toBe(false);
  });

  test("rejects protocol-relative URL", () => {
    expect(isValidCID("//evil.com")).toBe(false);
  });

  test("rejects http URL", () => {
    expect(isValidCID("http://evil.com/hack")).toBe(false);
  });

  test("rejects null byte injection", () => {
    expect(isValidCID("QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG\x00evil")).toBe(false);
  });

  test("rejects whitespace-padded CID", () => {
    expect(isValidCID(" " + VALID_CIDv0 + " ")).toBe(false);
  });

  test("rejects newline-embedded CID", () => {
    expect(isValidCID(VALID_CIDv0 + "\n" + VALID_CIDv0)).toBe(false);
  });

  test("rejects random garbage string", () => {
    expect(isValidCID("not-a-cid")).toBe(false);
  });

  test("rejects numeric-only string", () => {
    expect(isValidCID("1234567890")).toBe(false);
  });
});
