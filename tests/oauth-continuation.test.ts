import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { executeAuthorize, type ExecuteAuthorizeParams } from '../src/tools/oauth';
import { injectInboundHandler } from '../src/messaging/inbound/handler-registry';
import { _resetShutdownHooks, drainShutdownHooks } from '../src/core/shutdown-hooks';

const doubles = vi.hoisted(() => ({
  poll: vi.fn(),
  save: vi.fn(),
  cardUpdate: vi.fn(),
}));
vi.mock('../src/core/lark-client', () => ({ LarkClient: { fromAccount: () => ({ sdk: {} }) } }));
vi.mock('../src/core/owner-policy', () => ({
  assertOwnerAccessStrict: vi.fn().mockResolvedValue(undefined),
  OwnerAccessDeniedError: class extends Error {},
}));
vi.mock('../src/core/app-scope-checker', () => ({ getAppGrantedScopes: async () => ['calendar:calendar.event:read'] }));
vi.mock('../src/core/device-flow', () => ({
  requestDeviceAuthorization: async () => ({
    deviceCode: 'fixture',
    verificationUriComplete: 'https://example.invalid',
    expiresIn: 600,
    interval: 1,
  }),
  pollDeviceToken: doubles.poll,
}));
vi.mock('../src/core/token-store', () => ({
  getStoredToken: async () => null,
  setStoredToken: doubles.save,
  tokenStatus: () => 'missing',
}));
vi.mock('../src/core/uat-client', () => ({ revokeUAT: vi.fn() }));
vi.mock('../src/card/cardkit', () => ({
  createCardEntity: async () => 'fixture-card',
  sendCardByCardId: async () => ({ messageId: 'fixture-card-message' }),
  updateCardKitCardForAuth: doubles.cardUpdate,
}));

type Prepared = { capture(): Map<unknown, unknown>; dispose(): void };
let prepareMaintenance: (runs: Map<unknown, unknown>) => Promise<Prepared>;
let AsyncWorkScope: new () => {
  track<T>(run: () => Promise<T>): Promise<T>;
  drain(): Promise<void>;
  signal: AbortSignal;
};
const stateDir = mkdtempSync(join(tmpdir(), 'lark-oauth-test-'));
const previousStateDir = process.env.OPENCLAW_STATE_DIR;

beforeAll(async () => {
  process.env.OPENCLAW_STATE_DIR = stateDir;
  // Test only: pin the real 10.6 session-maintenance boundary that threw AbortError.
  // Production code imports only public SDK APIs, never this internal file.
  const require = createRequire(import.meta.url);
  const dist = dirname(dirname(require.resolve('openclaw/plugin-sdk/core')));
  const core = await import(pathToFileURL(join(dist, 'subagent-registry-state-UGqCV-FA.mjs')).href);
  prepareMaintenance = core.d;
  const scope = await import(pathToFileURL(join(dist, 'async-work-scope-DDiH0P7W.mjs')).href);
  AsyncWorkScope = scope.t;
});
afterAll(() => {
  if (previousStateDir === undefined) delete process.env.OPENCLAW_STATE_DIR;
  else process.env.OPENCLAW_STATE_DIR = previousStateDir;
  rmSync(stateDir, { recursive: true, force: true });
  vi.unstubAllGlobals();
});
beforeEach(() => {
  vi.clearAllMocks();
  _resetShutdownHooks();
  doubles.cardUpdate.mockResolvedValue(undefined);
  doubles.save.mockResolvedValue(undefined);
});

async function runAuthorization(kind: 'success' | 'expired' | 'identity-mismatch' | 'shutdown') {
  let release!: (result: unknown) => void;
  let flowSignal!: AbortSignal;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  doubles.poll.mockImplementation(({ signal }: { signal: AbortSignal }) => {
    flowSignal = signal;
    return new Promise((resolve, reject) => {
      gate.then(resolve, reject);
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      json: async () => ({
        code: 0,
        data: { open_id: kind === 'identity-mismatch' ? 'fixture-other-user' : 'fixture-user' },
      }),
    })),
  );
  const resumed = vi.fn(async () => {
    const snapshot = await prepareMaintenance(new Map());
    try {
      snapshot.capture();
    } finally {
      snapshot.dispose();
    }
  });
  const completed = vi.fn();
  injectInboundHandler(async (params) => {
    await resumed();
    completed(params);
  });
  const params = {
    account: { appId: 'fixture-app', appSecret: 'fixture-not-a-secret', accountId: 'default', brand: 'feishu' },
    senderOpenId: 'fixture-user',
    scope: 'calendar:calendar.event:read',
    forceAuth: true,
    cfg: {},
    ticket: {
      messageId: `fixture-${kind}`,
      chatId: 'fixture-chat',
      accountId: 'default',
      senderOpenId: 'fixture-user',
      chatType: 'p2p',
      startTime: Date.now(),
    },
  } as ExecuteAuthorizeParams;
  const toolScope = new AsyncWorkScope();
  const result = await toolScope.track(() => executeAuthorize(params));
  expect(result.details).toMatchObject({ awaiting_authorization: true });
  await toolScope.drain();
  expect(toolScope.signal.aborted).toBe(true);
  if (kind === 'shutdown') await drainShutdownHooks({ deadlineMs: 1000 });
  else
    release(
      kind === 'expired'
        ? { ok: false, message: 'expired' }
        : {
            ok: true,
            token: {
              accessToken: 'fixture-access',
              refreshToken: 'fixture-refresh',
              expiresIn: 3600,
              refreshExpiresIn: 7200,
              scope: 'calendar:calendar.event:read',
            },
          },
    );
  if (kind === 'success') {
    await vi.waitFor(() => expect(completed).toHaveBeenCalledTimes(1));
    expect(doubles.save).toHaveBeenCalledTimes(1);
    expect(completed.mock.calls[0][0]).toMatchObject({ accountId: 'default', replyToMessageId: 'fixture-success' });
  } else if (kind === 'shutdown') {
    expect(flowSignal.aborted).toBe(true);
  } else await vi.waitFor(() => expect(doubles.cardUpdate).toHaveBeenCalledTimes(1));
  // Draining after completion also proves shutdown hooks do not leak or rerun.
  await drainShutdownHooks({ deadlineMs: 1000 });
  if (kind !== 'success') {
    expect(completed).not.toHaveBeenCalled();
    expect(resumed).not.toHaveBeenCalled();
    expect(doubles.save).not.toHaveBeenCalled();
  }
}

describe('OAuth continuation after the initiating tool scope closes', () => {
  it('resumes through the real synthetic queue and 10.6 maintenance reader', () => runAuthorization('success'));
  it('does not resume or save an expired authorization', () => runAuthorization('expired'));
  it('does not resume or save a different user’s token', () => runAuthorization('identity-mismatch'));
  it('cancels polling and suppresses continuation on shutdown', () => runAuthorization('shutdown'));
});
