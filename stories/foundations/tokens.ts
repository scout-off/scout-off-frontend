import resolveConfig from 'tailwindcss/resolveConfig';
import tailwindConfig from '../../tailwind.config';

/** Resolved Tailwind theme — single source of truth for Foundations docs. */
export const theme = resolveConfig(tailwindConfig).theme;

/** Brand color tokens from `tailwind.config.ts` (CSS-variable backed). */
export const brandColors = (theme.colors as unknown as Record<string, unknown>)
  .brand as Record<string, string>;

/** Default Tailwind spacing scale from the resolved config. */
export const spacingScale = theme.spacing as Record<string, string>;

/** Default Tailwind font-size scale from the resolved config. */
export const fontSizeScale = theme.fontSize as Record<
  string,
  string | [string, { lineHeight?: string }]
>;

export const fontFamily = theme.fontFamily as Record<string, string[]>;

/** Pick a readable subset of spacing keys for the live demo. */
export const SPACING_KEYS = [
  '0',
  '1',
  '2',
  '3',
  '4',
  '6',
  '8',
  '10',
  '12',
  '16',
  '20',
  '24',
  '32',
];

/** Pick a readable subset of type sizes for the live demo. */
export const TYPE_KEYS = ['xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl', '4xl'];

export function fontSizeValue(
  entry: string | [string, { lineHeight?: string }],
): string {
  return Array.isArray(entry) ? entry[0] : entry;
}

export function lineHeightValue(
  entry: string | [string, { lineHeight?: string }],
): string | undefined {
  return Array.isArray(entry) ? entry[1]?.lineHeight : undefined;
}
