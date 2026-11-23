// Thin re-export so existing hook-naming conventions (useTheme) keep working
// while all consumers share the single ThemeProvider state.
export { useThemeContext as useTheme } from '@/context/ThemeContext';
export type { Theme } from '@/context/ThemeContext';
