# Dependency audit status — 2026-10-28

The preview's production dependency graph now has **0 critical, high, moderate or low advisories**. A separate fresh npm consumer, installing the new package manifest without this repository's pnpm lockfile, also reports zero advisories. Neither check relies on a consumer inheriting our root overrides; none are needed for runtime dependencies.

Runtime minimums were raised to Lark SDK 1.76.0, image-size 2.0.4 and zod 4.6.7. The production lockfile was refreshed, including axios, protobufjs, ws, qs, follow-redirects, form-data and protobuf UTF-8 handling. Fresh consumer resolved versions and both audit metadata sets are recorded in [dependency-audit.json](dependency-audit.json).

Development tooling was refreshed within its existing major versions. Vite 8.3.5 is an explicit development dependency so the test runner does not reuse the old affected version. The complete development graph still reports **2 high and 2 moderate** advisories, all through the exact `openclaw@2026.10.6` development fixture (`zod` and `undici`). Core 10.6 is intentionally pinned to reproduce the original compatibility boundary. These development dependencies are excluded from the plugin archive and consumer runtime install.

The production audit covers this plugin's own runtime dependencies, not the user's separately installed OpenClaw host. A zero plugin audit does not assert that the host or entire machine is free of vulnerabilities. Host upgrades follow their own validation and backup requirements; this release does not upgrade the core.

Reproduce: `pnpm install --frozen-lockfile`, `pnpm audit --prod`, then `pnpm audit` to inspect the separate development graph. Publishing checks production advisories and stops on high/critical entries. Registry advisories may change after this dated check.

The initial imported October 24 report is retained as [historical evidence](dependency-audit-2026-10-24.json). Advisory metadata is not a validated exploit against a plugin feature.
