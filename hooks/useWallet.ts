// Thin re-export so existing imports (useWallet) keep working
// while all consumers share the single WalletProvider state.
export { useWalletContext as useWallet } from '@/context/WalletContext';
