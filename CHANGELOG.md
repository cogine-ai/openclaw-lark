# Changelog

## 2026.10.10-cogine.2

- Remove the community slash-prefix rejection that dropped ordinary image-first messages after media placeholders became absolute local paths.
- Keep chat admission, core command authorization metadata, and OAuth App Owner checks unchanged. Restore the official plugin's access to help/start/doctor for users admitted to the conversation.
- Add inbound-message regression coverage for media, ordinary paths, command authorization forwarding, and denied chat access; retain OAuth lifecycle coverage.

## 2026.10.10-cogine.1 — preview

- Sync community v2026.10.10 (1e8816300787e250ef8bd0b9716ba93dcd19de46), including command owner authorization, channel/conversation separation, session-store fallback and skill guidance fixes.
- Use the public npm name @cogineai/openclaw-lark; retain plugin ID openclaw-lark and channel feishu.
- Cancel stale authorization completion after asynchronous identity/card/callback stages, serialize same-user credential writes, and preserve card sequences on reuse.
- Add deterministic shutdown/replacement regressions covering the real authorization and synthetic-message path.
- Raise runtime dependency minimums and refresh the production graph; audit both the locked project and an independent consumer without our lockfile.


## 2026.10.8-cogine.1 — unreleased

- Import the TypeScript source of community compatibility build v2026.10.8 (10523e4362e724a115a6de5e214243a58b22b541).
- Declare all 39 plugin tools for OpenClaw 2026.10.6 registration.
- Give OAuth polling and its continuation an independent tracked Gateway lifetime, with cancellation and cleanup on shutdown.
- Add OAuth continuation regression coverage, source build CI, package checks and an opt-in public npm publishing workflow.
- Rename the package to @cogine-ai/openclaw-lark while retaining plugin ID openclaw-lark and channel feishu; correct runtime version lookup.
- Omit the inherited npx launcher: it downloads a separate upstream tools package and is not the installer for this fork. Install through OpenClaw's plugin manager.

Native streaming is enabled through the documented host reply-delivery configuration; no core code is patched.
