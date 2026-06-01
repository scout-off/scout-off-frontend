import Link from 'next/link';
import {
  Github,
  MessageCircle,
  BookOpen,
  Zap,
  ShieldCheck,
  Users,
  TrendingUp,
} from 'lucide-react';

// ── Feature card data ─────────────────────────────────────────────────────────
const features = [
  {
    icon: ShieldCheck,
    title: 'Tamper-Proof Profiles',
    description:
      'Every player profile and milestone is stored on Stellar Soroban smart contracts — immutable, verifiable, and owned by the player.',
  },
  {
    icon: TrendingUp,
    title: 'On-Chain Milestones',
    description:
      'Validators approve performance milestones directly on-chain. No middlemen, no falsified records — just verifiable progress.',
  },
  {
    icon: Users,
    title: 'Direct Scout Access',
    description:
      'Scouts subscribe and pay to unlock player contact details. Transparent fees, instant access, no agency gatekeeping.',
  },
  {
    icon: Zap,
    title: 'Powered by Stellar',
    description:
      "Built on Stellar's fast, low-cost network. Transactions settle in seconds with near-zero fees — accessible to everyone.",
  },
];

export default function HomePage() {
  return (
    <div className="flex flex-col gap-24 pb-20">
      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section
        className="relative flex flex-col items-center text-center gap-8 py-24 px-4 overflow-hidden rounded-2xl"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(0,200,83,0.12) 0%, transparent 70%), linear-gradient(180deg, #0d1526 0%, #0A0F1E 100%)',
        }}
      >
        {/* Subtle grid overlay */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              'linear-gradient(#00C853 1px, transparent 1px), linear-gradient(90deg, #00C853 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />

        <div className="relative z-10 flex flex-col items-center gap-6 max-w-3xl mx-auto">
          <span className="inline-flex items-center gap-2 text-xs font-semibold tracking-widest uppercase text-brand-green border border-brand-green/30 bg-brand-green/10 px-4 py-1.5 rounded-full">
            <Zap size={12} />
            Powered by Stellar Soroban
          </span>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-white leading-tight">
            Discover Football Talent{' '}
            <span className="text-brand-green">On-Chain</span>
          </h1>

          <p className="text-gray-400 max-w-xl text-base sm:text-lg leading-relaxed">
            Tamper-proof player profiles, verifiable milestones, and direct
            scout-to-player connections — powered by Stellar Soroban smart
            contracts.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
            <Link
              href="/player"
              className="bg-brand-green text-black font-semibold px-8 py-3 rounded-xl hover:opacity-90 active:scale-95 transition text-center"
            >
              I&apos;m a Player
            </Link>
            <Link
              href="/scout"
              className="border border-brand-green text-brand-green px-8 py-3 rounded-xl hover:bg-brand-green hover:text-black active:scale-95 transition text-center"
            >
              I&apos;m a Scout
            </Link>
          </div>
        </div>
      </section>

      {/* ── Features ──────────────────────────────────────────────────────── */}
      <section className="px-4">
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">
            Why ScoutOff?
          </h2>
          <p className="text-gray-400 max-w-lg mx-auto text-sm sm:text-base">
            A decentralized platform that puts players and scouts in control —
            no intermediaries, no hidden fees.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map(({ icon: Icon, title, description }) => (
            <div
              key={title}
              className="flex flex-col gap-4 bg-brand-card border border-gray-800 rounded-2xl p-6 hover:border-brand-green/40 transition"
            >
              <div className="w-10 h-10 flex items-center justify-center rounded-xl bg-brand-green/10 text-brand-green">
                <Icon size={20} />
              </div>
              <h3 className="text-white font-semibold text-base">{title}</h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                {description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer className="border-t border-gray-800 pt-10 px-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-6 max-w-4xl mx-auto">
          <p className="text-gray-500 text-sm">
            © {new Date().getFullYear()} ScoutOff. Built on Stellar.
          </p>
          <nav
            className="flex items-center gap-6"
            aria-label="Footer navigation"
          >
            <a
              href="https://github.com/jhayniffy/scout-off"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-gray-400 hover:text-white text-sm transition"
            >
              <Github size={15} />
              GitHub
            </a>
            <a
              href="https://discord.gg/stellar"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-gray-400 hover:text-white text-sm transition"
            >
              <MessageCircle size={15} />
              Stellar Discord
            </a>
            <a
              href="/README.md"
              className="flex items-center gap-1.5 text-gray-400 hover:text-white text-sm transition"
            >
              <BookOpen size={15} />
              README
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
