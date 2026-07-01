'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from './useWallet';

export function useRequireWallet() {
  const { publicKey, isAuthenticated, isConnecting, isRestoringSession } =
    useWallet();
  const router = useRouter();

  useEffect(() => {
    // Don't redirect while session is being restored from the server — this
    // prevents a flash-redirect for users who are already authenticated.
    if (isRestoringSession) return;
    if (!isConnecting && !isAuthenticated) {
      router.replace('/');
    }
  }, [publicKey, isAuthenticated, isConnecting, isRestoringSession, router]);

  return { walletAddress: publicKey };
}
