import json

from arm_mt5_worker.native_export import inspect_native_export


def test_inspect_native_export(tmp_path):
    (tmp_path / "manifest.json").write_text(json.dumps({
        "generated_at": "2026.07.29 00:00:00",
        "server": "Tickmill-Live",
        "masked_login": "55***45",
        "trade_allowed": False,
        "deals_count": 1,
        "orders_count": 1,
        "first_deal_time": "2026.07.28 10:00:00",
        "last_deal_time": "2026.07.28 10:00:00",
        "first_order_time": "2026.07.28 09:59:00",
        "last_order_time": "2026.07.28 09:59:00",
        "export_version": "1.0.0",
    }), encoding="utf-8")
    (tmp_path / "history-deals.csv").write_text(
        "ticket;order;time;time_msc;type;type_name;entry;entry_name;magic;position_id;reason;reason_name;volume;price;commission;swap;profit;fee;symbol;comment;external_id\n"
        "1;2;2026.07.28 10:00:00;1;0;DEAL_TYPE_BUY;0;DEAL_ENTRY_IN;0;3;0;DEAL_REASON_CLIENT;1;1.0;0;0;0;0;EURUSD;test;\n",
        encoding="cp1252",
    )
    (tmp_path / "history-orders.csv").write_text(
        "ticket;time_setup;time_setup_msc;time_done;time_done_msc;type;type_name;state;state_name;type_filling;filling_name;type_time;time_name;magic;position_id;position_by_id;volume_initial;volume_current;price_open;price_current;price_stoplimit;sl;tp;symbol;comment;external_id\n"
        "2;2026.07.28 09:59:00;1;2026.07.28 10:00:00;2;0;ORDER_TYPE_BUY;2;ORDER_STATE_FILLED;0;ORDER_FILLING_FOK;0;ORDER_TIME_GTC;0;3;0;1;1;1.0;1.0;0;0;0;EURUSD;test;\n",
        encoding="cp1252",
    )
    result = inspect_native_export(tmp_path)
    assert result["deals"] == 1
    assert result["orders"] == 1
    assert result["symbols"] == ["EURUSD"]
    assert result["position_ids"] == ["3"]
