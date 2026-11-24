const {
  isWatched,
  isExempt,
  findMissingTests,
} = require('../../scripts/check-test-coverage-diff');

describe('check-test-coverage-diff.js', () => {
  describe('isWatched', () => {
    it('matches files under hooks/, lib/, and components/', () => {
      expect(isWatched('hooks/useFoo.ts')).toBe(true);
      expect(isWatched('lib/foo.ts')).toBe(true);
      expect(isWatched('components/player/Bar.tsx')).toBe(true);
    });

    it('does not match files outside the watched directories', () => {
      expect(isWatched('app/api/foo/route.ts')).toBe(false);
      expect(isWatched('scripts/check-locale-keys.js')).toBe(false);
    });
  });

  describe('isExempt', () => {
    it('exempts stories, barrel, and type-definition files', () => {
      expect(isExempt('components/ui/Badge.stories.tsx')).toBe(true);
      expect(isExempt('components/ui/index.tsx')).toBe(true);
      expect(isExempt('lib/foo.d.ts')).toBe(true);
      expect(isExempt('lib/types.ts')).toBe(true);
      expect(isExempt('lib/foo.types.ts')).toBe(true);
    });

    it('does not exempt ordinary component/hook/lib files', () => {
      expect(isExempt('hooks/useFoo.ts')).toBe(false);
      expect(isExempt('lib/positions.ts')).toBe(false);
      expect(isExempt('components/player/ValidatorChip.tsx')).toBe(false);
    });
  });

  describe('findMissingTests', () => {
    it('flags a changed file with no matching test', () => {
      const missing = findMissingTests(
        ['hooks/useNewThing.ts'],
        ['__tests__/hooks/useOtherThing.test.ts'],
      );
      expect(missing).toEqual(['hooks/useNewThing.ts']);
    });

    it('does not flag a file with a matching .test. file', () => {
      const missing = findMissingTests(
        ['hooks/useFoo.ts'],
        ['__tests__/hooks/useFoo.test.ts'],
      );
      expect(missing).toEqual([]);
    });

    it('does not flag a file covered by a qualified test name (e.g. .a11y.test.)', () => {
      const missing = findMissingTests(
        ['components/player/Card.tsx'],
        ['__tests__/components/player/Card.a11y.test.tsx'],
      );
      expect(missing).toEqual([]);
    });

    it('matches a test regardless of its subdirectory under __tests__/', () => {
      const missing = findMissingTests(
        ['lib/foo.ts'],
        ['__tests__/somewhere/else/foo.test.ts'],
      );
      expect(missing).toEqual([]);
    });
  });
});
