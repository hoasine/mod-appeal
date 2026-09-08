"""Behavioral and invariant tests for ModAppeal."""

import json

import pytest


CONTRACT = "contracts/mod_appeal.py"
SDK_VERSION = "v0.2.16"
STAKE = 10_000_000_000_000_000

POLICY = (
    "Community policy: harassment, credible threats, targeted abuse, and spam are "
    "prohibited. Penalties must be proportionate to the conduct, its severity, "
    "context, repetition, and documented harm. Good-faith criticism is allowed."
)
UPDATED_POLICY = (
    POLICY
    + " Coordinated impersonation is also prohibited when the record shows intent."
)
CASE_FACTS = (
    "The quoted message repeatedly targeted another member with insulting language. "
    "No private profile data or external URL is included in this case record."
)
VIOLATION = (
    "The moderator alleges targeted abuse under the harassment section of the policy."
)
DETAILS = "Temporary suspension for seven days."
APPEAL_REASON = (
    "The message criticized a decision rather than targeting a person, so the "
    "temporary suspension is disproportionate under the locked policy."
)
APPEAL_EVIDENCE = (
    "The complete quoted exchange shows criticism of the proposal and contains no "
    "threat, repeated contact, or request for others to target a member."
)

_DIRECT_VM = None
_SEALER = None


def _addr_hex(value) -> str:
    if hasattr(value, "as_hex"):
        return str(value.as_hex).lower()
    if isinstance(value, (bytes, bytearray)):
        return "0x" + bytes(value).hex().lower()
    text = str(value).lower()
    if text.startswith("address("):
        start = text.find("0x")
        end = text.rfind('"')
        if start >= 0 and end > start:
            return text[start:end]
    return text


def _decision(
    verdict: str,
    recommended_level: int,
    confidence: int = 85,
) -> str:
    return json.dumps(
        {
            "verdict": verdict,
            "recommended_penalty_level": recommended_level,
            "confidence": confidence,
            "reasoning": "Mocked policy-pinned moderation arbitration.",
        }
    )


@pytest.fixture
def contract(direct_vm, direct_deploy, direct_alice):
    global _DIRECT_VM
    _DIRECT_VM = direct_vm
    direct_vm.mock_llm(r".*", _decision("UPHOLD_PENALTY", 3))
    direct_vm.sender = direct_alice
    return direct_deploy(CONTRACT, sdk_version=SDK_VERSION)


def _payable(contract, method: str, *args, value: int):
    previous = _DIRECT_VM.value
    _DIRECT_VM.value = value
    try:
        return getattr(contract, method)(*args)
    finally:
        _DIRECT_VM.value = previous


def _create_community(contract):
    global _SEALER
    _SEALER = _DIRECT_VM.sender
    contract.create_community("Safe Forum", POLICY)


def _target_hex(target) -> str:
    return target if isinstance(target, str) else _addr_hex(target)


def _seal_record(contract, target, *, penalty_level: int = 3) -> int:
    sealer = _SEALER if _SEALER is not None else _DIRECT_VM.sender
    publisher = _DIRECT_VM.sender
    _DIRECT_VM.sender = sealer
    record_id = int(contract.get_counts()["records"])
    contract.seal_moderation_record(
        0,
        _target_hex(target),
        "Appeal of forum moderation decision",
        CASE_FACTS,
        VIOLATION,
        penalty_level,
        DETAILS,
    )
    _DIRECT_VM.sender = publisher
    return record_id


def _publish_case(
    contract,
    target,
    *,
    penalty_level: int = 3,
    value: int = STAKE,
):
    publisher = _DIRECT_VM.sender
    _DIRECT_VM.sender = target
    contract.accept_community_policy(0)
    _DIRECT_VM.sender = publisher
    record_id = _seal_record(contract, target, penalty_level=penalty_level)
    _payable(
        contract,
        "publish_case",
        0,
        _target_hex(target),
        "Appeal of forum moderation decision",
        CASE_FACTS,
        VIOLATION,
        penalty_level,
        DETAILS,
        0,
        record_id,
        value=value,
    )


def _file_appeal(
    contract,
    direct_vm,
    target,
    *,
    requested_level: int = 1,
    value: int = STAKE,
):
    direct_vm.sender = target
    _payable(
        contract,
        "file_appeal",
        0,
        APPEAL_REASON,
        APPEAL_EVIDENCE,
        requested_level,
        value=value,
    )


def _make_judge_ready(contract, appeal_id: int = 0):
    appeal = contract.appeals[appeal_id]
    appeal.response_deadline_at = appeal.created_at


class TestCommunityAuthorization:
    @pytest.mark.parametrize("bad_datetime", ["", "not-a-date", "1"])
    def test_rejects_missing_or_invalid_transaction_datetime(
        self, contract, direct_vm, bad_datetime
    ):
        # gltest's warp currently refreshes sender/value but not the SDK's
        # cached message_raw datetime, so patch that cached transaction field.
        import genlayer.gl as gl_module

        gl_module.message_raw["datetime"] = bad_datetime
        with pytest.raises(Exception, match="transaction datetime"):
            _create_community(contract)

    def test_uses_transaction_datetime_for_created_at(
        self, contract, direct_vm
    ):
        from datetime import datetime
        import genlayer.gl as gl_module

        transaction_datetime = "2026-09-04T09:00:00+00:00"
        gl_module.message_raw["datetime"] = transaction_datetime
        _create_community(contract)
        assert contract.get_community(0)["created_at"] == int(
            datetime.fromisoformat(transaction_datetime).timestamp()
        )

    def test_create_community_records_initial_revision(
        self, contract, direct_alice
    ):
        _create_community(contract)
        community = contract.get_community(0)
        assert community["admin"] == _addr_hex(direct_alice)
        assert community["signing_key"] == _addr_hex(direct_alice)
        assert community["record_count"] == 0
        assert community["policy_version"] == 1
        assert community["revision_count"] == 1
        assert community["active"] is True
        assert contract.is_authorized_moderator(
            0, _addr_hex(direct_alice)
        )
        revisions = contract.get_policy_revisions_page(0, 0, 10)
        assert revisions[0]["policy_text"] == POLICY

    def test_only_admin_can_authorize_moderator(
        self, contract, direct_vm, direct_bob, direct_charlie
    ):
        _create_community(contract)
        direct_vm.sender = direct_bob
        with pytest.raises(Exception, match="admin"):
            contract.set_moderator(0, _addr_hex(direct_charlie), True)

    def test_authorized_moderator_can_publish(
        self, contract, direct_vm, direct_alice, direct_bob, direct_charlie
    ):
        _create_community(contract)
        contract.set_moderator(0, _addr_hex(direct_charlie), True)
        direct_vm.sender = direct_charlie
        _publish_case(contract, direct_bob)
        case = contract.get_case(0)
        assert case["moderator"] == _addr_hex(direct_charlie)
        assert case["target_user"] == _addr_hex(direct_bob)

        direct_vm.sender = direct_alice
        contract.set_moderator(0, _addr_hex(direct_charlie), False)
        direct_vm.sender = direct_charlie
        with pytest.raises(Exception, match="authorized"):
            _publish_case(contract, direct_bob)

    def test_unauthorized_user_cannot_publish(
        self, contract, direct_vm, direct_bob, direct_charlie
    ):
        _create_community(contract)
        direct_vm.sender = direct_charlie
        with pytest.raises(Exception, match="authorized"):
            _publish_case(contract, direct_bob)


class TestCaseSafety:
    def test_target_must_opt_in_before_case_is_published(
        self, contract, direct_bob
    ):
        _create_community(contract)
        record_id = _seal_record(contract, direct_bob)
        with pytest.raises(Exception, match="opted into"):
            _payable(
                contract,
                "publish_case",
                0,
                _addr_hex(direct_bob),
                "Appeal of forum moderation decision",
                CASE_FACTS,
                VIOLATION,
                3,
                DETAILS,
                0,
                record_id,
                value=STAKE,
            )

    def test_policy_update_requires_member_reacceptance(
        self, contract, direct_vm, direct_alice, direct_bob
    ):
        _create_community(contract)
        direct_vm.sender = direct_bob
        contract.accept_community_policy(0)
        direct_vm.sender = direct_alice
        contract.update_policy(
            0,
            UPDATED_POLICY,
            "Add an impersonation rule for future cases only.",
        )
        with pytest.raises(Exception, match="current policy version"):
            record_id = _seal_record(contract, direct_bob)
            _payable(
                contract,
                "publish_case",
                0,
                _addr_hex(direct_bob),
                "Appeal of forum moderation decision",
                CASE_FACTS,
                VIOLATION,
                3,
                DETAILS,
                0,
                record_id,
                value=STAKE,
            )
        membership = contract.get_membership(0, _addr_hex(direct_bob))
        assert membership["current"] is False
        direct_vm.sender = direct_bob
        contract.accept_community_policy(0)
        direct_vm.sender = direct_alice
        _publish_case(contract, direct_bob)

    def test_member_can_leave_and_block_future_cases(
        self, contract, direct_vm, direct_alice, direct_bob
    ):
        _create_community(contract)
        direct_vm.sender = direct_bob
        contract.accept_community_policy(0)
        contract.leave_community(0)
        direct_vm.sender = direct_alice
        record_id = _seal_record(contract, direct_bob)
        with pytest.raises(Exception, match="opted into"):
            _payable(
                contract,
                "publish_case",
                0,
                _addr_hex(direct_bob),
                "Appeal of forum moderation decision",
                CASE_FACTS,
                VIOLATION,
                3,
                DETAILS,
                0,
                record_id,
                value=STAKE,
            )

    def test_policy_is_snapshotted_and_future_update_cannot_rewrite_case(
        self, contract, direct_alice, direct_bob
    ):
        _create_community(contract)
        _publish_case(contract, direct_bob)
        original = contract.get_case(0)
        contract.update_policy(
            0,
            UPDATED_POLICY,
            "Add an impersonation rule for future cases only.",
        )
        updated = contract.get_community(0)
        case = contract.get_case(0)
        assert updated["policy_version"] == 2
        assert case["policy_version"] == 1
        assert case["policy_snapshot"] == POLICY
        assert case["policy_snapshot"] == original["policy_snapshot"]

    def test_rejects_self_case_and_wrong_stake_amount(
        self, contract, direct_alice, direct_bob
    ):
        _create_community(contract)
        with pytest.raises(Exception, match="themselves|against itself"):
            _publish_case(contract, direct_alice)
        with pytest.raises(Exception, match="exactly equal"):
            _publish_case(contract, direct_bob, value=1)
        with pytest.raises(Exception, match="exactly equal"):
            _publish_case(contract, direct_bob, value=STAKE + 1)

    def test_inactive_community_blocks_new_cases_but_preserves_existing(
        self, contract, direct_bob
    ):
        _create_community(contract)
        _publish_case(contract, direct_bob)
        contract.set_community_active(0, False)
        with pytest.raises(Exception, match="inactive"):
            _publish_case(contract, direct_bob)
        assert contract.get_case(0)["policy_snapshot"] == POLICY

    def test_cannot_stack_active_cases_for_same_user(
        self, contract, direct_bob
    ):
        _create_community(contract)
        _publish_case(contract, direct_bob)
        with pytest.raises(Exception, match="active case"):
            _publish_case(contract, direct_bob)
        contract.withdraw_case(
            0, "The first case was withdrawn after correcting the record."
        )
        _publish_case(contract, direct_bob)
        assert contract.get_case(1)["closed"] is False

    def test_moderator_withdrawal_revokes_penalty_and_refunds_pot(
        self, contract, direct_bob
    ):
        _create_community(contract)
        _publish_case(contract, direct_bob)
        contract.withdraw_case(
            0, "The moderation decision was issued to the wrong account."
        )
        case = contract.get_case(0)
        assert case["final_verdict"] == "WITHDRAWN"
        assert case["final_penalty_level"] == 0
        assert case["moderator_stake"] == 0
        assert case["closed"] is True


class TestAppealAuthorizationAndCustody:
    def test_only_target_can_appeal_and_stake_must_match_exactly(
        self, contract, direct_vm, direct_bob, direct_charlie
    ):
        _create_community(contract)
        _publish_case(contract, direct_bob)
        direct_vm.sender = direct_charlie
        with pytest.raises(Exception, match="target user"):
            _payable(
                contract,
                "file_appeal",
                0,
                APPEAL_REASON,
                APPEAL_EVIDENCE,
                1,
                value=STAKE,
            )
        direct_vm.sender = direct_bob
        with pytest.raises(Exception, match="exactly match"):
            _payable(
                contract,
                "file_appeal",
                0,
                APPEAL_REASON,
                APPEAL_EVIDENCE,
                1,
                value=STAKE + 1,
            )

    def test_requested_level_must_be_lower(
        self, contract, direct_vm, direct_bob
    ):
        _create_community(contract)
        _publish_case(contract, direct_bob, penalty_level=3)
        with pytest.raises(Exception, match="lower"):
            _file_appeal(
                contract,
                direct_vm,
                direct_bob,
                requested_level=3,
            )

    def test_appeal_is_one_shot_and_locks_both_pots(
        self, contract, direct_vm, direct_bob
    ):
        _create_community(contract)
        _publish_case(contract, direct_bob)
        _file_appeal(contract, direct_vm, direct_bob)
        case = contract.get_case(0)
        appeal = contract.get_appeal(0)
        assert case["has_open_appeal"] is True
        assert case["appeal_count"] == 1
        assert case["appeal_id"] == 0
        assert case["moderator_stake"] == STAKE
        assert appeal["appellant_stake"] == STAKE
        with pytest.raises(Exception, match="appealable|already"):
            _file_appeal(contract, direct_vm, direct_bob)

    def test_only_original_moderator_can_respond_once(
        self,
        contract,
        direct_vm,
        direct_alice,
        direct_bob,
        direct_charlie,
    ):
        _create_community(contract)
        _publish_case(contract, direct_bob)
        _file_appeal(contract, direct_vm, direct_bob)
        direct_vm.sender = direct_charlie
        with pytest.raises(Exception, match="case moderator"):
            contract.respond_to_appeal(
                0, "A stranger must not be able to answer this appeal."
            )
        direct_vm.sender = direct_alice
        contract.respond_to_appeal(
            0,
            "The full record supports the original decision under the locked policy.",
        )
        with pytest.raises(Exception, match="already responded"):
            contract.respond_to_appeal(
                0, "A second response could unfairly rewrite the record."
            )

    def test_cancel_is_final_and_returns_both_pots(
        self, contract, direct_vm, direct_bob
    ):
        _create_community(contract)
        _publish_case(contract, direct_bob)
        _file_appeal(contract, direct_vm, direct_bob)
        contract.cancel_appeal(0)
        case = contract.get_case(0)
        appeal = contract.get_appeal(0)
        assert appeal["status"] == "CANCELLED"
        assert appeal["paid_out"] is True
        assert contract.get_case_appeal(0)["id"] == 0
        assert appeal["appellant_stake"] == 0
        assert case["moderator_stake"] == 0
        assert case["final_penalty_level"] == 3
        assert case["closed"] is True


class TestJudgmentInvariants:
    def test_cannot_judge_before_response_or_deadline(
        self, contract, direct_vm, direct_bob
    ):
        _create_community(contract)
        _publish_case(contract, direct_bob)
        _file_appeal(contract, direct_vm, direct_bob)
        with pytest.raises(Exception, match="Cannot judge"):
            contract.judge_appeal(0)

    @pytest.mark.parametrize(
        ("verdict", "recommended", "expected"),
        [
            ("UPHOLD_PENALTY", 3, 3),
            ("REDUCE_PENALTY", 1, 1),
            ("REVOKE_PENALTY", 0, 0),
        ],
    )
    def test_valid_verdicts_settle_and_never_increase_level(
        self,
        contract,
        direct_vm,
        direct_bob,
        verdict,
        recommended,
        expected,
    ):
        _create_community(contract)
        _publish_case(contract, direct_bob)
        _file_appeal(contract, direct_vm, direct_bob)
        _make_judge_ready(contract)
        direct_vm.clear_mocks()
        direct_vm.mock_llm(r".*", _decision(verdict, recommended))
        contract.judge_appeal(0)
        case = contract.get_case(0)
        appeal = contract.get_appeal(0)
        assert case["final_penalty_level"] == expected
        assert case["final_penalty_level"] <= 3
        assert case["closed"] is True
        assert case["moderator_stake"] == 0
        assert appeal["appellant_stake"] == 0
        assert appeal["paid_out"] is True

    def test_malicious_increase_is_downgraded_to_inconclusive(
        self, contract, direct_vm, direct_bob
    ):
        _create_community(contract)
        _publish_case(contract, direct_bob, penalty_level=2)
        _file_appeal(
            contract,
            direct_vm,
            direct_bob,
            requested_level=1,
        )
        _make_judge_ready(contract)
        direct_vm.clear_mocks()
        direct_vm.mock_llm(r".*", _decision("REDUCE_PENALTY", 4, 99))
        contract.judge_appeal(0)
        case = contract.get_case(0)
        assert case["final_verdict"] == "INCONCLUSIVE"
        assert case["final_penalty_level"] == 2

    def test_low_confidence_returns_inconclusive(
        self, contract, direct_vm, direct_bob
    ):
        _create_community(contract)
        _publish_case(contract, direct_bob)
        _file_appeal(contract, direct_vm, direct_bob)
        _make_judge_ready(contract)
        direct_vm.clear_mocks()
        direct_vm.mock_llm(
            r".*", _decision("REVOKE_PENALTY", 0, confidence=49)
        )
        contract.judge_appeal(0)
        case = contract.get_case(0)
        assert case["final_verdict"] == "INCONCLUSIVE"
        assert case["final_penalty_level"] == 3

    def test_level_one_cannot_be_reduced_except_revoked(
        self, contract, direct_vm, direct_bob
    ):
        _create_community(contract)
        _publish_case(contract, direct_bob, penalty_level=1)
        _file_appeal(
            contract,
            direct_vm,
            direct_bob,
            requested_level=0,
        )
        _make_judge_ready(contract)
        direct_vm.clear_mocks()
        direct_vm.mock_llm(r".*", _decision("REDUCE_PENALTY", 0, 90))
        contract.judge_appeal(0)
        assert contract.get_case(0)["final_verdict"] == "INCONCLUSIVE"

    def test_anyone_may_judge_but_cannot_receive_the_pot(
        self, contract, direct_vm, direct_bob, direct_charlie
    ):
        _create_community(contract)
        _publish_case(contract, direct_bob)
        _file_appeal(contract, direct_vm, direct_bob)
        _make_judge_ready(contract)
        direct_vm.sender = direct_charlie
        direct_vm.clear_mocks()
        direct_vm.mock_llm(r".*", _decision("REVOKE_PENALTY", 0))
        contract.judge_appeal(0)
        assert contract.get_case(0)["final_penalty_level"] == 0
        assert contract.get_appeal(0)["appellant"] == _addr_hex(direct_bob)


class TestEscapeHatches:
    def test_expire_after_grace_returns_pots_and_keeps_original_level(
        self, contract, direct_vm, direct_bob
    ):
        _create_community(contract)
        _publish_case(contract, direct_bob)
        _file_appeal(contract, direct_vm, direct_bob)
        appeal = contract.appeals[0]
        appeal.judge_deadline_at = appeal.created_at
        contract.expire_appeal(0)
        case = contract.get_case(0)
        stored = contract.get_appeal(0)
        assert stored["status"] == "EXPIRED"
        assert stored["verdict"] == "INCONCLUSIVE"
        assert stored["paid_out"] is True
        assert case["final_penalty_level"] == 3
        assert case["moderator_stake"] == 0
        ledger = contract.get_fairness_ledger()
        assert ledger["expired"] == 1
        assert ledger["judged"] == 0

    def test_anyone_can_close_without_appeal_after_deadline(
        self, contract, direct_vm, direct_bob, direct_charlie
    ):
        _create_community(contract)
        _publish_case(contract, direct_bob)
        direct_vm.sender = direct_charlie
        with pytest.raises(Exception, match="still open"):
            contract.close_case(0)
        contract.cases[0].appeal_deadline_at = contract.cases[0].created_at
        contract.close_case(0)
        case = contract.get_case(0)
        assert case["final_verdict"] == "NO_APPEAL"
        assert case["moderator_stake"] == 0
        assert case["closed"] is True

    def test_judge_after_grace_is_blocked_in_favor_of_refund_path(
        self, contract, direct_vm, direct_bob
    ):
        _create_community(contract)
        _publish_case(contract, direct_bob)
        _file_appeal(contract, direct_vm, direct_bob)
        appeal = contract.appeals[0]
        appeal.response_deadline_at = appeal.created_at
        appeal.judge_deadline_at = appeal.created_at
        with pytest.raises(Exception, match="expire_appeal"):
            contract.judge_appeal(0)

    def test_views_are_paginated_and_bounded(
        self, contract, direct_bob
    ):
        _create_community(contract)
        _publish_case(contract, direct_bob)
        assert len(contract.get_communities_page(0, 10)) == 1
        assert len(contract.get_cases_page(0, 10)) == 1
        assert len(contract.get_cases_for_community_page(0, 0, 10)) == 1
        assert len(
            contract.get_cases_for_user_page(
                _addr_hex(direct_bob), 0, 10
            )
        ) == 1
        with pytest.raises(Exception, match="between 1 and 100"):
            contract.get_cases_page(0, 101)


class TestSealedCommunityRecords:
    def test_publish_requires_a_sealed_record(
        self, contract, direct_bob
    ):
        _create_community(contract)
        _DIRECT_VM.sender = direct_bob
        contract.accept_community_policy(0)
        _DIRECT_VM.sender = _SEALER
        with pytest.raises(Exception, match="Sealed record not found"):
            _payable(
                contract,
                "publish_case",
                0,
                _addr_hex(direct_bob),
                "Appeal of forum moderation decision",
                CASE_FACTS,
                VIOLATION,
                3,
                DETAILS,
                0,
                0,
                value=STAKE,
            )

    def test_non_signer_cannot_seal(
        self, contract, direct_vm, direct_bob, direct_charlie
    ):
        _create_community(contract)
        direct_vm.sender = direct_charlie
        with pytest.raises(Exception, match="signing key"):
            contract.seal_moderation_record(
                0,
                _addr_hex(direct_bob),
                "Appeal of forum moderation decision",
                CASE_FACTS,
                VIOLATION,
                3,
                DETAILS,
            )

    def test_record_cannot_be_reused_or_edited_after_seal(
        self, contract, direct_bob
    ):
        _create_community(contract)
        _publish_case(contract, direct_bob)
        contract.withdraw_case(
            0, "The first case was withdrawn after correcting the record."
        )
        with pytest.raises(Exception, match="already been used"):
            _payable(
                contract,
                "publish_case",
                0,
                _addr_hex(direct_bob),
                "Appeal of forum moderation decision",
                CASE_FACTS,
                VIOLATION,
                3,
                DETAILS,
                0,
                0,
                value=STAKE,
            )
        _publish_case(contract, direct_bob)
        assert contract.get_case(1)["record_id"] == 1
        assert contract.get_case(1)["sealed"] is True
        records = contract.get_records_for_community_page(0, 0, 10)
        assert records[0]["used"] is True
        assert records[1]["used"] is True

    def test_tampered_text_does_not_match_sealed_hash(
        self, contract, direct_bob
    ):
        _create_community(contract)
        _DIRECT_VM.sender = direct_bob
        contract.accept_community_policy(0)
        record_id = _seal_record(contract, direct_bob)
        _DIRECT_VM.sender = _SEALER
        with pytest.raises(Exception, match="does not match"):
            _payable(
                contract,
                "publish_case",
                0,
                _addr_hex(direct_bob),
                "Appeal of forum moderation decision",
                CASE_FACTS + " Extra unsealed sentence.",
                VIOLATION,
                3,
                DETAILS,
                0,
                record_id,
                value=STAKE,
            )

    def test_signing_key_cannot_seal_against_itself(
        self, contract, direct_alice
    ):
        _create_community(contract)
        with pytest.raises(Exception, match="against itself"):
            contract.seal_moderation_record(
                0,
                _addr_hex(direct_alice),
                "Appeal of forum moderation decision",
                CASE_FACTS,
                VIOLATION,
                3,
                DETAILS,
            )

    def test_admin_can_reassign_signing_key(
        self, contract, direct_vm, direct_bob, direct_charlie
    ):
        _create_community(contract)
        contract.set_signing_key(0, _addr_hex(direct_charlie))
        community = contract.get_community(0)
        assert community["signing_key"] == _addr_hex(direct_charlie)
        with pytest.raises(Exception, match="signing key"):
            contract.seal_moderation_record(
                0,
                _addr_hex(direct_bob),
                "Appeal of forum moderation decision",
                CASE_FACTS,
                VIOLATION,
                3,
                DETAILS,
            )
        direct_vm.sender = direct_charlie
        record_id = int(contract.get_counts()["records"])
        contract.seal_moderation_record(
            0,
            _addr_hex(direct_bob),
            "Appeal of forum moderation decision",
            CASE_FACTS,
            VIOLATION,
            3,
            DETAILS,
        )
        assert contract.get_record(record_id)["signer"] == _addr_hex(
            direct_charlie
        )
