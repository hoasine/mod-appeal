import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";

export type CaseStatus =
  | "APPEALABLE"
  | "APPEALED"
  | "SETTLED"
  | "EXPIRED"
  | "CANCELLED"
  | "WITHDRAWN"
  | "CLOSED";
export type AppealStatus = "OPEN" | "SETTLED" | "EXPIRED" | "CANCELLED";
export type Verdict =
  | "UPHOLD_PENALTY"
  | "REDUCE_PENALTY"
  | "REVOKE_PENALTY"
  | "INCONCLUSIVE"
  | "CANCELLED"
  | "WITHDRAWN"
  | "NO_APPEAL"
  | "";

export const PENALTY_LABELS: Record<number, string> = {
  0: "Revoked",
  1: "Warning",
  2: "Temporary restriction",
  3: "Temporary suspension",
  4: "Permanent suspension",
};

export type CommunityView = {
  id: number;
  admin: string;
  name: string;
  policy_text: string;
  policy_version: number;
  revision_count: number;
  active: boolean;
  created_at: number;
  updated_at: number;
};

export type MembershipView = {
  community_id: number;
  member: string;
  active: boolean;
  accepted_policy_version: number;
  current_policy_version: number;
  current: boolean;
};

export type CaseView = {
  id: number;
  community_id: number;
  moderator: string;
  target_user: string;
  title: string;
  case_facts: string;
  alleged_violation: string;
  penalty_details: string;
  original_penalty_level: number;
  final_penalty_level: number;
  policy_version: number;
  policy_snapshot: string;
  moderator_stake: number | string;
  created_at: number;
  appeal_deadline_at: number;
  has_open_appeal: boolean;
  open_appeal_id: number;
  appeal_id: number;
  appeal_count: number;
  final_verdict: Verdict;
  final_reasoning: string;
  status: CaseStatus;
  closed: boolean;
};

export type AppealView = {
  id: number;
  case_id: number;
  appellant: string;
  reason: string;
  evidence: string;
  requested_penalty_level: number;
  moderator_response: string;
  appellant_stake: number | string;
  created_at: number;
  response_deadline_at: number;
  judge_deadline_at: number;
  responded_at: number;
  judged_at: number;
  verdict: Verdict;
  recommended_penalty_level: number;
  confidence: number;
  reasoning: string;
  status: AppealStatus;
  paid_out: boolean;
  judged_without_moderator_response: boolean;
};

export type FairnessLedger = {
  uphold: number;
  reduce: number;
  revoke: number;
  inconclusive: number;
  cancelled: number;
  withdrawn: number;
  expired: number;
  judged: number;
  judged_without_moderator_response: number;
};

export type ProtocolConfig = {
  minimum_stake: number | string;
  default_appeal_window: number | string;
  min_appeal_window: number | string;
  max_appeal_window: number | string;
  moderator_response_window: number | string;
  judge_grace_window: number | string;
  min_confidence: number | string;
  penalty_levels: string;
};

export type CountsView = {
  communities: number;
  policy_revisions: number;
  cases: number;
  appeals: number;
};

export type TransactionProgress = {
  hash?: string;
  stage: "preparing" | "submitted" | "finalizing" | "finalized";
};

export type WriteResult = {
  hash: string;
  receipt: unknown;
};

const AI_TX_WAIT = {
  retries: 45,
  interval: 2500,
  status: TransactionStatus.FINALIZED,
};
const FAST_TX_WAIT = {
  retries: 18,
  interval: 2000,
  status: TransactionStatus.ACCEPTED,
};

function isRpcNoiseError(err: unknown): boolean {
  const msg = String(err instanceof Error ? err.message : err ?? "").toLowerCase();
  return (
    msg.includes("gen_call") ||
    msg.includes("rate limit") ||
    msg.includes("rate limited") ||
    msg.includes("too many requests") ||
    msg.includes("failed to fetch") ||
    msg.includes("fetch") ||
    msg.includes("network")
  );
}

function withMutedGenLayerConsole<T>(fn: () => Promise<T>): Promise<T> {
  if (typeof console === "undefined" || typeof console.error !== "function") {
    return fn();
  }
  const original = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    const text = args.map((a) => String(a)).join(" ");
    if (text.includes("Error fetching") && text.includes("from GenLayer RPC")) {
      return;
    }
    original(...args);
  };
  return fn().finally(() => {
    console.error = original;
  });
}

function normalizeReadValue(value: unknown): unknown {
  if (value instanceof Map) {
    const obj: Record<string, unknown> = {};
    for (const [key, entry] of value.entries()) {
      obj[String(key)] = normalizeReadValue(entry);
    }
    return obj;
  }
  if (typeof value === "bigint") {
    const n = Number(value);
    return Number.isSafeInteger(n) ? n : value.toString();
  }
  if (Array.isArray(value)) {
    return value.map(normalizeReadValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, normalizeReadValue(entry)])
    );
  }
  return value;
}

function normalizeReadResult<T>(raw: unknown): T {
  return normalizeReadValue(raw) as T;
}

export class ModAppealClient {
  private contractAddress: `0x${string}`;
  private readClient: ReturnType<typeof createClient>;
  private account?: `0x${string}`;
  private endpoint?: string;

  constructor(contractAddress: string, account?: string | null, endpoint?: string) {
    this.contractAddress = contractAddress as `0x${string}`;
    this.account = account ? (account as `0x${string}`) : undefined;
    this.endpoint = endpoint;
    const config: Record<string, unknown> = { chain: studionet };
    if (endpoint) config.endpoint = endpoint;
    this.readClient = createClient(config as Parameters<typeof createClient>[0]);
  }

  private async assertContractDeployed() {
    const endpoint = this.endpoint || "https://studio.genlayer.com/api";
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: Date.now(),
          method: "gen_getContractSchema",
          params: [this.contractAddress],
        }),
      });
      const data = (await res.json()) as {
        result?: { methods?: Record<string, unknown> };
        error?: { message?: string };
      };
      if (data.error || !data.result?.methods) {
        throw new Error(
          `No ModAppeal contract at ${this.contractAddress} on Studionet. Deploy contracts/mod_appeal.py in GenLayer Studio, then set NEXT_PUBLIC_CONTRACT_ADDRESS.`
        );
      }
      if (!("publish_case" in data.result.methods) || !("accept_community_policy" in data.result.methods)) {
        throw new Error(
          `Contract at ${this.contractAddress} is missing ModAppeal methods. Confirm you deployed ModAppeal.`
        );
      }
    } catch (err) {
      if (
        err instanceof Error &&
        (err.message.startsWith("No ModAppeal") || err.message.startsWith("Contract at"))
      ) {
        throw err;
      }
    }
  }

  private async getWriteClient() {
    if (typeof window === "undefined" || !window.ethereum) {
      throw new Error("A browser wallet is required to send transactions.");
    }
    const { ensureGenLayerNetwork, getAccounts, requestAccounts } = await import(
      "@/lib/genlayer/client"
    );
    await ensureGenLayerNetwork();
    await this.assertContractDeployed();
    let accounts = await getAccounts();
    if (accounts.length === 0) {
      accounts = await requestAccounts();
    }
    const account = (accounts[0] || this.account) as `0x${string}` | undefined;
    if (!account) {
      throw new Error("Connect your wallet to continue");
    }
    this.account = account;
    return createClient({
      chain: studionet,
      endpoint: this.endpoint,
      account,
      provider: window.ethereum as NonNullable<
        Parameters<typeof createClient>[0]
      >["provider"],
    });
  }

  private async studioRpc<T>(method: string, params: unknown[]): Promise<T> {
    const endpoint = this.endpoint || "https://studio.genlayer.com/api";
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method,
        params,
      }),
    });
    const data = (await res.json()) as { result?: T; error?: { message?: string } };
    if (data.error) {
      throw new Error(data.error.message || "Studio RPC error");
    }
    return data.result as T;
  }

  private statusReached(current: string, target: TransactionStatus | undefined): boolean {
    const cur = current.toUpperCase();
    const want = String(target ?? TransactionStatus.ACCEPTED).toUpperCase();
    if (cur.includes("CANCEL") || cur.includes("TIMEOUT")) return false;
    if (want.includes("FINAL")) {
      return cur === "FINALIZED" || cur === "ACCEPTED";
    }
    return cur === "ACCEPTED" || cur === "FINALIZED" || cur === "ACTIVATED";
  }

  private async waitForWrite(
    _client: ReturnType<typeof createClient>,
    hash: Awaited<ReturnType<ReturnType<typeof createClient>["writeContract"]>>,
    options: {
      retries: number;
      interval: number;
      status?: TransactionStatus;
    } = AI_TX_WAIT,
    onProgress?: (progress: TransactionProgress) => void
  ) {
    const txHash = String(hash);
    onProgress?.({ hash: txHash, stage: "finalizing" });
    let lastStatus = "";
    const retries = Math.max(1, options.retries);
    for (let i = 0; i < retries; i++) {
      try {
        lastStatus = String(
          await this.studioRpc<string>("gen_getTransactionStatus", [txHash])
        ).toUpperCase();
        if (lastStatus.includes("CANCEL") || lastStatus.includes("TIMEOUT")) {
          throw new Error(`Transaction ${lastStatus.toLowerCase().replace(/_/g, " ")}.`);
        }
        if (this.statusReached(lastStatus, options.status)) {
          onProgress?.({ hash: txHash, stage: "finalized" });
          return { hash: txHash, receipt: { statusName: lastStatus } } satisfies WriteResult;
        }
      } catch (err) {
        if (err instanceof Error && err.message.startsWith("Transaction ")) {
          throw err;
        }
        if (i >= 2 && isRpcNoiseError(err)) {
          onProgress?.({ hash: txHash, stage: "finalized" });
          return {
            hash: txHash,
            receipt: { statusName: lastStatus || "SUBMITTED", soft: true },
          } satisfies WriteResult;
        }
      }
      await new Promise((r) => setTimeout(r, options.interval));
    }
    onProgress?.({ hash: txHash, stage: "finalized" });
    return {
      hash: txHash,
      receipt: { statusName: lastStatus || "SUBMITTED", soft: true },
    } satisfies WriteResult;
  }

  private async write(
    functionName: string,
    args: Array<string | number | boolean>,
    value: bigint,
    wait = FAST_TX_WAIT,
    onProgress?: (progress: TransactionProgress) => void
  ) {
    onProgress?.({ stage: "preparing" });
    const client = await this.getWriteClient();
    const hash = await withMutedGenLayerConsole(() =>
      client.writeContract({
        address: this.contractAddress,
        functionName,
        args,
        value,
      })
    );
    onProgress?.({ hash: String(hash), stage: "submitted" });
    return this.waitForWrite(client, hash, wait, onProgress);
  }

  async getCommunitiesPage(offset = 0, limit = 50): Promise<CommunityView[]> {
    const raw = await this.readClient.readContract({
      address: this.contractAddress,
      functionName: "get_communities_page",
      args: [offset, limit],
    });
    const list = normalizeReadResult<CommunityView[]>(raw);
    return Array.isArray(list) ? list : [];
  }

  async getCasesPage(offset = 0, limit = 50): Promise<CaseView[]> {
    const raw = await this.readClient.readContract({
      address: this.contractAddress,
      functionName: "get_cases_page",
      args: [offset, limit],
    });
    const list = normalizeReadResult<CaseView[]>(raw);
    return Array.isArray(list) ? list : [];
  }

  async getCaseAppeal(caseId: number): Promise<AppealView | null> {
    try {
      const raw = await this.readClient.readContract({
        address: this.contractAddress,
        functionName: "get_case_appeal",
        args: [caseId],
      });
      return normalizeReadResult<AppealView>(raw);
    } catch {
      return null;
    }
  }

  async getMembership(communityId: number, member: string): Promise<MembershipView> {
    const raw = await this.readClient.readContract({
      address: this.contractAddress,
      functionName: "get_membership",
      args: [communityId, member],
    });
    return normalizeReadResult<MembershipView>(raw);
  }

  async isAuthorizedModerator(communityId: number, moderator: string): Promise<boolean> {
    const raw = await this.readClient.readContract({
      address: this.contractAddress,
      functionName: "is_authorized_moderator",
      args: [communityId, moderator],
    });
    return Boolean(normalizeReadResult<boolean>(raw));
  }

  async getProtocolConfig(): Promise<ProtocolConfig> {
    const raw = await this.readClient.readContract({
      address: this.contractAddress,
      functionName: "get_protocol_config",
      args: [],
    });
    return normalizeReadResult<ProtocolConfig>(raw);
  }

  async getFairnessLedger(): Promise<FairnessLedger> {
    const raw = await this.readClient.readContract({
      address: this.contractAddress,
      functionName: "get_fairness_ledger",
      args: [],
    });
    return normalizeReadResult<FairnessLedger>(raw);
  }

  async getCounts(): Promise<CountsView> {
    const raw = await this.readClient.readContract({
      address: this.contractAddress,
      functionName: "get_counts",
      args: [],
    });
    return normalizeReadResult<CountsView>(raw);
  }

  createCommunity(name: string, policyText: string, onProgress?: (p: TransactionProgress) => void) {
    return this.write("create_community", [name, policyText], 0n, FAST_TX_WAIT, onProgress);
  }

  setModerator(
    communityId: number,
    moderator: string,
    authorized: boolean,
    onProgress?: (p: TransactionProgress) => void
  ) {
    return this.write(
      "set_moderator",
      [communityId, moderator, authorized],
      0n,
      FAST_TX_WAIT,
      onProgress
    );
  }

  updatePolicy(
    communityId: number,
    policyText: string,
    reason: string,
    onProgress?: (p: TransactionProgress) => void
  ) {
    return this.write(
      "update_policy",
      [communityId, policyText, reason],
      0n,
      FAST_TX_WAIT,
      onProgress
    );
  }

  setCommunityActive(
    communityId: number,
    active: boolean,
    onProgress?: (p: TransactionProgress) => void
  ) {
    return this.write(
      "set_community_active",
      [communityId, active],
      0n,
      FAST_TX_WAIT,
      onProgress
    );
  }

  acceptCommunityPolicy(communityId: number, onProgress?: (p: TransactionProgress) => void) {
    return this.write("accept_community_policy", [communityId], 0n, FAST_TX_WAIT, onProgress);
  }

  leaveCommunity(communityId: number, onProgress?: (p: TransactionProgress) => void) {
    return this.write("leave_community", [communityId], 0n, FAST_TX_WAIT, onProgress);
  }

  publishCase(
    communityId: number,
    targetUser: string,
    title: string,
    caseFacts: string,
    allegedViolation: string,
    penaltyLevel: number,
    penaltyDetails: string,
    appealWindowSeconds: number,
    stakeWei: bigint,
    onProgress?: (p: TransactionProgress) => void
  ) {
    return this.write(
      "publish_case",
      [
        communityId,
        targetUser,
        title,
        caseFacts,
        allegedViolation,
        penaltyLevel,
        penaltyDetails,
        appealWindowSeconds,
      ],
      stakeWei,
      FAST_TX_WAIT,
      onProgress
    );
  }

  withdrawCase(caseId: number, reason: string, onProgress?: (p: TransactionProgress) => void) {
    return this.write("withdraw_case", [caseId, reason], 0n, FAST_TX_WAIT, onProgress);
  }

  fileAppeal(
    caseId: number,
    reason: string,
    evidence: string,
    requestedPenaltyLevel: number,
    stakeWei: bigint,
    onProgress?: (p: TransactionProgress) => void
  ) {
    return this.write(
      "file_appeal",
      [caseId, reason, evidence, requestedPenaltyLevel],
      stakeWei,
      FAST_TX_WAIT,
      onProgress
    );
  }

  respondToAppeal(appealId: number, response: string, onProgress?: (p: TransactionProgress) => void) {
    return this.write("respond_to_appeal", [appealId, response], 0n, FAST_TX_WAIT, onProgress);
  }

  cancelAppeal(appealId: number, onProgress?: (p: TransactionProgress) => void) {
    return this.write("cancel_appeal", [appealId], 0n, FAST_TX_WAIT, onProgress);
  }

  judgeAppeal(appealId: number, onProgress?: (p: TransactionProgress) => void) {
    return this.write("judge_appeal", [appealId], 0n, AI_TX_WAIT, onProgress);
  }

  expireAppeal(appealId: number, onProgress?: (p: TransactionProgress) => void) {
    return this.write("expire_appeal", [appealId], 0n, FAST_TX_WAIT, onProgress);
  }

  closeCase(caseId: number, onProgress?: (p: TransactionProgress) => void) {
    return this.write("close_case", [caseId], 0n, FAST_TX_WAIT, onProgress);
  }
}
