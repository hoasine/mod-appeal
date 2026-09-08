# ModAppeal

<div align="center">

## Policy-Pinned Moderation Appeals on GenLayer

| **ModAppeal Platform** |
|---|
| **Pin the policy. Stake both sides. Appeal once. AI cannot raise the penalty.** |

[![Live App](https://img.shields.io/badge/Live-mod--appeal.vercel.app-0f172a?style=for-the-badge&logo=vercel)](https://mod-appeal.vercel.app)
[![Contract](https://img.shields.io/badge/Contract-0xbb582Ac8…8f40-1f6feb?style=for-the-badge)](#deployment)
[![Frontend](https://img.shields.io/badge/Frontend-Next.js_+_TypeScript-111827?style=for-the-badge)](#project-structure)
[![Network](https://img.shields.io/badge/Network-GenLayer_Studionet-16a34a?style=for-the-badge)](#environment-variables)

</div>

---

## Deployment

| Item | Value |
|------|--------|
| Live app | https://mod-appeal.vercel.app |
| GitHub | https://github.com/hoasine/mod-appeal |
| Network | GenLayer Studionet (`chainId` `61999`) |
| Contract | `0xbb582Ac88eba689865C0261992139917F6558f40` |
| Source | `contracts/mod_appeal.py` |

## Overview

ModAppeal is a voluntary, public arbitration protocol for community moderation. An admin pins a policy. Users opt in. The community signing key seals a one-shot record. An authorized moderator can then publish that record with a fixed GEN stake. The named user can appeal once. GenLayer AI may uphold, reduce, revoke, or return an inconclusive result — **never increase the original penalty**.

The protocol is designed to reduce moderation risk with a strict opt-in, seal, then stake flow:

1. `accept_community_policy` records consent for the **current** policy version (**no case can be published without it**)
2. `seal_moderation_record` is a one-shot wallet transaction from the community **signing key** (defaults to the admin). It binds target, penalty level, and case text. There is no file upload.
3. `publish_case` locks that sealed record, the policy snapshot, and exactly **0.01 GEN** only after opt-in. Case text must match the seal hash; a record cannot be reused.

This means a moderator cannot write cases against users who never consented, cannot stake unsigned case text, and a later policy update cannot rewrite the snapshot on an already-published case.

## Core Value Proposition

- **Opt-in first:** no case until the target accepts the current policy
- **Community-sealed record:** the signing key must confirm the case text on-chain before stake
- **Pinned policy:** existing cases keep their snapshot when policy is updated
- **Fixed stake both sides:** 0.01 GEN, exact match only — no unaffordable appeal bond
- **One-shot appeals:** the named user may appeal once; requested level must be strictly lower
- **No penalty increase:** AI cannot raise the original level
- **Every path pays out:** judge, expire, cancel, withdraw, and close all return or transfer both pots
- **Advisory only:** this contract cannot ban or unban an account on an external platform

## Protocol Flow

1. **Admin creates a community** (`create_community`) and optionally authorizes moderators. The admin wallet is the default signing key.
2. **User accepts the current policy** (`accept_community_policy`)
3. **Signing key seals a record** (`seal_moderation_record`) — a MetaMask write, not a file
4. **Moderator publishes a case** (`publish_case`) against that unused record with matching text and the protocol stake
5. **Named user may appeal once** (`file_appeal`) with matching stake and a lower requested level
6. **Original moderator may respond once** (`respond_to_appeal`) during the response window
7. **Anyone may judge** (`judge_appeal`) after a response or response-window expiry
8. **If nobody judges in time**, anyone calls `expire_appeal` and both stakes return
9. **Without an appeal**, anyone may `close_case` after the appeal window; payout stays bound to the original moderator

## Penalty levels

| Level | Meaning |
|-------|---------|
| `0` | Revoked |
| `1` | Warning |
| `2` | Temporary restriction |
| `3` | Temporary suspension |
| `4` | Permanent suspension |

The numeric level is authoritative. Descriptive text cannot redefine it to a harsher level.

## Verdicts

| Verdict | Meaning | Stake outcome |
|---------|---------|---------------|
| `UPHOLD_PENALTY` | Original penalty stands | Original moderator receives both stakes |
| `REDUCE_PENALTY` | Penalty lowered | Appellant receives both stakes |
| `REVOKE_PENALTY` | Penalty set to zero | Appellant receives both stakes |
| `INCONCLUSIVE` | Record cannot decide | Each party receives their own stake |
| `CANCELLED` | Appeal cancelled before judgment | Each party receives their own stake |
| `WITHDRAWN` | Moderator withdrew the case | Moderator stake returns; final level is zero |

AI confidence below 50, an invalid verdict/level pair, or any attempted penalty increase is converted to `INCONCLUSIVE`.

## Risk Controls

| Risk | Mitigation in ModAppeal |
|------|-------------------------|
| Case against a user who never opted in | `publish_case` requires current-policy membership |
| Unauthenticated case text from either party | Community signing key must seal the record; publish requires an unused matching hash |
| Edited text after the seal | Content hash mismatch blocks `publish_case` |
| Policy bait-and-switch after a case | Case stores a policy snapshot; updates only affect future cases |
| Unaffordable appeal bond | Stake is the protocol minimum, exact match only |
| Penalty raised as retaliation | No increase path; invalid levels become `INCONCLUSIVE` |
| Stuck stakes if nobody judges | `expire_appeal` returns both pots after the grace deadline |
| Multiple parallel cases / spam | One active case per community/user pair; one appeal per case |
| Off-chain evidence disappearing | Facts, policy, appeal, and response are on-chain text only |
| Personal data leaking on-chain | UI and docs require public, pseudonymous text — no PII |
| External “ban” expectations | Ruling is advisory; the contract cannot ban/unban off-chain accounts |
| Unbounded list reads | Paginated views, maximum 100 records per page |
| Clock drift on windows | Deadlines use the transaction datetime only |

## Core Contract API

| Function | Type | Description |
|----------|------|-------------|
| `create_community` | write | Admin creates a community and pins the first policy |
| `set_moderator` | write | Admin authorizes or revokes a moderator |
| `update_policy` | write | New version for future cases; prior consent is invalidated |
| `set_community_active` | write | Pause or resume new cases |
| `set_signing_key` | write | Admin sets which wallet can seal records |
| `seal_moderation_record` | write | Signing key seals a one-shot community record |
| `accept_community_policy` | write | User opts into the current policy version |
| `leave_community` | write | User leaves; blocks future cases |
| `publish_case` | write (payable) | Authorized moderator locks a sealed record + 0.01 GEN |
| `withdraw_case` | write | Moderator withdraws before an appeal |
| `file_appeal` | write (payable) | Named user appeals once with matching stake |
| `respond_to_appeal` | write | Original moderator replies once |
| `cancel_appeal` | write | Appellant cancels before judgment; both pots return |
| `judge_appeal` | write | AI verdict after reply or response-window expiry |
| `expire_appeal` | write | Refund both pots if judgment is not finalized in time |
| `close_case` | write | Close after the appeal window with no appeal |
| `get_communities_page` / `get_cases_page` / `get_appeals_page` | view | Bounded pagination |
| `get_case` / `get_appeal` / `get_case_appeal` | view | Individual records |
| `get_record` / `get_records_for_community_page` | view | Sealed community records |
| `get_membership` / `is_authorized_moderator` | view | Opt-in and moderator checks |
| `get_protocol_config` / `get_fairness_ledger` / `get_counts` | view | Config, verdict totals, counts |

## Project Structure

```text
contracts/   # GenLayer intelligent contract (Python)
frontend/    # Next.js application (TypeScript)
tests/       # Contract tests
```

## Environment Variables

Configure in `frontend/.env.local` (see `frontend/.env.example`):

```env
NEXT_PUBLIC_CONTRACT_ADDRESS=0xbb582Ac88eba689865C0261992139917F6558f40
NEXT_PUBLIC_GENLAYER_RPC_URL=https://studio.genlayer.com/api
NEXT_PUBLIC_GENLAYER_CHAIN_ID=61999
NEXT_PUBLIC_GENLAYER_CHAIN_NAME=GenLayer Studionet
NEXT_PUBLIC_GENLAYER_SYMBOL=GEN
```

## Local Development

```bash
# Contract tests
pip install -r requirements-dev.txt
python -m pytest tests/direct/test_mod_appeal.py -q
genvm-lint check contracts/mod_appeal.py

# Frontend
cd frontend
npm install
cp .env.example .env.local   # set NEXT_PUBLIC_CONTRACT_ADDRESS
npm run dev
```

The app runs on port **3008**. Deploy `contracts/mod_appeal.py` in GenLayer Studio first, then set `NEXT_PUBLIC_CONTRACT_ADDRESS`.

- Minimum stake: **0.01 GEN** (exact match)
- Penalty cannot increase on appeal
- Public StudioNet RPC is rate-limited (**30 requests/minute**, **500/hour**)

## Links

- Live app: [https://mod-appeal.vercel.app](https://mod-appeal.vercel.app)
- GitHub: [https://github.com/hoasine/mod-appeal](https://github.com/hoasine/mod-appeal)
- Local app: [http://localhost:3008](http://localhost:3008)
- Studionet contract: `0xbb582Ac88eba689865C0261992139917F6558f40`

## Disclaimer

Prototype/demo software. Advisory ruling only — not a platform ban tool, and not legal advice. Do not submit names, private messages, or other personal data on-chain.
