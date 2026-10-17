const fs = require('fs');
const path = require('path');

const WORKFLOWS_DIR = path.join(__dirname, '../../.github/workflows');

describe('CI workflows Node version', () => {
  const files = fs.readdirSync(WORKFLOWS_DIR).filter((f) => /\.ya?ml$/.test(f));

  it.each(files)('%s reads the Node version from .nvmrc', (file) => {
    const lines = fs
      .readFileSync(path.join(WORKFLOWS_DIR, file), 'utf8')
      .split('\n');
    const hardCoded = lines.filter((line) => /^\s*node-version:\s/.test(line));
    expect(hardCoded).toEqual([]);
  });
});
