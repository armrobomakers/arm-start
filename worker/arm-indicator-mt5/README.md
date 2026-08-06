# ARM Indicator MT5 Worker

Read-only Windows worker for a dedicated, manually authenticated MT5 terminal.

The worker never places or modifies trades. It reads account snapshots and deal history, stores them in SQLite, builds complete daily returns after a validated historical seed, and publishes only the canonical `dailyGain` input to the existing Vercel endpoint.

## Safety model

- `MT5_TERMINAL_PATH` is mandatory; production never auto-discovers a terminal.
- Login and server must match the configured identity.
- `trade_allowed` must be false. Any violation fails closed and publishes nothing.
- MT5 must be authenticated manually with investor/read-only access.
- No inbound listener, web server, Docker, firewall, RDP, or terminal settings are changed.

## Commands

```powershell
python -m arm_mt5_worker.main validate-seed C:\ARM\indicator-mt5-worker\data\seed-daily-gain.json
python -m arm_mt5_worker.main doctor
python -m arm_mt5_worker.main dry-run
python -m arm_mt5_worker.main status
python -m arm_mt5_worker.main daemon
```

`doctor` and `dry-run` never send HTTP POST. Task Scheduler creation is an explicit, separate action and is not performed by `install.ps1`.

## Manual setup

1. Install the dedicated MT5 terminal manually and log in with the investor/read-only password.
2. Confirm the terminal is the intended ARM account and leave trading disabled.
3. Create `config\worker.env` from `.env.example`. Set the exact `terminal64.exe` path, expected login/server, IANA timezone, seed path, and Preview publish variables.
4. Put a verified seed with at least 90 calendar days in `data\seed-daily-gain.json`. The worker never invents or rewrites seed data.
5. Install the Python package in the worker virtual environment and install `requirements.txt`.
6. Run `doctor`, then `dry-run`. A successful dry-run still does not make an HTTP POST.
7. Start `daemon` manually for observation. Create the startup task only after explicit approval with `scripts\create-task.ps1`; without `-Enable` it is created disabled.

## Data rules

Snapshots are UTC and are saved only after terminal identity and read-only checks. Deal history is synchronized incrementally with an overlap and deduplicated by ticket. `BALANCE` and `CREDIT` are external flows; trading P/L, commissions, swaps and fees are performance. Ambiguous or unknown deal types block daily publishing unless configured in a separate policy JSON.

Daily returns use the configured trading timezone and close tolerance. Days with missing close snapshots or missing pre/post flow snapshots remain incomplete. Flow days use segment chaining so deposits and withdrawals are not treated as trading performance. The current day and live days before the seed cutoff are never published.

## Runtime paths

```text
C:\ARM\indicator-mt5-worker\
  app\
  config\worker.env
  data\arm-indicator.db
  data\seed-daily-gain.json
  logs\worker-YYYY-MM-DD.log
  outbox\
  run\worker.lock
```

The worker stores no MT5 password and opens no listening socket. Logs contain sanitized status only. HTTP failures leave an unsigned payload in `outbox`; replay creates a new timestamp and HMAC signature.
