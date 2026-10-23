# Changelog

## 2026.10.8-cogine.1 — unreleased

- Import the TypeScript source of community compatibility build v2026.10.8 (10523e4362e724a115a6de5e214243a58b22b541).
- Declare all 39 plugin tools for OpenClaw 2026.10.6 registration.
- Give OAuth polling and its continuation an independent tracked Gateway lifetime, with cancellation and cleanup on shutdown.
- Add OAuth continuation regression coverage, source build CI, package checks and an opt-in public npm publishing workflow.
- Rename the package to @cogine-ai/openclaw-lark while retaining plugin ID openclaw-lark and channel feishu; correct runtime version lookup.
- Omit the inherited npx launcher: it downloads a separate upstream tools package and is not the installer for this fork. Install through OpenClaw's plugin manager.

Native streaming is enabled through the documented host reply-delivery configuration; no core code is patched.
