from __future__ import annotations

import os
import time
from pathlib import Path


class LockBusyError(RuntimeError):
    pass


class ProcessLock:
    def __init__(self, path: Path, stale_seconds: int = 3600) -> None:
        self.path = path
        self.stale_seconds = stale_seconds

    def acquire(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        try:
            handle = self.path.open("x", encoding="utf-8")
        except FileExistsError as exc:
            try:
                if time.time() - self.path.stat().st_mtime > self.stale_seconds:
                    self.path.unlink()
                    handle = self.path.open("x", encoding="utf-8")
                else:
                    raise LockBusyError("worker lock is already held") from exc
            except FileNotFoundError:
                return self.acquire()
        handle.write(f"pid={os.getpid()}\n")
        handle.close()

    def release(self) -> None:
        self.path.unlink(missing_ok=True)

    def __enter__(self) -> "ProcessLock":
        self.acquire()
        return self

    def __exit__(self, *_: object) -> None:
        self.release()
