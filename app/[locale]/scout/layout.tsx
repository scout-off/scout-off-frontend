import type { Metadata } from 'next';
import { ReactNode } from 'react';

const ROOT_URL = 'https://scoutoff.app';

export const metadata: Metadata = {
  title: 'Scout Dashboard — ScoutOff',
  description:
    'Discover and connect with verified football players on ScoutOff. Filter by region, position, and progress level.',
  openGraph: {
    title: 'Scout Dashboard — ScoutOff',
    description:
      'Discover and connect with verified football players on ScoutOff. Filter by region, position, and progress level.',
    url: `${ROOT_URL}/scout`,
    siteName: 'ScoutOff',
    type: 'website',
    images: [
      {
        url: `${ROOT_URL}/og-image.svg`,
        width: 1200,
        height: 630,
        alt: 'Scout Dashboard — ScoutOff',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Scout Dashboard — ScoutOff',
    description:
      'Discover and connect with verified football players on ScoutOff. Filter by region, position, and progress level.',
    images: [`${ROOT_URL}/og-image.svg`],
  },
};

export default function ScoutLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
