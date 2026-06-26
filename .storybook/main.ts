import type { StorybookConfig } from '@storybook/react-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import tsconfigPaths from 'vite-tsconfig-paths';

const config: StorybookConfig = {
  stories: ['../components/ui/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-essentials'],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  docs: { autodocs: 'tag' },
  async viteFinal(config) {
    config.plugins ??= [];
    config.plugins.push(react(), tailwindcss(), tsconfigPaths());
    // @tailwindcss/vite handles CSS; clear the PostCSS tailwindcss plugin to avoid
    // the "moved to @tailwindcss/postcss" error from postcss.config.js
    config.css = { ...config.css, postcss: { plugins: [] } };
    return config;
  },
};

export default config;
