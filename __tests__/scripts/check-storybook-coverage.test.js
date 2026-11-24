const fs = require('fs');

const {
  findComponentsMissingStories,
} = require('../../scripts/check-storybook-coverage');

// The function takes one DIRS entry (#1608); `dir` must exist on disk because
// only readdirSync is stubbed.
const CONFIG = { dir: 'components/ui', exempt: new Set() };

describe('check-storybook-coverage.js', () => {
  let readdirSyncSpy;

  afterEach(() => {
    readdirSyncSpy.mockRestore();
  });

  it('returns nothing when every component has a matching story', () => {
    readdirSyncSpy = jest
      .spyOn(fs, 'readdirSync')
      .mockReturnValue([
        'Badge.tsx',
        'Badge.stories.tsx',
        'Button.tsx',
        'Button.stories.tsx',
      ]);

    expect(findComponentsMissingStories(CONFIG)).toEqual([]);
  });

  it('flags a component whose .stories.tsx file is missing', () => {
    readdirSyncSpy = jest
      .spyOn(fs, 'readdirSync')
      .mockReturnValue(['Badge.tsx', 'Badge.stories.tsx', 'NewThing.tsx']);

    expect(findComponentsMissingStories(CONFIG)).toEqual(['NewThing.tsx']);
  });

  it('does not flag .stories.tsx files themselves as missing coverage', () => {
    readdirSyncSpy = jest
      .spyOn(fs, 'readdirSync')
      .mockReturnValue(['Badge.tsx', 'Badge.stories.tsx']);

    expect(findComponentsMissingStories(CONFIG)).toEqual([]);
  });

  it('ignores non-.tsx files in the directory listing', () => {
    readdirSyncSpy = jest
      .spyOn(fs, 'readdirSync')
      .mockReturnValue([
        'Badge.tsx',
        'Badge.stories.tsx',
        'README.md',
        '.DS_Store',
      ]);

    expect(findComponentsMissingStories(CONFIG)).toEqual([]);
  });
});
