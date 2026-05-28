"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRequireWallet } from "@/hooks/useRequireWallet";
import ProgressBar from "@/components/ProgressBar";
import { uploadToIPFS } from "@/lib/ipfs";
import { buildRegisterPlayer } from "@/lib/contract";
import ErrorBoundary from "@/components/ui/ErrorBoundary";

function PlayerDashboardContent() {
  const { walletAddress: publicKey } = useRequireWallet();
  const t = useTranslations("player");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState("");
  const [position, setPosition] = useState("");
  const [region, setRegion] = useState("");
  const [age, setAge] = useState("");

  if (!publicKey) return null;

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !publicKey) return;
    setSubmitting(true);
    try {
      const cid = await uploadToIPFS(file);
      await buildRegisterPlayer(
        publicKey,
        { name, position, region, age: Number(age), nationality: "" },
        cid
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-8">
      <h1 className="text-3xl font-bold text-white">{t("dashboard")}</h1>
      <form
        onSubmit={handleRegister}
        className="bg-brand-card border border-gray-800 rounded-xl p-6 flex flex-col gap-4"
      >
        <h2 className="text-xl font-semibold text-white">{t("createProfile")}</h2>
        <input className="input" placeholder={t("namePlaceholder")} value={name} onChange={(e) => setName(e.target.value)} required />
        <input className="input" placeholder={t("positionPlaceholder")} value={position} onChange={(e) => setPosition(e.target.value)} required />
        <input className="input" placeholder={t("regionPlaceholder")} value={region} onChange={(e) => setRegion(e.target.value)} required />
        <input className="input" type="number" placeholder={t("agePlaceholder")} value={age} onChange={(e) => setAge(e.target.value)} required />
        <label className="text-sm text-gray-400">
          {t("highlightLabel")}
          <input type="file" accept="video/*,image/*" className="mt-1 block" onChange={(e) => setFile(e.target.files?.[0] ?? null)} required />
        </label>
        <button
          type="submit"
          disabled={submitting}
          className="bg-brand-green text-black font-semibold py-2 rounded-lg hover:opacity-90 transition disabled:opacity-50"
        >
          {submitting ? t("registeringButton") : t("registerButton")}
        </button>
      </form>
    </div>
  );
}

export default function PlayerDashboard() {
  return (
    <ErrorBoundary>
      <PlayerDashboardContent />
    </ErrorBoundary>
  );
}
