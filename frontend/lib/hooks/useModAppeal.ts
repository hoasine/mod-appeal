"use client";

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useWallet } from "@/lib/genlayer/WalletProvider";
import { getContractAddress, getStudioUrl, ensureGenLayerNetwork } from "@/lib/genlayer/client";
import { ModAppealClient, type TransactionProgress } from "@/lib/contracts/ModAppeal";

export type CaseFilter = "all" | "moderator" | "mine" | "open";

export function useModClient() {
  const { address } = useWallet();
  const contract = getContractAddress();
  return useMemo(() => {
    if (!contract) return null;
    return new ModAppealClient(contract, address, getStudioUrl());
  }, [contract, address]);
}

function useInvalidate() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["mod-communities"] }),
      qc.invalidateQueries({ queryKey: ["mod-cases"] }),
      qc.invalidateQueries({ queryKey: ["mod-appeal"] }),
      qc.invalidateQueries({ queryKey: ["mod-membership"] }),
      qc.invalidateQueries({ queryKey: ["mod-auth"] }),
      qc.invalidateQueries({ queryKey: ["mod-ledger"] }),
      qc.invalidateQueries({ queryKey: ["mod-counts"] }),
      qc.invalidateQueries({ queryKey: ["mod-records"] }),
    ]);
}

export function useCommunities() {
  const client = useModClient();
  return useQuery({
    queryKey: ["mod-communities", getContractAddress()],
    queryFn: () => client!.getCommunitiesPage(0, 50),
    enabled: !!client,
    refetchInterval: 60_000,
    retry: 0,
  });
}

export function useCases(filter: CaseFilter = "all") {
  const client = useModClient();
  const { address } = useWallet();
  return useQuery({
    queryKey: ["mod-cases", getContractAddress(), filter, address],
    queryFn: async () => {
      const list = await client!.getCasesPage(0, 50);
      const sorted = [...list].sort((a, b) => b.id - a.id);
      const me = address?.toLowerCase();
      if (filter === "moderator") {
        if (!me) return [];
        return sorted.filter((c) => c.moderator.toLowerCase() === me);
      }
      if (filter === "mine") {
        if (!me) return [];
        return sorted.filter((c) => c.target_user.toLowerCase() === me);
      }
      if (filter === "open") {
        return sorted.filter((c) => c.has_open_appeal || c.status === "APPEALABLE");
      }
      return sorted;
    },
    enabled: !!client,
    refetchInterval: 60_000,
    retry: 0,
  });
}

export function useCaseAppeal(caseId: number, hasAppeal: boolean) {
  const client = useModClient();
  return useQuery({
    queryKey: ["mod-appeal", getContractAddress(), caseId],
    queryFn: () => client!.getCaseAppeal(caseId),
    enabled: !!client && hasAppeal && caseId >= 0,
    refetchInterval: 60_000,
    retry: 0,
  });
}

export function useMembership(communityId: number) {
  const client = useModClient();
  const { address } = useWallet();
  return useQuery({
    queryKey: ["mod-membership", getContractAddress(), communityId, address],
    queryFn: () => client!.getMembership(communityId, address!),
    enabled: !!client && !!address && communityId >= 0,
    refetchInterval: 60_000,
    retry: 0,
  });
}

export function useModeratorAuth(communityId: number) {
  const client = useModClient();
  const { address } = useWallet();
  return useQuery({
    queryKey: ["mod-auth", getContractAddress(), communityId, address],
    queryFn: () => client!.isAuthorizedModerator(communityId, address!),
    enabled: !!client && !!address && communityId >= 0,
    staleTime: 30_000,
    retry: 0,
  });
}

export function useProtocolConfig() {
  const client = useModClient();
  return useQuery({
    queryKey: ["mod-config", getContractAddress()],
    queryFn: () => client!.getProtocolConfig(),
    enabled: !!client,
    staleTime: 60_000,
  });
}

export function useFairnessLedger() {
  const client = useModClient();
  return useQuery({
    queryKey: ["mod-ledger", getContractAddress()],
    queryFn: () => client!.getFairnessLedger(),
    enabled: !!client,
    refetchInterval: 60_000,
    retry: 0,
  });
}

export function useCounts() {
  const client = useModClient();
  return useQuery({
    queryKey: ["mod-counts", getContractAddress()],
    queryFn: () => client!.getCounts(),
    enabled: !!client,
    refetchInterval: 60_000,
    retry: 0,
  });
}

export function useRecords(communityId: number) {
  const client = useModClient();
  return useQuery({
    queryKey: ["mod-records", getContractAddress(), communityId],
    queryFn: () => client!.getRecordsForCommunity(communityId),
    enabled: !!client && communityId >= 0,
    refetchInterval: 60_000,
    retry: 0,
  });
}

type ProgressInput = { onProgress?: (progress: TransactionProgress) => void };

export function useModWrites() {
  const client = useModClient();
  const invalidate = useInvalidate();
  const useWrap = <T extends unknown[]>(fn: (c: ModAppealClient, ...args: T) => Promise<unknown>) =>
    useMutation({
      mutationFn: async (vars: T) => {
        if (!client) throw new Error("Contract not configured");
        await ensureGenLayerNetwork();
        return fn(client, ...vars);
      },
      onSuccess: invalidate,
    });

  return {
    createCommunity: useWrap(
      (c, name: string, policy: string, onProgress?: (p: TransactionProgress) => void) =>
        c.createCommunity(name, policy, onProgress)
    ),
    setModerator: useWrap(
      (
        c,
        communityId: number,
        moderator: string,
        authorized: boolean,
        onProgress?: (p: TransactionProgress) => void
      ) => c.setModerator(communityId, moderator, authorized, onProgress)
    ),
    updatePolicy: useWrap(
      (
        c,
        communityId: number,
        policy: string,
        reason: string,
        onProgress?: (p: TransactionProgress) => void
      ) => c.updatePolicy(communityId, policy, reason, onProgress)
    ),
    setActive: useWrap(
      (
        c,
        communityId: number,
        active: boolean,
        onProgress?: (p: TransactionProgress) => void
      ) => c.setCommunityActive(communityId, active, onProgress)
    ),
    setSigningKey: useWrap(
      (
        c,
        communityId: number,
        signingKey: string,
        onProgress?: (p: TransactionProgress) => void
      ) => c.setSigningKey(communityId, signingKey, onProgress)
    ),
    seal: useWrap(
      (
        c,
        communityId: number,
        target: string,
        title: string,
        facts: string,
        violation: string,
        level: number,
        details: string,
        onProgress?: (p: TransactionProgress) => void
      ) =>
        c.sealModerationRecord(
          communityId,
          target,
          title,
          facts,
          violation,
          level,
          details,
          onProgress
        )
    ),
    accept: useWrap((c, communityId: number, onProgress?: (p: TransactionProgress) => void) =>
      c.acceptCommunityPolicy(communityId, onProgress)
    ),
    leave: useWrap((c, communityId: number, onProgress?: (p: TransactionProgress) => void) =>
      c.leaveCommunity(communityId, onProgress)
    ),
    publish: useWrap(
      (
        c,
        communityId: number,
        target: string,
        title: string,
        facts: string,
        violation: string,
        level: number,
        details: string,
        window: number,
        recordId: number,
        stake: bigint,
        onProgress?: (p: TransactionProgress) => void
      ) =>
        c.publishCase(
          communityId,
          target,
          title,
          facts,
          violation,
          level,
          details,
          window,
          recordId,
          stake,
          onProgress
        )
    ),
    withdraw: useWrap(
      (c, caseId: number, reason: string, onProgress?: (p: TransactionProgress) => void) =>
        c.withdrawCase(caseId, reason, onProgress)
    ),
    file: useWrap(
      (
        c,
        caseId: number,
        reason: string,
        evidence: string,
        requested: number,
        stake: bigint,
        onProgress?: (p: TransactionProgress) => void
      ) => c.fileAppeal(caseId, reason, evidence, requested, stake, onProgress)
    ),
    respond: useWrap(
      (c, appealId: number, response: string, onProgress?: (p: TransactionProgress) => void) =>
        c.respondToAppeal(appealId, response, onProgress)
    ),
    cancel: useWrap((c, appealId: number, onProgress?: (p: TransactionProgress) => void) =>
      c.cancelAppeal(appealId, onProgress)
    ),
    judge: useWrap((c, appealId: number, onProgress?: (p: TransactionProgress) => void) =>
      c.judgeAppeal(appealId, onProgress)
    ),
    expire: useWrap((c, appealId: number, onProgress?: (p: TransactionProgress) => void) =>
      c.expireAppeal(appealId, onProgress)
    ),
    close: useWrap((c, caseId: number, onProgress?: (p: TransactionProgress) => void) =>
      c.closeCase(caseId, onProgress)
    ),
  };
}

export type { ProgressInput };
