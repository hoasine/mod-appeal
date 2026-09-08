"use client";

import { useMemo, useState } from "react";
import { Loader2, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StakeConfirmDialog } from "@/components/mod/StakeConfirmDialog";
import {
  useCommunities,
  useModClient,
  useModWrites,
  useProtocolConfig,
  useRecords,
} from "@/lib/hooks/useModAppeal";
import { useWallet } from "@/lib/genlayer/WalletProvider";
import { formatGen, shortAddr } from "@/lib/utils/format";
import { success, error as toastError } from "@/lib/utils/toast";
import { friendlyTxError } from "@/components/RateLimitNotice";
import {
  PENALTY_LABELS,
  type SealedRecordView,
  type TransactionProgress,
} from "@/lib/contracts/ModAppeal";

const ADDR_RE = /^0x[a-fA-F0-9]{40}$/;
const MIN_STAKE_WEI = 10_000_000_000_000_000n;
const NEW_SEAL = "new";

export function PublishCaseForm({ onDone }: { onDone?: () => void }) {
  const { address, isConnected } = useWallet();
  const client = useModClient();
  const writes = useModWrites();
  const { data: communities = [] } = useCommunities();
  const { data: config } = useProtocolConfig();
  const stakeWei = config ? BigInt(String(config.minimum_stake)) : MIN_STAKE_WEI;

  const [communityId, setCommunityId] = useState("0");
  const [recordChoice, setRecordChoice] = useState(NEW_SEAL);
  const [target, setTarget] = useState("");
  const [title, setTitle] = useState("");
  const [facts, setFacts] = useState("");
  const [violation, setViolation] = useState("");
  const [level, setLevel] = useState("3");
  const [details, setDetails] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [progress, setProgress] = useState<TransactionProgress | null>(null);
  const pending = writes.publish.isPending || writes.seal.isPending;

  const selectedCommunity = communities.find((c) => String(c.id) === communityId) ?? communities[0];
  const cid = selectedCommunity?.id ?? Number(communityId);
  const { data: records = [] } = useRecords(Number.isFinite(cid) ? cid : -1);
  const unusedRecords = useMemo(() => records.filter((r) => !r.used), [records]);
  const signingKey = selectedCommunity?.signing_key || selectedCommunity?.admin || "";
  const isSigner = Boolean(address && signingKey && address.toLowerCase() === signingKey.toLowerCase());
  const usingExisting = recordChoice !== NEW_SEAL;
  const locked = usingExisting;

  const applyRecord = (record: SealedRecordView) => {
    setTarget(record.target_user);
    setTitle(record.title);
    setFacts(record.case_facts);
    setViolation(record.alleged_violation);
    setLevel(String(record.penalty_level));
    setDetails(record.penalty_details);
  };

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
    if (!usingExisting && !isSigner) {
      throw new Error("Only the community signing key can seal a new record. Load an unused sealed record, or connect that wallet.");
    }
    if (usingExisting) {
      const recordId = Number(recordChoice);
      if (!Number.isInteger(recordId) || recordId < 0) {
        throw new Error("Select an unused sealed record");
      }
    }
    return { penalty, cid: Number(selectedCommunity?.id ?? communityId) };
  };

  const submit = async () => {
    try {
      const { penalty, cid: publishCid } = validate();
      setProgress({ stage: "preparing" });
      let recordId: number;
      if (usingExisting) {
        recordId = Number(recordChoice);
      } else {
        if (!client) throw new Error("Contract not configured");
        const before = await client.getCounts();
        await writes.seal.mutateAsync([
          publishCid,
          target.trim(),
          title.trim(),
          facts.trim(),
          violation.trim(),
          penalty,
          details.trim(),
          setProgress,
        ]);
        recordId = Number(before.records);
      }
      await writes.publish.mutateAsync([
        publishCid,
        target.trim(),
        title.trim(),
        facts.trim(),
        violation.trim(),
        penalty,
        details.trim(),
        0,
        recordId,
        stakeWei,
        setProgress,
      ]);
      success("Case published", {
        description: "The named user can appeal once before the deadline.",
      });
      setProgress(null);
      setConfirmOpen(false);
      setRecordChoice(NEW_SEAL);
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
              The community signing key must first seal this text in a wallet transaction. There is
              no file upload. Stake is fixed at {formatGen(stakeWei)} GEN. Do not include personal
              data.
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
              onChange={(e) => {
                setCommunityId(e.target.value);
                setRecordChoice(NEW_SEAL);
              }}
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
            <Label htmlFor="record">Sealed community record</Label>
            <select
              id="record"
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              value={recordChoice}
              onChange={(e) => {
                const value = e.target.value;
                setRecordChoice(value);
                if (value !== NEW_SEAL) {
                  const record = unusedRecords.find((r) => String(r.id) === value);
                  if (record) applyRecord(record);
                }
              }}
              disabled={!isConnected || pending}
            >
              {isSigner && <option value={NEW_SEAL}>Seal a new record with this wallet</option>}
              {!isSigner && (
                <option value={NEW_SEAL} disabled>
                  {unusedRecords.length === 0 ? "No unused sealed record yet" : "Select an unused sealed record"}
                </option>
              )}
              {unusedRecords.map((r) => (
                <option key={r.id} value={r.id}>
                  #{r.id} · {r.title} · {shortAddr(r.target_user)}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Signing key {signingKey ? shortAddr(signingKey) : "—"}.
              {isSigner
                ? " This wallet can seal, then publish in a second confirmation."
                : " Connect the signing key, or load a record it already sealed."}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="target">Target user</Label>
          <Input
            id="target"
            required
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="0x…"
            disabled={!isConnected || pending || locked}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            required
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={!isConnected || pending || locked}
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
            disabled={!isConnected || pending || locked}
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
            disabled={!isConnected || pending || locked}
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
              disabled={!isConnected || pending || locked}
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
              disabled={!isConnected || pending || locked}
            />
          </div>
        </div>

        <Button type="submit" variant="gradient" className="w-full" disabled={!isConnected || pending}>
          {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Scale className="mr-2 h-4 w-4" />}
          {usingExisting ? "Review stake and publish" : "Review stake, seal, and publish"}
        </Button>
        {progress && (
          <p className="text-sm text-muted-foreground capitalize">Transaction: {progress.stage}</p>
        )}
      </form>

      <StakeConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={usingExisting ? "Confirm case publish" : "Confirm seal and publish"}
        description={
          usingExisting
            ? "You are locking the protocol stake against a community-sealed record. The target can appeal once. The policy snapshot cannot change for this case."
            : "MetaMask will ask twice: first to seal this text as the community record, then to lock the protocol stake. Editing after the seal will fail."
        }
        stakeLabel={`${formatGen(stakeWei)} GEN`}
        warnings={
          usingExisting
            ? [
                "Case text must match the sealed record exactly",
                "Target must have accepted the current policy",
                "You cannot raise the penalty if they appeal",
                "If they win, they receive both stakes",
                "Do not include personal or private data",
              ]
            : [
                "The first confirmation is the community seal — not a file upload",
                "A seal authenticates that this community stands behind the text",
                "Target must have accepted the current policy",
                "You cannot raise the penalty if they appeal",
                "If they win, they receive both stakes",
              ]
        }
        pending={pending}
        onConfirm={submit}
      />
    </>
  );
}
