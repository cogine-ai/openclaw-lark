# Contributing

Use Node 24.22.1 and pnpm 10.32.1 (packageManager is pinned). Install with `pnpm install --frozen-lockfile`.

Keep compatibility changes small and traceable to an upstream API or a reproducible failure. Change TypeScript source, not generated dist bundles. Add regression coverage at the actual failing boundary, then run typecheck, lint, tests, build and package checks.

Upstream source baseline: hotwvpyym/openclaw-lark-compat tag v2026.10.8, commit 10523e4362e724a115a6de5e214243a58b22b541. Track both that fork and larksuite/openclaw-lark. Import selected upstream changes on a branch; inspect the diff, rerun regressions and perform a pilot before release. Avoid wholesale replacement of the OAuth lifecycle or tool contracts fixes.

The plugin ID and Feishu configuration keys are intentionally stable. Treat changes to authorization ownership, scopes, synthetic message identity and routing as behavior changes requiring review. Do not remove cancellation checks to fix an aborted continuation.

Do not commit OpenClaw state, robot credentials, OAuth/device codes, user/chat identifiers, private message content or local diagnostic logs. Automated tests use synthetic identities and mocked network/token storage.

Open a pull request for normal maintenance. Document the trigger, resulting behavior and validation; update CHANGELOG.md and compatibility notes when needed. See docs/releasing.md for public npm releases.

The CI workflow supports manual runs as well as pushes and pull requests. Both CI and the publishing workflow require GitHub Actions to be permitted for this repository. If organization policy disables Actions, a GitHub administrator must allow this repository before remote workflows can run; the documented local validation and manual publishing commands remain available.
