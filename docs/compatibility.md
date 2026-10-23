# OpenClaw 2026.10.6 compatibility

## Provenance

Source baseline: community v2026.10.8, commit `10523e4362e724a115a6de5e214243a58b22b541`; itself based on the official Lark plugin. The first pilot modified the distributed bundle (local version 2026.10.8-pilot.2). This repository ports that lifecycle fix into TypeScript; it does not commit machine-specific bundles or logs.

## OAuth continuation failure

Device-flow polling outlives the initiating tool call. In the original implementation the unawaited polling Promise retains that tool's AsyncWorkScope. Core cleanup aborts the scope normally when the tool completes. After the user authorizes, the plugin saves the token and dispatches a synthetic auth-complete message into the original conversation, but its inherited signal is already aborted.

The old core 2026.9.8 uses synchronous cached subagent-maintenance snapshots on this path. Core 2026.10.6 prepares them asynchronously and checks the work signal before session writes. That check throws AbortError (code 20), so the authorization succeeds but conversation continuation fails.

The official 7.16 and community 10.8 synthetic-message paths are equivalent for this flow. The fix is at the asynchronous authorization lifetime boundary, not in chat routing or OAuth token validation.

## Change

`src/tools/oauth.ts` starts polling with the public `runDetachedWebhookWork` SDK helper **before returning from the tool**. Despite the helper's webhook-oriented name, the host implementation provides an independent tracked Gateway continuation and a fresh work scope. It preserves other caller context. The complete poll/token/card/synthetic-message chain runs inside it.

An existing plugin shutdown hook cancels the flow, marks it superseded and awaits background completion. Each hook has a unique key to avoid replacement races. Completion unregisters the hook. Existing owner checks, post-authorization identity verification, token storage, scope filtering, conversation queue and ticket construction remain in place. Core cancellation checks remain untouched.

`openclaw.plugin.json` also declares 39 tool names, matching the plugin's registrations. Package identity changes do not change plugin ID, channel ID or authorization store identity.

## Tests and evidence boundary

The OAuth regression executes real executeAuthorize and the synthetic-message queue. Only the external Lark APIs and token persistence are replaced. It closes the initiating core AsyncWorkScope before releasing authorization, then uses the real pinned 10.6 maintenance reader in the resumed handler. Without detached work the success case fails; with the patch it continues. Expiry, identity mismatch and shutdown must never continue or save a token.

Core private imports are confined to this pinned-version regression fixture; production uses only the public SDK. Host upgrades require reviewing the fixture and rerunning the pilot. VITEST and a temporary state directory isolate persisted data during tests.

The original macOS pilot confirmed native streaming and automatic results after incremental read-only OAuth, without a second user message. That evidence applies to the pilot package; a freshly built repository package still needs its own manual acceptance before fleet rollout. No other Macs were changed.

## Streaming

The observed lack of streaming was caused by the Codex execution plugin's message_tool reply default. Setting host `messages.visibleReplies=automatic` enabled the native reply channel. The plugin does not silently edit that setting; it is a global host policy unless overridden.
