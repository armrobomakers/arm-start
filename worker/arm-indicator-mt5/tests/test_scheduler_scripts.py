from pathlib import Path


ROOT = Path(__file__).parents[1]


def test_daily_task_scripts_use_daily_sync_and_do_not_enable_old_tasks():
    create = (ROOT / "scripts" / "create-daily-task.ps1").read_text(encoding="utf-8")
    run = (ROOT / "scripts" / "run-daily-sync.ps1").read_text(encoding="utf-8")
    remove = (ROOT / "scripts" / "remove-daily-task.ps1").read_text(encoding="utf-8")
    assert "ARM-Indicator-MT5-Daily-Sync" in create
    assert "daily-sync" in create
    assert "daemon" not in create.lower()
    assert "Disable-ScheduledTask" in create
    assert "-AtStartup" not in create
    assert "daily-sync" in run
    assert "ARM-Indicator-MT5-Daily-Sync" in remove


def test_daily_sync_source_does_not_replay_or_create_outbox():
    source = (ROOT / "src" / "arm_mt5_worker" / "daily_sync.py").read_text(encoding="utf-8")
    assert "replay_oldest" not in source
    assert "queue_payload" not in source
    assert "sign_payload" in source
