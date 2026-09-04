"use client";

import { useState } from "react";
import { Loader2, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StakeConfirmDialog } from "@/components/mod/StakeConfirmDialog";
import { useCommunities, useModWrites, useProtocolConfig } from "@/lib/hooks/useModAppeal";
import { useWallet } from "@/lib/genlayer/WalletProvider";
import { formatGen } from "@/lib/utils/format";
import { success, error as toastError } from "@/lib/utils/toast";
import { friendlyTxError } from "@/components/RateLimitNotice";
import { PENALTY_LABELS, type TransactionProgress } from "@/lib/contracts/ModAppeal";

const ADDR_RE = /^0x[a-fA-F0-9]{40}$/;
const MIN_STAKE_WEI = 10_000_000_000_000_000n;

export function PublishCaseForm({ onDone }: { onDone?: () => void }) {
  const { address, isConnected } = useWallet();
  const writes = useModWrites();
  const { data: communities = [] } = useCommunities();
  const { data: config } = useProtocolConfig();
  const stakeWei = config ? BigInt(String(config.minimum_stake)) : MIN_STAKE_WEI;

  const [communityId, setCommunityId] = useState("0");
  const [target, setTarget] = useState("");
  const [title, setTitle] = useState("");
  const [facts, setFacts] = useState("");
  const [violation, setViolation] = useState("");
  const [level, setLevel] = useState("3");
  const [details, setDetails] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [progress, setProgress] = useState<TransactionProgress | null>(null);
  const pending = writes.publish.isPending;

  const validate = () => {
    if (!isConnected || !address) throw new Error("Connect your wallet to continue");
    if (!ADDR_RE.test(target.trim())) throw new Error("Target must be 0x + 40 hex characters");
    if (target.trim().toLowerCase() === address.toLowerCase()) {
      throw new Error("You cannot publish a case against yourself");
    }
    if (title.trim().length < 3) throw new Error("Title is too short");
    if (facts.trim().length < 20) throw new Error("Case facts must be at least 20 characters");
    if (violation.trim().length < 10) throw new Error("Alleged violation is too short");
    if (details.trim().length < 5) throw new Error("Penalty details are required");
    const penalty = Number(level);
    if (![1, 2, 3, 4].includes(penalty)) throw new Error("Penalty level must be 1–4");
    return { penalty, cid: Number(communityId) };
  };

  const submit = async () => {
    try {
      const { penalty, cid } = validate();
      setProgress({ stage: "preparing" });
      await writes.publish.mutateAsync([
        cid,
        target.trim(),
        title.trim(),
        facts.trim(),
        violation.trim(),
        penalty,
        details.trim(),
        0,
        stakeWei,
        setProgress,
      ]);
      success("Case published", {
        description: "The named user can appeal once before the deadline.",
      });
      setProgress(null);
      setConfirmOpen(false);
      setTarget("");
      setTitle("");
      setFacts("");
      setViolation("");
      setDetails("");
      onDone?.();
    } catch (err) {
      setProgress(null);
      toastError("Unable to publish case", { description: friendlyTxError(err) });
    }
  };

  return (
    <>
      <form
        className="glass-card space-y-5 p-6 md:p-8"
        onSubmit={(e) => {
          e.preventDefault();
          try {
            validate();
            setConfirmOpen(true);
          } catch (err) {
            toastError(err instanceof Error ? err.message : "Invalid form");
          }
        }}
      >
        <div className="flex items-start gap-4">
          <span className="gradient-brand flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white">
            <Scale className="h-5 w-5" />
          </span>
          <div>
            <p className="mb-1 text-xs font-semibold tracking-[0.14em] text-primary uppercase">
              Moderator
            </p>
            <h2 className="font-display text-xl font-bold">Publish a case</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Target must have accepted the current policy. Stake is fixed at{" "}
              {formatGen(stakeWei)} GEN. Do not include personal data.
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="cid">Community</Label>
            <select
              id="cid"
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              value={communityId}
              onChange={(e) => setCommunityId(e.target.value)}
              disabled={!isConnected || pending}
            >
              {communities.length === 0 && <option value="0">0</option>}
              {communities.map((c) => (
                <option key={c.id} value={c.id}>
                  #{c.id} {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="target">Target user</Label>
            <Input
              id="target"
              required
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="0x…"
              disabled={!isConnected || pending}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            required
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={!isConnected || pending}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="facts">Public case facts ({facts.length}/8000, min 20)</Label>
          <Textarea
            id="facts"
            required
            rows={4}
            value={facts}
            onChange={(e) => setFacts(e.target.value.slice(0, 8000))}
            disabled={!isConnected || pending}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="violation">Alleged violation ({violation.length}/3000)</Label>
          <Textarea
            id="violation"
            required
            rows={3}
            value={violation}
            onChange={(e) => setViolation(e.target.value.slice(0, 3000))}
            disabled={!isConnected || pending}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="level">Penalty level</Label>
            <select
              id="level"
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              disabled={!isConnected || pending}
            >
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n} · {PENALTY_LABELS[n]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="details">Penalty details</Label>
            <Input
              id="details"
              required
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Seven-day suspension"
              disabled={!isConnected || pending}
            />
          </div>
        </div>

        <Button type="submit" variant="gradient" className="w-full" disabled={!isConnected || pending}>
          {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Scale className="mr-2 h-4 w-4" />}
          Review stake and publish
        </Button>
        {progress && (
          <p className="text-sm text-muted-foreground capitalize">Transaction: {progress.stage}</p>
        )}
      </form>

      <StakeConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Confirm case publish"
        description="You are locking the protocol stake behind this case. The target can appeal once. The policy snapshot cannot change for this case."
        stakeLabel={`${formatGen(stakeWei)} GEN`}
        warnings={[
          "Target must have accepted the current policy",
          "You cannot raise the penalty if they appeal",
          "If they win, they receive both stakes",
          "Do not include personal or private data",
        ]}
        pending={pending}
        onConfirm={submit}
      />
    </>
  );
}
