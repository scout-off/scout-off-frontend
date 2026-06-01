'use client';
import Link from 'next/link';
import WalletButton from './WalletButton';
import { useContractHealth } from '@/hooks/useContractHealth';

const NAV_LINKS = [
  { href: "/scout", label: "Scout Dashboard" },
  { href: "/player", label: "Player Dashboard" },
];

export default function Navbar() {
  const { paused } = useContractHealth();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      {paused && (
        <div className="bg-yellow-500 text-black text-center text-sm font-medium py-2 px-4">
          ⚠️ ScoutOff is currently under maintenance. Write actions are
          temporarily disabled.
        </div>
      )}
      <nav
        aria-label="Main navigation"
        className="border-b border-gray-800 bg-brand-dark"
      >
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link
            href="/"
            className="text-brand-green font-bold text-xl tracking-tight"
          >
            ScoutOff
          </Link>
          <div className="flex items-center gap-6 text-sm text-gray-300">
            <Link href="/scout" className="hover:text-white transition">
              Scout Dashboard
            </Link>
            <Link href="/player" className="hover:text-white transition">
              Player Dashboard
            </Link>
            <WalletButton />
          </div>

          {/* Mobile menu toggle */}
          <button
            type="button"
            className="sm:hidden p-2 rounded text-gray-300 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-green"
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
            onClick={() => setMenuOpen((prev) => !prev)}
          >
            {/* Hamburger / close icon */}
            <svg
              aria-hidden="true"
              focusable="false"
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              {menuOpen ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              )}
            </svg>
          </button>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div
            id="mobile-menu"
            className="sm:hidden border-t border-gray-800 bg-brand-dark px-4 py-3 flex flex-col gap-3 text-sm text-gray-300"
          >
            {NAV_LINKS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                aria-current={pathname === href ? "page" : undefined}
                className="hover:text-white transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-green rounded py-1"
                onClick={() => setMenuOpen(false)}
              >
                {label}
              </Link>
            ))}
            <WalletButton />
          </div>
        )}
      </nav>
    </>
  );
}
