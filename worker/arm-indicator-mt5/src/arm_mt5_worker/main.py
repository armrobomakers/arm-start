from __future__ import annotations

import argparse
import hashlib
import json
import logging
import os
import signal
import time
from datetime import datetime, timezone
from pathlib import Path

from .collector import collect_snapshot, sync_deals
from .config import Config, ConfigError, load_config
from .database import Database
from .daily_returns import calculate_daily_returns
from .deals import load_policy
from .doctor import doctor
from .locks import LockBusyError, ProcessLock
from .logging_setup import configure_logging, log
from .mt5_adapter import MT5Adapter, MT5SecurityError
from .native_export import NativeExportError, inspect_native_export
from .native_analysis import analyze_native_history
from .profit_model import analyze_profit_model, prepare_cashflow_valuation, prepare_last120_validation, render_profit_model
from .validation import render_validation, validate_last120_profit
from .outbox import queue_payload, replay_oldest, pending_payloads
from .publisher import Publisher, canonical_payload, sign_payload
from .reconstruct import NativeExportError as ReconstructionError, export_report, reconstruct_last120
from .seed import combine_seed_and_live, validate_seed


def _adapter(config: Config) -> MT5Adapter:
    return MT5Adapter(config.mt5_terminal_path, config.expected_login, config.expected_server, config.expected_company)


def _payload(config: Config, database: Database) -> tuple[dict, bool]:
    seed = validate_seed(config.seed_path)
    cutoff = seed[-1]["date"]
    publish_after = datetime.now(timezone.utc).timestamp() - (config.publish_delay_minutes * 60)
    live = [
        {"date": row["date"], "value": row["return_pct"]}
        for row in database.daily_returns(complete_only=True)
        if row["date"] > cutoff and datetime.fromisoformat(row["calculated_at"].replace("Z", "+00:00")).timestamp() <= publish_after
    ]
    combined = combine_seed_and_live(seed, live)
    return canonical_payload(config.system_id, config.account_name, combined), bool(live)


def run_cycle(config: Config, publish: bool, logger: logging.Logger) -> dict[str, object]:
    database = Database(config.db_path)
    database.initialize()
    adapter = _adapter(config)
    try:
        identity = adapter.connect_read_only()
        log(logger, logging.INFO, "MT5 connected", login=identity.login, server=identity.server, read_only=True)
        collect_snapshot(adapter, database)
        sync_deals(adapter, database)
        returns = calculate_daily_returns(database.snapshots(), database.deals(), config.day_timezone, config.day_close_time, config.day_close_tolerance_seconds, config.flow_snapshot_max_gap_seconds, load_policy(config.cashflow_policy_path))
        database.upsert_daily_returns(returns)
        payload, ready = _payload(config, database)
        raw_payload = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        hmac_ok = sign_payload(config.publish_secret, "0", raw_payload).startswith("v1=")
        summary = {"mt5": "OK", "read_only": "OK", "login_match": True, "server_match": True, "seed": "OK", "hmac": "OK" if hmac_ok else "FAIL", "complete_live_days": sum(1 for item in returns if item["complete"]), "data_as_of": payload["dailyGain"][-1]["date"] if payload["dailyGain"] else None, "daily_gain_points": len(payload["dailyGain"]), "outbox": len(pending_payloads(config.outbox_path)), "ready_for_publish": ready, "publish": "skipped_dry_run" if not publish else "pending"}
        if publish:
            publisher = Publisher(config.publish_url, config.publish_secret, config.bypass_secret, config.http_timeout_seconds)
            replay_oldest(config.outbox_path, lambda item: publisher.publish(item))
            if ready:
                try:
                    result = publisher.publish(payload)
                except Exception:
                    queue_payload(config.outbox_path, payload)
                    raise
                digest = hashlib.sha256(json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")).hexdigest()
                database.mark_published(payload["dailyGain"][-1]["date"], digest)
                summary["publish"] = f"ok_http_{result.status}"
        return summary
    finally:
        adapter.close()


def command_doctor(config: Config) -> int:
    result = doctor(config, _adapter(config))
    print(json.dumps(result, ensure_ascii=True))
    ok = all(
        value != "FAIL" and not (key == "trade_allowed" and value is True)
        for key, value in result.items()
    )
    print("DOCTOR_OK" if ok else "DOCTOR_FAILED")
    return 0 if ok else 1


def command_status(config: Config) -> int:
    database = Database(config.db_path)
    database.initialize()
    print(json.dumps({"db": str(config.db_path), "snapshots": len(database.snapshots()), "deals": len(database.deals()), "complete_days": len(database.daily_returns(True)), "pending_outbox": len(pending_payloads(config.outbox_path)), "last_publish": database.get_state("last_successful_publish")}, ensure_ascii=True))
    return 0


def command_inspect_native_export(path: str | None) -> int:
    directory = Path(path or os.environ.get("ARM_NATIVE_EXPORT_DIR", "C:/ARM/indicator-mt5-worker/data/native-export"))
    try:
        result = inspect_native_export(directory)
    except NativeExportError as exc:
        print(f"MANIFEST VALID: NO ({exc})")
        return 30
    manifest = result["manifest"]
    print("MANIFEST VALID: YES")
    print(f"DEALS: {result['deals']}")
    print(f"ORDERS: {result['orders']}")
    print(f"FIRST DEAL: {manifest['first_deal_time']}")
    print(f"LAST DEAL: {manifest['last_deal_time']}")
    print(f"DEAL TYPES: {json.dumps(result['deal_types'], ensure_ascii=True)}")
    print(f"SYMBOLS: {', '.join(result['symbols']) if result['symbols'] else '-'}")
    print(f"POSITION IDS: {len(result['position_ids'])}")
    return 0


def command_analyze_native_history(path: str | None) -> int:
    directory = Path(path or os.environ.get("ARM_NATIVE_EXPORT_DIR", "C:/ARM/indicator-mt5-worker/data/native-export"))
    try:
        result = analyze_native_history(directory)
    except (NativeExportError, OSError, ValueError) as exc:
        print(f"ANALYSIS FAILED: {exc}")
        return 30
    positions = result["positions"]
    closed = [item for item in positions.values() if item.close_time and item.remaining_volume <= 1e-9 and not item.invalid]
    open_positions = [item for item in positions.values() if item.remaining_volume > 1e-9]
    single = [item for item in positions.values() if item.entries == 1 and item.exits == 1 and not item.invalid]
    partial = [item for item in positions.values() if item.partial]
    reversed_positions = [item for item in positions.values() if item.reversals]
    invalid = [item for item in positions.values() if item.invalid]
    categories = result["balance_categories"]
    totals = result["balance_totals"]
    print(f"POSITIONS TOTAL: {len(positions)}")
    print(f"POSITIONS CLOSED: {len(closed)}")
    print(f"POSITIONS STILL OPEN: {len(open_positions)}")
    print(f"SINGLE ENTRY/SINGLE EXIT: {len(single)}")
    print(f"PARTIAL POSITIONS: {len(partial)}")
    print(f"REVERSED POSITIONS: {len(reversed_positions)}")
    print(f"INVALID POSITION LIFECYCLES: {len(invalid)}")
    print(f"BALANCE OPERATIONS: {len(result['balances'])}")
    print(f"DEPOSITS: {categories['deposit']}")
    print(f"WITHDRAWALS: {categories['withdrawal']}")
    print(f"OTHER: {categories['other']}")
    print(f"AMBIGUOUS: {categories['ambiguous']}")
    print(f"DEPOSIT TOTAL: {totals['deposit']:.2f}")
    print(f"WITHDRAWAL TOTAL: {totals['withdrawal']:.2f}")
    print(f"LAST 120 DAYS: {result['last_120_days']}")
    print(f"OVERNIGHT POSITION-DAYS: {result['overnight_position_days']}")
    print(f"UNIQUE PRICE REQUESTS: {result['price_requests']}")
    print(f"SYMBOLS REQUIRING PRICES: {', '.join(result['symbols_requiring_prices']) or '-'}")
    print(f"ORDERCALCPROFIT REQUESTS: {result['ordercalc_requests']}")
    print("DAILYGAIN CREATED: NO")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["doctor", "dry-run", "daemon", "status", "validate-seed", "inspect-native-export", "analyze-native-history", "analyze-profit-model", "prepare-last120-validation", "validate-last120-profit", "prepare-cashflow-valuation", "reconstruct-last120-dailygain"])
    parser.add_argument("path", nargs="?")
    parser.add_argument("--env", dest="env_path")
    args = parser.parse_args(argv)
    if args.command == "validate-seed":
        print(json.dumps({"valid": True, "points": len(validate_seed(Path(args.path)))}, ensure_ascii=True)); return 0
    if args.command == "inspect-native-export":
        return command_inspect_native_export(args.path)
    if args.command == "analyze-native-history":
        return command_analyze_native_history(args.path)
    if args.command == "analyze-profit-model":
        try:
            print(render_profit_model(analyze_profit_model(Path(args.path or os.environ.get("ARM_NATIVE_EXPORT_DIR", "C:/ARM/indicator-mt5-worker/data/native-export")))))
            return 0
        except (NativeExportError, OSError, ValueError) as exc:
            print(f"ANALYSIS FAILED: {exc}")
            return 30
    if args.command == "prepare-last120-validation":
        try:
            result = prepare_last120_validation(Path(args.path or os.environ.get("ARM_NATIVE_EXPORT_DIR", "C:/ARM/indicator-mt5-worker/data/native-export")))
            print(f"LAST-120 VALIDATION SAMPLES: {len(result['samples'])}")
            print(f"DIRECT VALIDATION SAMPLES: {sum(row['currency_profit'] == row['account_currency'] for row in result['samples'])}")
            print(f"CONVERSION REQUIRED SAMPLES: {sum(row['currency_profit'] != row['account_currency'] for row in result['samples'])}")
            print(f"VALIDATION CONVERSION REQUESTS: {len(result['conversion_requests'])}")
            print(f"DAY-CLOSE SYMBOLS: {', '.join(result['day_close_symbols']) or '-'}")
            print(f"LAST-120 VALUATION SYMBOLS: {', '.join(result['valuation_symbols']) or '-'}")
            print("CASHFLOW FILES CREATED: NO")
            return 0
        except (NativeExportError, OSError, ValueError) as exc:
            print(f"ANALYSIS FAILED: {exc}")
            return 30
    if args.command == "prepare-cashflow-valuation":
        try:
            result = prepare_cashflow_valuation(Path(args.path or os.environ.get("ARM_NATIVE_EXPORT_DIR", "C:/ARM/indicator-mt5-worker/data/native-export")))
            print(f"BALANCE FLOWS: {result['flows']}")
            print(f"OPEN POSITION VALUATIONS: {len(result['prices'])}")
            print(f"UNIQUE CASHFLOW PRICE POINTS: {len(result['unique_prices'])}")
            print(f"CONVERSION REQUESTS: {len(result['conversions'])}")
            print(f"UNIQUE CONVERSION PRICE POINTS: {len(result['unique_conversions'])}")
            print("CASHFLOW FILES CREATED: YES")
            return 0
        except (NativeExportError, OSError, ValueError) as exc:
            print(f"CASHFLOW PREPARATION FAILED: {exc}")
            return 30
    if args.command == "validate-last120-profit":
        try:
            print(render_validation(validate_last120_profit(Path(args.path or os.environ.get("ARM_NATIVE_EXPORT_DIR", "C:/ARM/indicator-mt5-worker/data/native-export")))))
            return 0
        except (NativeExportError, OSError, ValueError) as exc:
            print(f"VALIDATION FAILED: {exc}")
            return 30
    if args.command == "reconstruct-last120-dailygain":
        try:
            config = load_config(args.env_path, require_runtime=False)
            report = export_report(config.mt5_export_dir)
            print(f"WORKER USER: {os.environ.get('USERNAME', '-')}")
            print(f"MT5 EXPORT DIRECTORY: {config.mt5_export_dir}")
            for item in report:
                print(f"INPUT: {item['path']} size={item['size']} data_rows={item['rows']}")
            result = reconstruct_last120(config.mt5_export_dir, config.seed_path)
            coverage = result["coverage"]
            print(f"DAY CLOSE PRICE MISSING: {coverage['day_missing']}")
            print(f"DAY CLOSE CONVERSION MISSING: {coverage['conversion_missing']}")
            print(f"CASHFLOW PRICE MISSING: {coverage['cash_missing']}")
            print(f"CASHFLOW CONVERSION MISSING: {coverage['cash_conversion_missing']}")
            print(f"FUTURE TICKS: {coverage['future']}")
            print(f"M1 FALLBACKS: {coverage['m1']}")
            daily = result["daily"]
            equities = [row["equity_close"] for row in result["day_equity"]]
            values = [row["value"] for row in daily]
            complete_days = len(daily)
            all_days = len({row["date"] for row in result["day_equity"]})
            print(f"DAY CLOSES RECONSTRUCTED: {all_days}")
            print(f"COMPLETE DAILY RETURNS: {complete_days}")
            print(f"INCOMPLETE DAYS: {all_days - complete_days}")
            print(f"BALANCE FLOWS: {len(result['flows'])}")
            print(f"CASHFLOW INVARIANT MAX ERROR: {result['cashflow_invariant_max_error']:.12g}")
            print(f"MIN EQUITY: {min(equities):.12g}")
            print(f"MAX EQUITY: {max(equities):.12g}")
            print(f"MIN DAILY GAIN: {min(values):.12g}")
            print(f"MAX DAILY GAIN: {max(values):.12g}")
            print(f"MEDIAN DAILY GAIN: {sorted(values)[len(values) // 2]:.12g}")
            print(f"FIRST COMPLETE DATE: {daily[0]['date']}")
            print(f"LAST COMPLETE DATE: {daily[-1]['date']}")
            print(f"DAILYGAIN CREATED: YES ({config.seed_path})")
            print(f"DAILYGAIN ROWS: {len(daily)}")
            print("ARM SCORE CALCULATED ON VPS: NO")
            print("READY FOR PREVIEW PUBLISH: YES")
            return 0
        except (ConfigError, ReconstructionError, OSError, ValueError) as exc:
            print(f"DAILYGAIN RECONSTRUCTION FAILED: {exc}")
            return 30
    config = load_config(args.env_path, require_runtime=args.command not in {"doctor", "status"})
    if args.command == "doctor": return command_doctor(config)
    if args.command == "status": return command_status(config)
    logger = configure_logging(config.db_path.parent.parent / "logs")
    lock = ProcessLock(config.db_path.parent.parent / "run" / "worker.lock")
    try:
        with lock:
            if args.command == "dry-run":
                summary = run_cycle(config, False, logger)
                for key, label in (("mt5", "MT5"), ("read_only", "READ_ONLY"), ("login_match", "LOGIN_MATCH"), ("server_match", "SERVER_MATCH"), ("seed", "SEED"), ("complete_live_days", "COMPLETE_LIVE_DAYS"), ("data_as_of", "DATA_AS_OF"), ("daily_gain_points", "DAILY_GAIN_POINTS"), ("outbox", "OUTBOX"), ("publish", "PUBLISH")):
                    print(f"{label}: {summary.get(key)}")
                return 0
            if args.command == "daemon":
                stopping = False
                def stop(*_: object) -> None:
                    nonlocal stopping; stopping = True
                signal.signal(signal.SIGINT, stop); signal.signal(signal.SIGTERM, stop)
                backoff = config.sample_interval_seconds
                while not stopping:
                    try:
                        run_cycle(config, True, logger)
                        backoff = config.sample_interval_seconds
                    except Exception as exc:
                        log(logger, logging.ERROR, "worker cycle failed", error=type(exc).__name__, message=str(exc))
                        backoff = min(max(config.sample_interval_seconds, backoff * 2), 300)
                    time.sleep(backoff)
                return 0
    except LockBusyError:
        return 50
    except (ConfigError, MT5SecurityError, Exception) as exc:
        print(json.dumps({"ok": False, "error": type(exc).__name__, "message": str(exc)}, ensure_ascii=True)); return 30
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
