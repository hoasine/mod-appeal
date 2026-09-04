"use client";

import { BarChart3 } from "lucide-react";
import { useFairnessLedger } from "@/lib/hooks/useModAppeal";

export function FairnessLedger() {
  const { data } = useFairnessLedger();
  const ledger = data ?? {
    uphold: 0,
    reduce: 0,
    revoke: 0,
    inconclusive: 0,
    cancelled: 0,
    withdrawn: 0,
    expired: 0,
    judged: 0,
    judged_without_moderator_response: 0,
  };

  const rows = [
    { label: "Uphold", value: ledger.uphold },
    { label: "Reduce", value: ledger.reduce },
    { label: "Revoke", value: ledger.revoke },
    { label: "Inconclusive", value: ledger.inconclusive },
    { label: "Cancelled", value: ledger.cancelled },
    { label: "Withdrawn", value: ledger.withdrawn },
    { label: "Expired", value: ledger.expired },
    { label: "Judged with no reply", value: ledger.judged_without_moderator_response },
  ];

  return (
    <section className="glass-card p-6 md:p-8">
      <div className="mb-4 flex items-center gap-3">
        <BarChart3 className="h-5 w-5 text-accent" />
        <div>
          <h2 className="font-display text-2xl font-bold">Fairness ledger</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            On-chain counts of how appeals end.
            {ledger.judged > 0 ? ` ${ledger.judged} judged so far.` : ""}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {rows.map((row) => (
          <div key={row.label} className="soft-tile px-3 py-3">
            <p className="font-display text-xl font-bold">{row.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{row.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
