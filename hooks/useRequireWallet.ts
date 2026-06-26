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
  const { publicKey, isAuthenticated, isConnecting } = useWallet();
  const router = useRouter();

  useEffect(() => {
    if (!isConnecting && (!publicKey || !isAuthenticated)) {
      router.replace('/');
    }
  }, [publicKey, isAuthenticated, isConnecting, router]);

  return { walletAddress: publicKey };
}
