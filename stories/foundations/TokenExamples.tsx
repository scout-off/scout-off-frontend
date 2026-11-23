import React from 'react';
import {
  brandColors,
  spacingScale,
  fontSizeScale,
  fontFamily,
  SPACING_KEYS,
  TYPE_KEYS,
  fontSizeValue,
  lineHeightValue,
} from './tokens';

const sectionStyle: React.CSSProperties = {
  marginBottom: '2.5rem',
};

const labelStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  color: '#9ca3af',
  marginBottom: '0.25rem',
};

/**
 * Live swatches for brand color tokens pulled from `tailwind.config.ts`.
 */
export function ColorSwatches() {
  return (
    <div style={sectionStyle}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
          gap: '1rem',
        }}
      >
        {Object.entries(brandColors).map(([name, value]) => (
          <div key={name}>
            <div
              style={{
                height: 72,
                borderRadius: 8,
                // Storybook preview maps --green/--bg/--card (see .storybook/tailwind.css)
                background:
                  name === 'green'
                    ? 'var(--green)'
                    : name === 'dark'
                      ? 'var(--bg)'
                      : 'var(--card)',
                border: '1px solid rgba(255,255,255,0.08)',
                marginBottom: 8,
              }}
              title={value}
            />
            <div style={{ fontWeight: 600, color: '#f9fafb' }}>
              brand.{name}
            </div>
            <code style={{ ...labelStyle, display: 'block' }}>{value}</code>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Spacing scale bars using values from the resolved Tailwind theme.
 */
export function SpacingScale() {
  return (
    <div style={sectionStyle}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {SPACING_KEYS.map((key) => {
          const value = spacingScale[key];
          return (
            <div
              key={key}
              style={{ display: 'flex', alignItems: 'center', gap: 12 }}
            >
              <code style={{ width: 48, color: '#9ca3af', fontSize: 12 }}>
                {key}
              </code>
              <div
                style={{
                  height: 12,
                  width: value,
                  background: 'var(--green)',
                  borderRadius: 2,
                  minWidth: value === '0px' ? 2 : undefined,
                }}
              />
              <code style={{ color: '#6b7280', fontSize: 12 }}>{value}</code>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Typography scale samples using font sizes from the resolved Tailwind theme.
 */
export function TypographyScale() {
  const sans = (fontFamily.sans ?? ['system-ui', 'sans-serif']).join(', ');

  return (
    <div style={sectionStyle}>
      <p style={{ ...labelStyle, marginBottom: 16 }}>
        font-family.sans: {sans}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {TYPE_KEYS.map((key) => {
          const entry = fontSizeScale[key];
          const size = fontSizeValue(entry);
          const lh = lineHeightValue(entry);
          return (
            <div key={key}>
              <div style={labelStyle}>
                text-{key} · {size}
                {lh ? ` / ${lh}` : ''}
              </div>
              <p
                style={{
                  margin: 0,
                  fontSize: size,
                  lineHeight: lh,
                  fontFamily: sans,
                  color: '#f9fafb',
                }}
              >
                Discover football talent on-chain
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
