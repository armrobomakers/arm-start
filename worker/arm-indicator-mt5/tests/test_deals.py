import pytest

from arm_mt5_worker.deals import CashflowPolicyError, classify_deals


def deal(kind):
    return {"type": kind}


def test_classifies_cashflows_and_performance():
    flows, performance = classify_deals([deal("BALANCE"), deal("BUY"), deal("COMMISSION_DAILY")], {"BALANCE": "external_flow", "BUY": "performance", "COMMISSION_DAILY": "performance"})
    assert [item["type"] for item in flows] == ["BALANCE"]
    assert len(performance) == 2


def test_unknown_type_fails_closed():
    with pytest.raises(CashflowPolicyError): classify_deals([deal("CORRECTION")], {})
