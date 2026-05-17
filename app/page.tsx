import Link from "next/link";

export default function HomePage() {
  return (
    <section className="flex flex-col items-center text-center gap-8 py-20">
      <h1 className="text-5xl font-bold text-white leading-tight">
        Discover Football Talent <br />
        <span className="text-brand-green">On-Chain</span>
      </h1>
      <p className="text-gray-400 max-w-xl text-lg">
        Tamper-proof player profiles, verifiable milestones, and direct scout-to-player
        connections — powered by Stellar Soroban smart contracts.
      </p>
      <div className="flex gap-4">
        <Link
          href="/player"
          className="bg-brand-green text-black font-semibold px-6 py-3 rounded-xl hover:opacity-90 transition"
        >
          I&apos;m a Player
        </Link>
        <Link
          href="/scout"
          className="border border-brand-green text-brand-green px-6 py-3 rounded-xl hover:bg-brand-green hover:text-black transition"
        >
          I&apos;m a Scout
        </Link>
      </div>
    </section>
  );
}
