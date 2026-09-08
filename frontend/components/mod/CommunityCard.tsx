"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import type { CommunityView, TransactionProgress } from "@/lib/contracts/ModAppeal";
import { useMembership, useModWrites } from "@/lib/hooks/useModAppeal";
import { useWallet } from "@/lib/genlayer/WalletProvider";
import { shortAddr } from "@/lib/utils/format";
import { success, error as toastError } from "@/lib/utils/toast";
import { friendlyTxError } from "@/components/RateLimitNotice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const ADDR_RE = /^0x[a-fA-F0-9]{40}$/;

export function CommunityCard({ community }: { community: CommunityView }) {
  const { address, isConnected } = useWallet();
  const writes = useModWrites();
  const { data: membership } = useMembership(community.id);
  const [moderator, setModerator] = useState("");
  const [signingKey, setSigningKey] = useState("");
  const [policy, setPolicy] = useState(community.policy_text);
  const [reason, setReason] = useState("");
  const [progress, setProgress] = useState<TransactionProgress | null>(null);

  const me = address?.toLowerCase() ?? "";
  const isAdmin = Boolean(me && community.admin.toLowerCase() === me);
  const pending =
    writes.accept.isPending ||
    writes.leave.isPending ||
    writes.setModerator.isPending ||
    writes.updatePolicy.isPending ||
    writes.setActive.isPending ||
    writes.setSigningKey.isPending;

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

  return (
    <article className="glass-card space-y-4 p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-xl font-bold">{community.name}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Community #{community.id} · Admin {shortAddr(community.admin)} · signing key{" "}
            {shortAddr(community.signing_key || community.admin)} · policy v
            {community.policy_version}
            {community.active ? "" : " · inactive"}
          </p>
        </div>
        {membership && (
          <p className="text-xs text-muted-foreground">
            {membership.current
              ? "You accepted the current policy"
              : membership.active
                ? `You accepted v${membership.accepted_policy_version} — re-accept required`
                : "You have not opted in"}
          </p>
        )}
      </div>

      <details className="soft-tile px-4 py-3">
        <summary className="cursor-pointer text-sm font-semibold">Current policy</summary>
        <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">
          {community.policy_text}
        </p>
      </details>

      <div className="flex flex-wrap gap-2">
        {isConnected && community.active && !membership?.current && (
          <Button
            size="sm"
            variant="gradient"
            disabled={pending}
            onClick={() =>
              run("Policy accepted", () => writes.accept.mutateAsync([community.id, setProgress]))
            }
          >
            Accept current policy
          </Button>
        )}
        {isConnected && membership?.active && (
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              run("Left community", () => writes.leave.mutateAsync([community.id, setProgress]))
            }
          >
            Leave
          </Button>
        )}
        {isAdmin && (
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              run(community.active ? "Community paused" : "Community resumed", () =>
                writes.setActive.mutateAsync([community.id, !community.active, setProgress])
              )
            }
          >
            {community.active ? "Pause new cases" : "Reactivate"}
          </Button>
        )}
      </div>

      {isAdmin && (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Authorize moderator</Label>
            <Input
              value={moderator}
              onChange={(e) => setModerator(e.target.value)}
              placeholder="0x…"
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={pending || !ADDR_RE.test(moderator.trim())}
                onClick={() =>
                  run("Moderator authorized", () =>
                    writes.setModerator.mutateAsync([
                      community.id,
                      moderator.trim(),
                      true,
                      setProgress,
                    ])
                  )
                }
              >
                Authorize
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={pending || !ADDR_RE.test(moderator.trim())}
                onClick={() =>
                  run("Moderator revoked", () =>
                    writes.setModerator.mutateAsync([
                      community.id,
                      moderator.trim(),
                      false,
                      setProgress,
                    ])
                  )
                }
              >
                Revoke
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Update policy (future cases only)</Label>
            <Textarea
              rows={3}
              value={policy}
              onChange={(e) => setPolicy(e.target.value.slice(0, 12000))}
            />
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why this change"
            />
            <Button
              size="sm"
              variant="outline"
              disabled={pending || policy.trim().length < 80 || reason.trim().length < 10}
              onClick={() =>
                run("Policy updated", () =>
                  writes.updatePolicy.mutateAsync([
                    community.id,
                    policy.trim(),
                    reason.trim(),
                    setProgress,
                  ])
                )
              }
            >
              Publish new policy version
            </Button>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Community signing key</Label>
            <p className="text-xs text-muted-foreground">
              Current key {shortAddr(community.signing_key || community.admin)}. Only this wallet
              can seal a moderation record. Changing it does not unseal existing records.
            </p>
            <Input
              value={signingKey}
              onChange={(e) => setSigningKey(e.target.value)}
              placeholder="0x…"
            />
            <Button
              size="sm"
              variant="outline"
              disabled={pending || !ADDR_RE.test(signingKey.trim())}
              onClick={() =>
                run("Signing key updated", () =>
                  writes.setSigningKey.mutateAsync([
                    community.id,
                    signingKey.trim(),
                    setProgress,
                  ])
                )
              }
            >
              Set signing key
            </Button>
          </div>
        </div>
      )}

      {progress && (
        <p className="text-sm text-muted-foreground capitalize">
          {pending ? <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> : null}
          Transaction: {progress.stage}
        </p>
      )}
    </article>
  );
}
