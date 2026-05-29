"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "./useWallet";
import { useToast } from "@/components/ui/Toast";

export function useRequireWallet() {
  const { publicKey, isAuthenticated, isConnecting } = useWallet();
  const router = useRouter();
  const { show } = useToast();

  useEffect(() => {
    if (!isConnecting && (!publicKey || !isAuthenticated)) {
      router.replace("/");
      show({
        message: "Please connect your wallet",
        variant: "info",
      });
    }
  }, [publicKey, isAuthenticated, isConnecting, router, show]);

  return { walletAddress: publicKey };
}
