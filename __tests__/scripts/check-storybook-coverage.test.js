const fs = require('fs');

const {
  findComponentsMissingStories,
} = require('../../scripts/check-storybook-coverage');

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

    expect(findComponentsMissingStories()).toEqual([]);
  });

  it('flags a component whose .stories.tsx file is missing', () => {
    readdirSyncSpy = jest
      .spyOn(fs, 'readdirSync')
      .mockReturnValue(['Badge.tsx', 'Badge.stories.tsx', 'NewThing.tsx']);

    expect(findComponentsMissingStories()).toEqual(['NewThing.tsx']);
  });

  it('does not flag .stories.tsx files themselves as missing coverage', () => {
    readdirSyncSpy = jest
      .spyOn(fs, 'readdirSync')
      .mockReturnValue(['Badge.tsx', 'Badge.stories.tsx']);

    expect(findComponentsMissingStories()).toEqual([]);
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

    expect(findComponentsMissingStories()).toEqual([]);
  });
});
