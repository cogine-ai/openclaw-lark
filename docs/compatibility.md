# OpenClaw 2026.10.6 compatibility

## Provenance

Source baseline: community v2026.10.10, commit `1e8816300787e250ef8bd0b9716ba93dcd19de46`; itself based on the official Lark plugin. The first pilot modified the distributed bundle (local version 2026.10.8-pilot.2). This repository ports that lifecycle fix into TypeScript; it does not commit machine-specific bundles or logs.

## OAuth continuation failure

Device-flow polling outlives the initiating tool call. In the original implementation the unawaited polling Promise retains that tool's AsyncWorkScope. Core cleanup aborts the scope normally when the tool completes. After the user authorizes, the plugin saves the token and dispatches a synthetic auth-complete message into the original conversation, but its inherited signal is already aborted.

The old core 2026.9.8 uses synchronous cached subagent-maintenance snapshots on this path. Core 2026.10.6 prepares them asynchronously and checks the work signal before session writes. That check throws AbortError (code 20), so the authorization succeeds but conversation continuation fails.

The official 7.16 and community 10.8 synthetic-message paths are equivalent for this flow. The fix is at the asynchronous authorization lifetime boundary, not in chat routing or OAuth token validation.

## Change

`src/tools/oauth.ts` starts polling with the public `runDetachedWebhookWork` SDK helper **before returning from the tool**. Despite the helper's webhook-oriented name, the host implementation provides an independent tracked Gateway continuation and a fresh work scope. It preserves other caller context. The complete poll/token/card/synthetic-message chain runs inside it.

An existing plugin shutdown hook cancels the flow, marks it superseded and awaits background completion. Each hook has a unique key to avoid replacement races. Completion unregisters the hook. Separate pending-card and active-completion registries preserve onboarding batch behavior while keeping unfinished callbacks cancellable. Every asynchronous stage checks whether its flow is still current; cleanup only removes entries owned by that flow. Card reuse carries the latest sequence. Existing owner checks, post-authorization identity verification, token storage, scope filtering, conversation queue and ticket construction remain in place. Core cancellation checks remain untouched.

`openclaw.plugin.json` also declares 39 tool names, matching the plugin's registrations. Package identity changes do not change plugin ID, channel ID or authorization store identity.

## Tests and evidence boundary

The OAuth regression executes real executeAuthorize and the synthetic-message queue. External Lark APIs, token persistence and owner-policy checks are controlled fixtures; this is a lifecycle regression test, not a full authorization-security acceptance. It closes the initiating core AsyncWorkScope before releasing authorization, then uses the real pinned 10.6 maintenance reader in the resumed handler. Without detached work the success case fails; with the patch it continues. Expiry and identity mismatch must not save tokens or continue. Closing or replacing a flow during identity verification, card updates or callbacks must suppress stale continuation. Credential writes already inside the platform cannot be cancelled; same-user writes are serialized so an older slow write cannot replace a newer token.

Core private imports are confined to this pinned-version regression fixture; production uses only the public SDK. Host upgrades require reviewing the fixture and rerunning the pilot. VITEST and a temporary state directory isolate persisted data during tests.

The original macOS pilot confirmed native streaming and automatic results after incremental read-only OAuth, without a second user message. That evidence applies to the pilot package. The new package has its own [release acceptance record](acceptance-2026.10.10-cogine.1.md); rollout is limited to the tested combination until additional platforms and host versions are accepted. No other Macs were changed.

## Streaming

The observed lack of streaming was caused by the Codex execution plugin's message_tool reply default. Setting host `messages.visibleReplies=automatic` enabled the native reply channel. The plugin does not silently edit that setting; it is a global host policy unless overridden.

## Ordinary media messages and command authorization

Version 2026.10.10-cogine.2 removes the community 10.10 B1 early-return block. Media substitution can turn an image-first message into text starting with an absolute path. The SDK intentionally allows false positives when deciding whether to compute command authorization; a false authorization result does not deny ordinary chat admission. The handler now continues to dispatch with the original authorization metadata, as the official Lark plugin does.

Chat admission and OAuth App Owner checks remain in place. Users admitted to the conversation regain the official plugin's help/start/doctor access; doctor contains current-account diagnostic information. No new command classifier, permissions configuration or core patch is introduced.

## Third-party npm-source warning on core 10.6

A normal npm install of this independently maintained package may show `provenance-invalid` / “OpenClaw cannot verify where this plugin came from”. In core10.6, `resolvePluginTrust` only classifies an ordinary npm package as trusted-official when its name appears in the official external-plugin catalog and its install record matches. This package is not in that catalog; the branch does not inspect npm CI attestations or OIDC signatures.

An explicitly reviewed npm-pack file is classified as origin-path and avoids that warning, but it is not trusted-official either. Both sources use the same accepted code and have the same relevant permissions. The loader emits a warning and continues; the plugin does not use the official-only dispatchHookAgentTurn capability. Registry installation was verified with 39 tools and healthy channels.

Do not impersonate an official package, edit trust records or weaken host protection to suppress the notice. Review the public source and archive checksums. CI provenance is useful future supply-chain evidence but does not change this version's official-catalog classification.
