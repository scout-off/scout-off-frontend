// Root layout: a pass-through. `app/[locale]/layout.tsx` owns the
// `<html lang={locale}>` / `<body>` so the document language matches the route
// locale, and the global `app/not-found.tsx` renders its own `<html>` for
// paths outside any locale. Keeping this layout html-free avoids double-wrapping
// while still satisfying Next's requirement that every route sit under a root layout.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
