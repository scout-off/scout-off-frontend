"use client";
import { useTranslations } from "next-intl";
import { useRequireWallet } from "@/hooks/useRequireWallet";
import ErrorBoundary from "@/components/ui/ErrorBoundary";

function ValidatorDashboardContent() {
  const { walletAddress: publicKey } = useRequireWallet();
  const t = useTranslations("validator");

  if (!publicKey) return null;

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-3xl font-bold text-white">{t("dashboard")}</h1>
      <div className="bg-brand-card border border-gray-800 rounded-xl p-6">
        <p className="text-gray-400">
          {t("welcome", { address: `${publicKey.slice(0, 4)}...${publicKey.slice(-4)}` })}
        </p>
      </div>
    </div>
  );
}

export default function ValidatorDashboard() {
  return (
    <ErrorBoundary>
      <ValidatorDashboardContent />
    </ErrorBoundary>
  );
}
