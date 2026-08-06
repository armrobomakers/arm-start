# ARM Indicator Windows Worker

Outbound-only Node.js worker for Myfxbook synchronization and signed publication to the Preview/production API.

## Configuration

Create `C:\ARM\indicator-worker\config\worker.env` with Myfxbook credentials, `ARM_INDICATOR_PUBLISH_URL`, and a random `ARM_INDICATOR_PUBLISH_SECRET` of at least 32 characters. Do not commit this file.

Run `powershell -File scripts\run-worker.ps1 --dry-run` for a fetch/logout check. The scheduled task is created disabled; enable it only after manual approval.

The worker uses no inbound listener, stores sessions only in memory, signs the exact JSON request body, retries publication, and keeps failed payloads in `outbox`.
