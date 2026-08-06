from __future__ import annotations

import json
import logging
import time
from datetime import datetime, timezone
from pathlib import Path


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "time": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "message": record.getMessage(),
        }
        if hasattr(record, "details"):
            payload["details"] = record.details
        return json.dumps(payload, ensure_ascii=True)


def configure_logging(log_dir: Path) -> logging.Logger:
    log_dir.mkdir(parents=True, exist_ok=True)
    cutoff = time.time() - (14 * 24 * 60 * 60)
    for old_log in log_dir.glob("worker-*.log"):
        if old_log.stat().st_mtime < cutoff:
            old_log.unlink(missing_ok=True)
    path = log_dir / f"worker-{datetime.now(timezone.utc):%Y-%m-%d}.log"
    logger = logging.getLogger("arm_mt5_worker")
    logger.setLevel(logging.INFO)
    logger.handlers.clear()
    handler = logging.FileHandler(path, encoding="utf-8")
    handler.setFormatter(JsonFormatter())
    logger.addHandler(handler)
    console = logging.StreamHandler()
    console.setFormatter(JsonFormatter())
    logger.addHandler(console)
    return logger


def log(logger: logging.Logger, level: int, message: str, **details: object) -> None:
    logger.log(level, message, extra={"details": details})
