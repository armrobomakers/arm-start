from __future__ import annotations

import json
from pathlib import Path
from typing import Iterable


DEFAULT_POLICY = {
    "BALANCE": "external_flow",
    "CREDIT": "external_flow",
    "BUY": "performance",
    "SELL": "performance",
    "COMMISSION": "performance",
    "COMMISSION_DAILY": "performance",
    "COMMISSION_MONTHLY": "performance",
    "SWAP": "performance",
    "FEE": "performance",
}


class CashflowPolicyError(RuntimeError):
    pass


def load_policy(path: Path | None) -> dict[str, str]:
    policy = dict(DEFAULT_POLICY)
    if not path:
        return policy
    raw = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        raise CashflowPolicyError("cashflow policy must be an object")
    for key, value in raw.items():
        if value not in {"external_flow", "performance", "ignore", "block"}:
            raise CashflowPolicyError(f"invalid cashflow policy for {key}")
        policy[str(key).upper()] = value
    return policy


def classify_deals(deals: Iterable[dict], policy: dict[str, str]) -> tuple[list[dict], list[dict]]:
    flows: list[dict] = []
    performance: list[dict] = []
    for deal in deals:
        deal_type = str(deal["type"]).upper()
        action = policy.get(deal_type)
        if action is None:
            if deal_type.startswith("COMMISSION"):
                action = "performance"
            else:
                raise CashflowPolicyError(f"ambiguous deal type without policy: {deal_type}")
        if action == "block":
            raise CashflowPolicyError(f"cashflow policy blocks deal type: {deal_type}")
        if action == "external_flow":
            flows.append(deal)
        elif action == "performance":
            performance.append(deal)
    return flows, performance
