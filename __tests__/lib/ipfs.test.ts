import { ipfsUrl } from "../../lib/ipfs";

// axios is only used by uploadToIPFS; no need to mock for these tests
jest.mock("axios");

const GATEWAY = "https://gateway.pinata.cloud/ipfs";

const VALID_CIDv0 = "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG";
const VALID_CIDv1 = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";

describe("ipfsUrl — valid CIDs", () => {
  test("returns full gateway URL for valid CIDv0", () => {
    expect(ipfsUrl(VALID_CIDv0)).toBe(`${GATEWAY}/${VALID_CIDv0}`);
  });

  test("returns full gateway URL for valid CIDv1", () => {
    expect(ipfsUrl(VALID_CIDv1)).toBe(`${GATEWAY}/${VALID_CIDv1}`);
  });
});

describe("ipfsUrl — invalid / malicious CIDs return null", () => {
  test("returns null for empty string", () => {
    expect(ipfsUrl("")).toBeNull();
  });

  test("returns null for path traversal attempt", () => {
    expect(ipfsUrl("../etc/passwd")).toBeNull();
  });

  test("returns null for protocol-relative URL", () => {
    expect(ipfsUrl("//evil.com")).toBeNull();
  });

  test("returns null for http URL injection", () => {
    expect(ipfsUrl("http://evil.com/hack")).toBeNull();
  });

  test("returns null for random garbage", () => {
    expect(ipfsUrl("not-a-cid")).toBeNull();
  });

  test("returns null for CIDv0 with wrong length", () => {
    expect(ipfsUrl("QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbd")).toBeNull();
  });

  test("returns null for CIDv1 that is too short", () => {
    expect(ipfsUrl("bafybei")).toBeNull();
  });

  test("returns null for whitespace-padded input", () => {
    expect(ipfsUrl(" " + VALID_CIDv0 + " ")).toBeNull();
  });
});
