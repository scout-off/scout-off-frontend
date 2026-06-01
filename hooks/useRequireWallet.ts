'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from './useWallet';

export function useRequireWallet() {
  const { publicKey, isAuthenticated, isConnecting } = useWallet();
  const router = useRouter();
  const { show } = useToast();

  useEffect(() => {
    if (!isConnecting && (!publicKey || !isAuthenticated)) {
      router.replace('/');
      // You could trigger a toast here if a Toast system is available
    }
  }, [publicKey, isAuthenticated, isConnecting, router, show]);

  return { walletAddress: publicKey };
}
