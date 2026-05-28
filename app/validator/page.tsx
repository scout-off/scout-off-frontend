"use client";

import { useEffect, useRef } from "react";
import type { Metadata } from "next";
import { useRouter } from "next/navigation";
import { useRequireWallet } from "@/hooks/useRequireWallet";
import { useValidator } from "@/hooks/useValidator";
import { useToast } from "@/components/ui/Toast";
import ApproveForm from "@/components/validator/ApproveForm";
import ErrorBoundary from "@/components/ui/ErrorBoundary";

export const metadata: Metadata = {
  title: "Validator Dashboard",
};

function PendingMilestoneQueue() {
  return (
    <section className="bg-brand-card border border-gray-800 rounded-3xl p-6 text-white shadow-sm shadow-black/20">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Pending Milestones</h2>
          <p className="mt-1 text-sm text-gray-400">
            Review submissions awaiting validator approval.
          </p>
        </div>
      </div>

      <div className="rounded-3xl border border-dashed border-gray-700 bg-white/5 p-6 text-sm text-gray-400">
        <p className="mb-3">No items are currently queued for approval.</p>
        <p className="text-xs text-gray-500">
          Pending milestone requests will appear here once players submit evidence.
        </p>
      </div>
    </section>
  );
}

function ValidatorDashboardSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <div className="h-10 w-64 rounded-full bg-gray-800/80 animate-pulse" aria-hidden="true" />

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <div className="space-y-4 rounded-3xl border border-gray-800 bg-brand-card p-6 shadow-sm shadow-black/10">
          <div className="h-6 w-48 rounded-full bg-gray-800/80 animate-pulse" aria-hidden="true" />
          <div className="space-y-4">
            <div className="h-48 rounded-3xl bg-gray-800/80 animate-pulse" aria-hidden="true" />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="h-24 rounded-2xl bg-gray-800/80 animate-pulse" aria-hidden="true" />
              <div className="h-24 rounded-2xl bg-gray-800/80 animate-pulse" aria-hidden="true" />
            </div>
          </div>
        </div>

        <div className="space-y-4 rounded-3xl border border-gray-800 bg-brand-card p-6 shadow-sm shadow-black/10">
          <div className="h-6 w-40 rounded-full bg-gray-800/80 animate-pulse" aria-hidden="true" />
          <div className="space-y-4">
            <div className="h-64 rounded-3xl bg-gray-800/80 animate-pulse" aria-hidden="true" />
          </div>
        </div>
      </div>
    </div>
  );
}

function ValidatorDashboardContent() {
  const { walletAddress: publicKey } = useRequireWallet();
  const router = useRouter();
  const toast = useToast();
  const redirectToastShown = useRef(false);
  const { isValidator, checking } = useValidator(publicKey);

  useEffect(() => {
    if (!publicKey || checking || isValidator || redirectToastShown.current) {
      return;
    }

    redirectToastShown.current = true;
    toast.show({
      message: "Access restricted to approved validators",
      variant: "error",
    });
    router.replace("/");
  }, [publicKey, checking, isValidator, router, toast]);

  if (!publicKey || checking) {
    return <ValidatorDashboardSkeleton />;
  }

  if (!isValidator) {
    return null;
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Validator Dashboard</h1>
          <p className="mt-2 max-w-2xl text-sm text-gray-400">
            Approve milestone submissions and monitor pending queue items for your validated wallet.
          </p>
        </div>

        <a
          href="https://docs.scoutoff.xyz/validators"
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center justify-center rounded-full border border-gray-700 bg-white/5 px-4 py-2 text-sm font-medium text-brand-green transition hover:border-brand-green hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-brand-green focus:ring-offset-2 focus:ring-offset-slate-950"
        >
          Validator guide
        </a>
      </header>

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <PendingMilestoneQueue />
        <ApproveForm onSuccess={() => undefined} />
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
