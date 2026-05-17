import Link from "next/link";
import WalletButton from "./WalletButton";

export default function Navbar() {
  return (
    <nav className="border-b border-gray-800 bg-brand-dark">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/" className="text-brand-green font-bold text-xl tracking-tight">
          ScoutOff
        </Link>
        <div className="flex items-center gap-6 text-sm text-gray-300">
          <Link href="/scout" className="hover:text-white transition">Scout Dashboard</Link>
          <Link href="/player" className="hover:text-white transition">Player Dashboard</Link>
          <WalletButton />
        </div>
      </div>
    </nav>
  );
}
