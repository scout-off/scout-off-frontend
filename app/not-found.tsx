import Link from "next/link";
import { defaultLocale } from "@/i18n/routing";

export const metadata = {
  title: "Page Not Found — ScoutOff",
};

// Minimal fallback rendered for paths outside any locale (e.g. a route that the
// next-intl middleware didn't rewrite). It owns its own <html> because it sits
// outside the `app/[locale]` layout, and it links (and redirects) to the
// default-locale home rather than rendering a nested locale document.
export default function NotFound() {
  const home = `/${defaultLocale}`;
  return (
    <html lang={defaultLocale}>
      <body className="bg-[#0A0F1E] text-gray-100 min-h-screen flex flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-6xl font-bold text-brand-green">404</p>
        <h1 className="text-3xl font-bold text-white">Page not found</h1>
        <p className="text-gray-400 max-w-md">
          The page you are looking for does not exist or may have been moved.
        </p>
        <Link href={home} className="text-brand-green font-semibold underline">
          Go to ScoutOff home
        </Link>
      </body>
    </html>
  );
}
