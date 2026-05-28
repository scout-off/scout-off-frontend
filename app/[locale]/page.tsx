import Link from "next/link";
import { useTranslations } from "next-intl";

export default function HomePage() {
  const t = useTranslations("home");

  return (
    <section className="flex flex-col items-center text-center gap-8 py-20">
      <h1 className="text-5xl font-bold text-white leading-tight">
        {t("headline")} <br />
        <span className="text-brand-green">{t("headlineHighlight")}</span>
      </h1>
      <p className="text-gray-400 max-w-xl text-lg">{t("subheadline")}</p>
      <div className="flex gap-4">
        <Link
          href="/player"
          className="bg-brand-green text-black font-semibold px-6 py-3 rounded-xl hover:opacity-90 transition"
        >
          {t("ctaPlayer")}
        </Link>
        <Link
          href="/scout"
          className="border border-brand-green text-brand-green px-6 py-3 rounded-xl hover:bg-brand-green hover:text-black transition"
        >
          {t("ctaScout")}
        </Link>
      </div>
    </section>
  );
}
