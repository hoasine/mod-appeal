"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LayoutDashboard, Loader2, PenLine, Scale, Shield, Timer } from "lucide-react";
import { ContractSetupBanner } from "@/components/ContractSetupBanner";
import { RateLimitNotice } from "@/components/RateLimitNotice";
import { HowItWorks } from "@/components/mod/HowItWorks";
import { FairnessLedger } from "@/components/mod/FairnessLedger";
import { CreateCommunityForm } from "@/components/mod/CreateCommunityForm";
import { CommunityCard } from "@/components/mod/CommunityCard";
import { PublishCaseForm } from "@/components/mod/PublishCaseForm";
import { CaseCard } from "@/components/mod/CaseCard";
import { useCases, useCommunities, useCounts, type CaseFilter } from "@/lib/hooks/useModAppeal";
import { getContractAddress } from "@/lib/genlayer/client";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "communities", label: "Communities", icon: Shield },
  { id: "board", label: "Board", icon: Scale },
  { id: "publish", label: "Publish", icon: PenLine },
] as const;

const FILTERS: { id: CaseFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "moderator", label: "My cases" },
  { id: "mine", label: "Against me" },
  { id: "open", label: "Open" },
];

type TabId = (typeof TABS)[number]["id"];

export function ModApp() {
  const search = useSearchParams();
  const initialTab: TabId =
    search.get("tab") === "publish"
      ? "publish"
      : search.get("tab") === "board"
        ? "board"
        : search.get("tab") === "communities"
          ? "communities"
          : "overview";
  const [tab, setTab] = useState<TabId>(initialTab);
  const [filter, setFilter] = useState<CaseFilter>("all");
  const contract = getContractAddress();
  const { data: communities = [], isLoading: communitiesLoading } = useCommunities();
  const {
    data: cases = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useCases(tab === "board" || tab === "overview" ? filter : "all");
  const { data: counts } = useCounts();

  const stats = useMemo(() => {
    const open = cases.filter((c) => c.has_open_appeal).length;
    const active = cases.filter((c) => !c.closed).length;
    return [
      { label: "Communities", value: counts?.communities ?? communities.length, icon: Shield },
      { label: "Cases", value: counts?.cases ?? cases.length, icon: Scale },
      { label: "Active cases", value: active, icon: Timer },
      { label: "Open appeals", value: open, icon: LayoutDashboard },
    ];
  }, [cases, communities.length, counts]);

  return (
    <div className="space-y-8">
      <ContractSetupBanner />
      <RateLimitNotice />
      {contract && (
        <p className="text-center font-mono text-xs text-muted-foreground">
          Contract: {contract.slice(0, 10)}...{contract.slice(-8)}
        </p>
      )}

      <nav className="flex flex-wrap justify-center gap-2 rounded-xl border border-white/5 bg-black/40 p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all",
              tab === t.id
                ? "gradient-purple-pink text-white shadow-md"
                : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
            )}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "overview" && (
        <div className="animate-fade-in space-y-8">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {stats.map((item) => (
              <div key={item.label} className="glass-card flex flex-col gap-3 p-5">
                <item.icon className="h-5 w-5 text-accent" />
                <p className="font-display text-2xl font-bold">{item.value}</p>
                <p className="text-xs text-muted-foreground">{item.label}</p>
              </div>
            ))}
          </div>
          <HowItWorks />
          <FairnessLedger />
        </div>
      )}

      {tab === "communities" && (
        <div className="animate-fade-in space-y-6">
          <div className="mx-auto max-w-xl">
            <CreateCommunityForm />
          </div>
          {communitiesLoading && (
            <p className="text-center text-sm text-muted-foreground">Loading communities…</p>
          )}
          <div className="mx-auto max-w-3xl space-y-4">
            {communities.map((c) => (
              <CommunityCard key={c.id} community={c} />
            ))}
          </div>
        </div>
      )}

      {tab === "publish" && (
        <div className="mx-auto max-w-xl animate-fade-in">
          <PublishCaseForm onDone={() => setTab("board")} />
        </div>
      )}

      {tab === "board" && (
        <div className="animate-fade-in space-y-5">
          <div className="flex flex-wrap justify-center gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
                  filter === f.id
                    ? "gradient-purple-pink text-white"
                    : "border border-white/10 text-muted-foreground hover:bg-white/5 hover:text-foreground"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          {isLoading && (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading cases…
            </div>
          )}
          {isError && (
            <div className="glass-card p-4 text-sm">
              <p className="text-destructive">Failed to load cases.</p>
              <p className="mt-1 text-muted-foreground">
                {error instanceof Error ? error.message : "Unknown error"}
              </p>
              <button type="button" className="mt-2 text-accent underline" onClick={() => refetch()}>
                Retry
              </button>
            </div>
          )}
          {!isLoading && !isError && cases.length === 0 && (
            <div className="glass-card p-10 text-center">
              <p className="font-display text-lg font-bold">No cases yet</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Create a community, accept the policy, then publish a case.
              </p>
            </div>
          )}
          <div className="mx-auto max-w-3xl space-y-4">
            {cases.map((c) => (
              <CaseCard key={c.id} caseItem={c} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
