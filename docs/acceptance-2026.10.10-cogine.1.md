# 2026.10.10-cogine.1 preview acceptance

Status: in progress; npm publication is conditional on final artifact acceptance.

Target: this pilot Mac only, Node 24.22.1, OpenClaw 2026.10.6. Existing robot configuration, pairing and macOS Keychain authorization are preserved. No other Macs are changed.

The previous 10.8-pilot.2 acceptance is historical evidence. This release must install and exercise its own exact archive, then publish that same archive under the next tag.

Automatic validation and dependency audit results, artifact SHA-256, runtime registration/health, native streaming, read-only OAuth continuation, and registry integrity verification will be recorded here as completed. No private chat content, credentials or user identifiers belong in this record.

## Automatic checks completed

- Community baseline: v2026.10.10, commit 1e8816300787e250ef8bd0b9716ba93dcd19de46.
- Node24.22.1 and exact OpenClaw2026.10.6 fixture; frozen install and typecheck passed.
- 56 test files / 465 tests passed, including 14 OAuth lifecycle and real-queue regressions. New edge tests fail on the prior implementation and pass with the fix.
- Lint: 0 errors, 30 inherited warnings. Modified OAuth and synthetic dispatch files have no lint warnings.
- Production and independent manifest-only consumer audits: zero advisories. Full development graph has 2 high / 2 moderate entries solely through the pinned core fixture; see dependency-status.md.
- Source build and built-tool/manifest comparison passed: exactly 39 tool contracts.
- Read-only peer review found no further code issue blocking the scoped next preview after queue cancellation was covered.

Final archive installation, native streaming and incremental read-only OAuth acceptance remain pending. npm publication has not occurred.
