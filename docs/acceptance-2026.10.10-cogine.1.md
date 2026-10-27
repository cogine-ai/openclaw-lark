# 2026.10.10-cogine.1 preview acceptance

Status: final archive acceptance passed; public npm next publication and registry installation verified.

Target: this pilot Mac only, Node 24.22.1, OpenClaw 2026.10.6. Existing robot configuration, pairing and macOS Keychain authorization are preserved. No other Macs are changed.

The previous 10.8-pilot.2 acceptance is historical evidence. This release must install and exercise its own exact archive, then publish that same archive under the next tag.

Automatic checks and final-archive live acceptance are recorded below. Registry integrity verification is recorded below. No private chat content, credentials or user identifiers belong in this record.

## Automatic checks completed

- Community baseline: v2026.10.10, commit 1e8816300787e250ef8bd0b9716ba93dcd19de46.
- Node24.22.1 and exact OpenClaw2026.10.6 fixture; frozen install and typecheck passed.
- 56 test files / 465 tests passed, including 14 OAuth lifecycle and real-queue regressions. New edge tests fail on the prior implementation and pass with the fix.
- Lint: 0 errors, 30 inherited warnings. Modified OAuth and synthetic dispatch files have no lint warnings.
- Production and independent manifest-only consumer audits: zero advisories. Full development graph has 2 high / 2 moderate entries solely through the pinned core fixture; see dependency-status.md.
- Source build and built-tool/manifest comparison passed: exactly 39 tool contracts.
- Read-only peer review found no further code issue blocking the scoped next preview after queue cancellation was covered.

## Exact archive and live acceptance

- Archive: cogineai-openclaw-lark-2026.10.10-cogine.1.tgz, 25 files.
- SHA-256: `64e469ae1682a9ca2c72b6d9ce986f99a31cb9bfc89b31b07b9f98d4e5ceb1ad`.
- Installed through OpenClaw npm-pack; Gateway applied generation7, plugin loaded as @cogineai/openclaw-lark 2026.10.10-cogine.1. Installed dist files match the archive byte for byte; 39 tools, no plugin diagnostics, Gateway/Feishu/Telegram healthy.
- Independent fresh consumer installed this actual archive without our pnpm lockfile: zero runtime advisories, optional peer OpenClaw not installed.
- 2026-10-28 04:52–04:53 Asia/Taipei: user confirmed native card text appeared incrementally; the corresponding Agent turn used no message tool. Detailed streaming-phase logs were not retained in the available console output, so this visual criterion is attributed to the user's live observation.
- Incremental authorization acceptance: the first real feishu_chat search returned awaiting_authorization; completion injected the synthetic auth-complete message in the same conversation; the resumed tool returned zero matching chats. No intervening manual continue message. User confirmed automatic result after clicking the card.
- The new read-only scope is im:chat:read. All previous scope grants remain present. Robot channel configuration, secret provider and existing credential file hashes are unchanged. Keychain authorization remains stored.
- No other Macs were changed; this is not acceptance for other host versions, operating systems or every office-tool write action.

## Published archive verification

- Public package: https://www.npmjs.com/package/@cogineai/openclaw-lark/v/2026.10.10-cogine.1; next resolves to this preview version.
- Downloaded anonymously from the registry and compared with the pilot-accepted archive: exact byte equality, SHA-256 unchanged.
- Registry shasum: `724d9d799d37a2f7b680d4c9dc0a80c318abf447`.
- Registry integrity: `sha512-2iDruHMs7H44w9NPPdhTvct7VynVp++Eeg5pNMaP4is++ekqejXKK5Uk7AxblVjHdp6/aLs6t7bHdSU0x5Bl4w==`.
- Pilot Mac reinstalled the exact published npm version with pinning; Gateway generation8 applied, dist code still matches the accepted archive, 39 tools and healthy channels. Existing configuration and credential files remain unchanged.
- OpenClaw10.6 emits a third-party npm-source trust warning for this package; the core checks the official package catalog, not CI attestations. The former npm-pack install was not trusted-official either. This is a warning, not a plugin load failure; no core records or allowlists were falsified to suppress it. See compatibility.md.

The accepted file was uploaded unchanged; it was not rebuilt after manual acceptance.
