import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Driven by the --green/--bg/--card CSS variables (app/globals.css) so
        // toggling the persisted theme (see components/ThemeToggle.tsx) recolors
        // every brand-* utility class app-wide. The rgb(... / <alpha-value>)
        // form is Tailwind's documented pattern for CSS-variable colors that
        // still support opacity modifiers, e.g. bg-brand-green/20.
        brand: {
          green: 'rgb(var(--green) / <alpha-value>)',
          blue: 'rgb(var(--blue) / <alpha-value>)',
          // Keep the dark-theme values in sync with the .dark block in
          // app/globals.css and theme_color/background_color in
          // public/manifest.json and the theme-color meta tag in app/layout.tsx.
          dark: 'rgb(var(--bg) / <alpha-value>)',
          card: 'rgb(var(--card) / <alpha-value>)',
        },
      },
    },
  },
  plugins: [],
};

export default config;
