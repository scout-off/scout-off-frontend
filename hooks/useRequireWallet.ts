"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useWalletContext } from "@/context/WalletContext";

export function useRequireWallet() {
  const { isAuthenticated, isConnecting } = useWalletContext();
  const router = useRouter();

  useEffect(() => {
    if (!isConnecting && !isAuthenticated) {
      router.replace("/");
    }
  }, [isAuthenticated, isConnecting, router]);
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
    if (!isConnecting && (!publicKey || !isAuthenticated)) {
      router.replace('/');
    }
  }, [publicKey, isAuthenticated, isConnecting, isRestoringSession, router]);

  return { walletAddress: publicKey };
}
