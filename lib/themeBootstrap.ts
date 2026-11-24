import { THEME_STORAGE_KEY } from '@/lib/storageKeys';

export { THEME_STORAGE_KEY };

/**
 * Blocking no-flash theme script for app/layout.tsx: applies the `dark`
 * class to <html> before first paint using the same
 * stored-preference-or-system-preference resolution as
 * context/ThemeContext.tsx (which re-applies the result on mount).
 */
export function buildThemeBootstrapScript(): string {
  return `(function(){try{var k=${JSON.stringify(THEME_STORAGE_KEY)};var s=localStorage.getItem(k);var d=s==='light'||s==='dark'?s==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark');}catch(e){}})();`;
}
