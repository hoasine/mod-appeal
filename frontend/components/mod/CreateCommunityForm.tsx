"use client";

import { useState } from "react";
import { Loader2, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useModWrites } from "@/lib/hooks/useModAppeal";
import { useWallet } from "@/lib/genlayer/WalletProvider";
import { success, error as toastError } from "@/lib/utils/toast";
import { friendlyTxError } from "@/components/RateLimitNotice";
import type { TransactionProgress } from "@/lib/contracts/ModAppeal";

const SAMPLE_POLICY =
  "Community policy: harassment, credible threats, targeted abuse, and spam are prohibited. Penalties must be proportionate to the conduct, its severity, context, repetition, and documented harm. Good-faith criticism is allowed.";

export function CreateCommunityForm({ onDone }: { onDone?: () => void }) {
  const { isConnected } = useWallet();
  const writes = useModWrites();
  const [name, setName] = useState("");
  const [policy, setPolicy] = useState(SAMPLE_POLICY);
  const [progress, setProgress] = useState<TransactionProgress | null>(null);
  const pending = writes.createCommunity.isPending;

  return (
    <form
      className="glass-card space-y-5 p-6 md:p-8"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          if (policy.trim().length < 80) {
            throw new Error("Policy must be at least 80 characters");
          }
          setProgress({ stage: "preparing" });
          await writes.createCommunity.mutateAsync([name.trim(), policy.trim(), setProgress]);
          success("Community created");
          setProgress(null);
          setName("");
          onDone?.();
        } catch (err) {
          setProgress(null);
          toastError("Unable to create community", { description: friendlyTxError(err) });
        }
      }}
    >
      <div className="flex items-start gap-4">
        <span className="gradient-brand flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white">
          <Shield className="h-5 w-5" />
        </span>
        <div>
          <p className="mb-1 text-xs font-semibold tracking-[0.14em] text-primary uppercase">
            Admin
          </p>
          <h2 className="font-display text-xl font-bold">Create a community</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            You become admin. Members must accept this policy before a case can be published.
          </p>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="cname">Name</Label>
        <Input
          id="cname"
          required
          maxLength={120}
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={!isConnected || pending}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="policy">Policy ({policy.length}/12000, min 80)</Label>
        <Textarea
          id="policy"
          required
          rows={6}
          value={policy}
          onChange={(e) => setPolicy(e.target.value.slice(0, 12000))}
          disabled={!isConnected || pending}
        />
      </div>
      <Button type="submit" variant="gradient" className="w-full" disabled={!isConnected || pending}>
        {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Create community
      </Button>
      {progress && (
        <p className="text-sm text-muted-foreground capitalize">Transaction: {progress.stage}</p>
      )}
    </form>
  );
}
