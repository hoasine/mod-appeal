"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Scale } from "lucide-react";
import {
  PENALTY_LABELS,
  type AppealView,
  type CaseView,
  type TransactionProgress,
} from "@/lib/contracts/ModAppeal";
import { useCaseAppeal, useModWrites, useProtocolConfig } from "@/lib/hooks/useModAppeal";
import { useWallet } from "@/lib/genlayer/WalletProvider";
import { formatCountdown, formatGen, shortAddr } from "@/lib/utils/format";
import { success, error as toastError } from "@/lib/utils/toast";
import { friendlyTxError } from "@/components/RateLimitNotice";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { StakeConfirmDialog } from "@/components/mod/StakeConfirmDialog";

function statusChip(status: string) {
  if (status === "APPEALED") return "bg-amber/15 text-amber border-amber/40";
  if (status === "SETTLED") return "bg-mint/15 text-mint border-mint/40";
  if (status === "EXPIRED" || status === "INCONCLUSIVE") return "bg-amber/15 text-amber border-amber/40";
  if (status === "CLOSED" || status === "CANCELLED" || status === "WITHDRAWN") {
    return "bg-secondary text-muted-foreground border-border";
  }
  return "bg-sky/15 text-sky border-sky/40";
}

function verdictLabel(verdict: string) {
  if (verdict === "UPHOLD_PENALTY") return "Uphold penalty";
  if (verdict === "REDUCE_PENALTY") return "Reduce penalty";
  if (verdict === "REVOKE_PENALTY") return "Revoke penalty";
  if (verdict === "INCONCLUSIVE") return "Inconclusive";
  if (verdict === "CANCELLED") return "Cancelled";
  if (verdict === "WITHDRAWN") return "Withdrawn";
  if (verdict === "NO_APPEAL") return "No appeal";
  return verdict || "—";
}

function levelLabel(level: number) {
  return `${level} · ${PENALTY_LABELS[level] ?? "Unknown"}`;
}

export function CaseCard({ caseItem }: { caseItem: CaseView }) {
  const { address, isConnected } = useWallet();
  const writes = useModWrites();
  const { data: config } = useProtocolConfig();
  const stakeWei = BigInt(String(config?.minimum_stake ?? caseItem.moderator_stake ?? "0"));
  const [now, setNow] = useState(() => Date.now());
  const [progress, setProgress] = useState<TransactionProgress | null>(null);

  const [appealOpen, setAppealOpen] = useState(false);
  const [confirmAppeal, setConfirmAppeal] = useState(false);
  const [reason, setReason] = useState("");
  const [evidence, setEvidence] = useState("");
  const [requested, setRequested] = useState("1");
  const [responseOpen, setResponseOpen] = useState(false);
  const [response, setResponse] = useState("");
  const [withdrawReason, setWithdrawReason] = useState("");

  const appealQ = useCaseAppeal(caseItem.id, caseItem.appeal_count > 0);
  const appeal: AppealView | null | undefined = appealQ.data;

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const me = address?.toLowerCase();
  const isModerator = Boolean(me && caseItem.moderator.toLowerCase() === me);
  const isTarget = Boolean(me && caseItem.target_user.toLowerCase() === me);
  const beforeDeadline = now < caseItem.appeal_deadline_at * 1000;
  const afterDeadline = now >= caseItem.appeal_deadline_at * 1000;
  const replied = Boolean(appeal?.moderator_response?.trim());
  const responseExpired = Boolean(appeal) && now >= (appeal?.response_deadline_at ?? 0) * 1000;
  const judgeExpired = Boolean(appeal) && now >= (appeal?.judge_deadline_at ?? 0) * 1000;

  const canAppeal =
    isConnected &&
    isTarget &&
    !caseItem.closed &&
    caseItem.status === "APPEALABLE" &&
    caseItem.appeal_count === 0 &&
    beforeDeadline;
  const canCancel = isConnected && isTarget && appeal?.status === "OPEN";
  const canRespond =
    isConnected && isModerator && appeal?.status === "OPEN" && !replied && !responseExpired;
  const canJudge =
    isConnected && appeal?.status === "OPEN" && (replied || responseExpired) && !judgeExpired;
  const canExpire = isConnected && appeal?.status === "OPEN" && judgeExpired;
  const canClose =
    isConnected &&
    !caseItem.closed &&
    caseItem.appeal_count === 0 &&
    !caseItem.has_open_appeal &&
    afterDeadline;
  const canWithdraw =
    isConnected && isModerator && !caseItem.closed && caseItem.status === "APPEALABLE";

  const pending =
    writes.file.isPending ||
    writes.respond.isPending ||
    writes.cancel.isPending ||
    writes.judge.isPending ||
    writes.expire.isPending ||
    writes.close.isPending ||
    writes.withdraw.isPending;

  const countdown = useMemo(
    () => formatCountdown(caseItem.appeal_deadline_at, now),
    [caseItem.appeal_deadline_at, now]
  );

  const run = async (label: string, fn: () => Promise<unknown>) => {
    try {
      setProgress({ stage: "preparing" });
      await fn();
      success(label);
      setProgress(null);
    } catch (err) {
      setProgress(null);
      toastError(`${label} failed`, { description: friendlyTxError(err) });
    }
  };

  const onAppeal = async () => {
    const requestedLevel = Number(requested);
    if (requestedLevel >= caseItem.original_penalty_level) {
      toastError("Requested penalty must be lower than the original");
      return;
    }
    if (reason.trim().length < 20) {
      toastError("Appeal reason must be at least 20 characters");
      return;
    }
    await run("Appeal filed", () =>
      writes.file.mutateAsync([
        caseItem.id,
        reason.trim(),
        evidence.trim(),
        requestedLevel,
        stakeWei,
        setProgress,
      ])
    );
    setConfirmAppeal(false);
    setAppealOpen(false);
    setReason("");
    setEvidence("");
  };

  return (
    <article className="glass-card space-y-4 p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-xl font-bold">{caseItem.title}</h3>
            <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusChip(caseItem.status)}`}>
              {caseItem.status}
            </span>
            {caseItem.final_verdict && (
              <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusChip(caseItem.final_verdict)}`}>
                {verdictLabel(caseItem.final_verdict)}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Case #{caseItem.id} · community #{caseItem.community_id} · moderator{" "}
            {shortAddr(caseItem.moderator)} · target {shortAddr(caseItem.target_user)}
          </p>
        </div>
        <div className="text-right">
          <p className="font-display text-lg font-bold">{levelLabel(caseItem.final_penalty_level)}</p>
          {caseItem.final_penalty_level !== caseItem.original_penalty_level && (
            <p className="text-xs text-muted-foreground">
              Was {levelLabel(caseItem.original_penalty_level)}
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="soft-tile px-3 py-2">
          <p className="text-[0.65rem] tracking-wide text-muted-foreground uppercase">Stake</p>
          <p className="font-semibold">{formatGen(caseItem.moderator_stake)} GEN</p>
        </div>
        <div className="soft-tile px-3 py-2">
          <p className="text-[0.65rem] tracking-wide text-muted-foreground uppercase">Appeal deadline</p>
          <p className="font-semibold">{beforeDeadline ? countdown : "Passed"}</p>
        </div>
        <div className="soft-tile px-3 py-2">
          <p className="text-[0.65rem] tracking-wide text-muted-foreground uppercase">Policy pin</p>
          <p className="font-semibold">v{caseItem.policy_version}</p>
        </div>
      </div>

      <details className="soft-tile px-4 py-3">
        <summary className="cursor-pointer text-sm font-semibold">Facts, violation, and pinned policy</summary>
        <div className="mt-3 space-y-3 whitespace-pre-wrap text-sm text-muted-foreground">
          <p>
            <span className="font-semibold text-foreground">Facts: </span>
            {caseItem.case_facts}
          </p>
          <p>
            <span className="font-semibold text-foreground">Violation: </span>
            {caseItem.alleged_violation}
          </p>
          <p>
            <span className="font-semibold text-foreground">Details: </span>
            {caseItem.penalty_details}
          </p>
          <p>
            <span className="font-semibold text-foreground">Pinned policy: </span>
            {caseItem.policy_snapshot}
          </p>
        </div>
      </details>

      {appeal && (
        <div className="soft-tile space-y-2 px-4 py-3 text-sm">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Appeal #{appeal.id} · {appeal.status} · requested {levelLabel(appeal.requested_penalty_level)}
          </p>
          <p>
            <span className="font-medium text-foreground">Reason:</span> {appeal.reason}
          </p>
          {appeal.evidence && (
            <p className="whitespace-pre-wrap text-muted-foreground">{appeal.evidence}</p>
          )}
          {appeal.moderator_response && (
            <p>
              <span className="font-medium text-foreground">Moderator reply:</span>{" "}
              {appeal.moderator_response}
            </p>
          )}
          {appeal.verdict && (
            <p>
              Verdict: {verdictLabel(appeal.verdict)}
              {appeal.confidence ? ` · confidence ${appeal.confidence}` : ""}
              {appeal.reasoning ? ` — ${appeal.reasoning}` : ""}
            </p>
          )}
          {appeal.judged_without_moderator_response && (
            <p className="text-xs text-amber">Judged after the response window with no moderator reply.</p>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {canAppeal && (
          <Dialog open={appealOpen} onOpenChange={setAppealOpen}>
            <DialogTrigger asChild>
              <Button variant="gradient" size="sm" disabled={pending}>
                <Scale className="h-4 w-4" />
                File appeal
              </Button>
            </DialogTrigger>
            <DialogContent className="brand-card max-w-lg border-2">
              <DialogHeader>
                <DialogTitle className="font-display">File an appeal</DialogTitle>
                <DialogDescription>
                  One-shot. Requested level must be lower. Stake matches the protocol amount.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Reason (min 20)</Label>
                  <Textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value.slice(0, 3000))}
                    rows={3}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Evidence (optional, public)</Label>
                  <Textarea
                    value={evidence}
                    onChange={(e) => setEvidence(e.target.value.slice(0, 8000))}
                    rows={3}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Requested penalty</Label>
                  <select
                    className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                    value={requested}
                    onChange={(e) => setRequested(e.target.value)}
                  >
                    {Array.from({ length: caseItem.original_penalty_level }, (_, i) => i).map((n) => (
                      <option key={n} value={n}>
                        {levelLabel(n)}
                      </option>
                    ))}
                  </select>
                </div>
                <Button variant="gradient" className="w-full" onClick={() => setConfirmAppeal(true)}>
                  Review stake
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}

        {canRespond && appeal && (
          <Dialog open={responseOpen} onOpenChange={setResponseOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={pending}>
                Respond
              </Button>
            </DialogTrigger>
            <DialogContent className="brand-card max-w-lg border-2">
              <DialogHeader>
                <DialogTitle className="font-display">Respond to appeal</DialogTitle>
                <DialogDescription>One response only, before the window closes.</DialogDescription>
              </DialogHeader>
              <Textarea
                value={response}
                onChange={(e) => setResponse(e.target.value.slice(0, 5000))}
                rows={5}
              />
              <Button
                variant="gradient"
                disabled={pending || response.trim().length < 20}
                onClick={async () => {
                  await run("Response submitted", () =>
                    writes.respond.mutateAsync([appeal.id, response.trim(), setProgress])
                  );
                  setResponseOpen(false);
                }}
              >
                Submit response
              </Button>
            </DialogContent>
          </Dialog>
        )}

        {canCancel && appeal && (
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() =>
              run("Appeal cancelled", () => writes.cancel.mutateAsync([appeal.id, setProgress]))
            }
          >
            Cancel appeal
          </Button>
        )}

        {canJudge && appeal && (
          <Button
            variant="gradient"
            size="sm"
            disabled={pending}
            onClick={() =>
              run("Appeal judged", () => writes.judge.mutateAsync([appeal.id, setProgress]))
            }
          >
            {writes.judge.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Judge appeal"}
          </Button>
        )}

        {canExpire && appeal && (
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() =>
              run("Appeal expired", () => writes.expire.mutateAsync([appeal.id, setProgress]))
            }
          >
            Expire & refund
          </Button>
        )}

        {canClose && (
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() =>
              run("Case closed", () => writes.close.mutateAsync([caseItem.id, setProgress]))
            }
          >
            Close case
          </Button>
        )}

        {canWithdraw && (
          <div className="flex w-full flex-wrap items-center gap-2">
            <Textarea
              className="min-h-16 flex-1"
              placeholder="Withdrawal reason (min 10 characters)"
              value={withdrawReason}
              onChange={(e) => setWithdrawReason(e.target.value.slice(0, 1000))}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={pending || withdrawReason.trim().length < 10}
              onClick={() =>
                run("Case withdrawn", () =>
                  writes.withdraw.mutateAsync([caseItem.id, withdrawReason.trim(), setProgress])
                )
              }
            >
              Withdraw case
            </Button>
          </div>
        )}
      </div>

      {progress && (
        <div className="soft-tile text-sm" role="status">
          <p className="font-medium capitalize">Transaction: {progress.stage}</p>
          {progress.hash && (
            <code className="mt-1 block break-all text-xs text-muted-foreground">{progress.hash}</code>
          )}
        </div>
      )}

      <StakeConfirmDialog
        open={confirmAppeal}
        onOpenChange={setConfirmAppeal}
        title="Confirm appeal stake"
        description="This is your only appeal. Cancelling refunds both pots but still counts as used."
        stakeLabel={`${formatGen(stakeWei)} GEN`}
        warnings={[
          "Requested penalty cannot be higher than the original",
          "AI cannot increase the penalty",
          "Evidence is public on-chain text",
        ]}
        pending={writes.file.isPending}
        onConfirm={onAppeal}
      />
    </article>
  );
}
