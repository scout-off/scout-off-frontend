/** @jest-environment node */
import { isValidCid, normalizeCid } from '@/lib/cid';

const V0 = 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG';
const BASE32 = 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi';
const BASE36 = 'k51qzi5uqu5dlvj2baxnqndepeb86cbk3ng7n3i46uzyxzyqj2xjonzllnv0v8';

describe('isValidCid', () => {
  it.each([V0, BASE32, BASE36])('accepts %s', (cid) => {
    expect(isValidCid(cid)).toBe(true);
  });

  it('accepts upper-case base32 and base36', () => {
    expect(isValidCid(BASE32.toUpperCase())).toBe(true);
    expect(isValidCid(BASE36.toUpperCase())).toBe(true);
  });

  it.each([
    V0.toLowerCase(), // base58 is case-sensitive
    `${BASE32}/../etc`,
    `${BASE32}?x=1`,
    `${BASE36}.html`,
    'bAfYbeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi', // mixed case
  ])('rejects %s', (cid) => {
    expect(isValidCid(cid)).toBe(false);
  });
});

describe('normalizeCid', () => {
  it('lower-cases upper-case base32 and base36', () => {
    expect(normalizeCid(BASE32.toUpperCase())).toBe(BASE32);
    expect(normalizeCid(BASE36.toUpperCase())).toBe(BASE36);
  });

  it('keeps a file extension as written', () => {
    expect(normalizeCid(`${BASE32.toUpperCase()}.JPG`)).toBe(`${BASE32}.JPG`);
  });

  it('leaves base58 and canonical CIDs unchanged', () => {
    expect(normalizeCid(V0)).toBe(V0);
    expect(normalizeCid(BASE32)).toBe(BASE32);
  });
});
