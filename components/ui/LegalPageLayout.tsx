import { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

interface LegalPageLayoutProps {
  locale: string;
  backToHomeLabel: string;
  eyebrow: string;
  title: string;
  description: string;
  lastUpdated?: string;
  children: ReactNode;
}

export default function LegalPageLayout({
  locale,
  backToHomeLabel,
  eyebrow,
  title,
  description,
  lastUpdated,
  children,
}: LegalPageLayoutProps) {
  return (
    <div className="flex flex-col gap-10 pb-20">
      {/* Hero section */}
      <section className="relative overflow-hidden rounded-2xl border border-gray-800 bg-brand-card px-6 py-10 sm:px-8 lg:px-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(0,200,83,0.12),_transparent_50%)]" />
        <div className="relative flex flex-col gap-6">
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-brand-green/30 bg-brand-green/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-brand-green">
            {eyebrow}
          </span>
          <div className="max-w-2xl">
            <h1 className="text-3xl font-bold text-white sm:text-4xl">
              {title}
            </h1>
            <p className="mt-3 text-sm leading-7 text-gray-400 sm:text-base">
              {description}
            </p>
            {lastUpdated && (
              <p className="mt-2 text-xs text-gray-500">{lastUpdated}</p>
            )}
          </div>
          <div className="flex justify-start">
            <Link
              href={`/${locale}`}
              className="inline-flex items-center gap-2 text-sm font-medium text-brand-green transition hover:text-green-400"
            >
              {backToHomeLabel}
              <ArrowLeft size={15} />
            </Link>
          </div>
        </div>
      </section>

      {/* Content section */}
      <section className="px-1 sm:px-0">
        <div className="rounded-2xl border border-gray-800 bg-brand-card/70 p-6 sm:p-8 lg:p-10">
          <div className="max-w-none text-sm sm:text-base leading-7 text-gray-300 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-white [&_h2]:mt-8 [&_h2]:mb-3 first:[&_h2]:mt-0 [&_p]:mb-4 [&_a]:text-brand-green [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:text-green-400 [&_strong]:text-white [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-4 [&_li]:mb-1">
            {children}
          </div>
        </div>
      </section>
    </div>
  );
}
