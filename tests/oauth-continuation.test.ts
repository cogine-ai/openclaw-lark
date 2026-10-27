import { beforeAll, beforeEach, afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { executeAuthorize, type ExecuteAuthorizeParams } from '../src/tools/oauth';
import { injectInboundHandler } from '../src/messaging/inbound/handler-registry';
import { _resetShutdownHooks, drainShutdownHooks } from '../src/core/shutdown-hooks';
import { enqueueFeishuChatTask } from '../src/channel/chat-queue';

const doubles = vi.hoisted(() => ({
  poll: vi.fn(),
  save: vi.fn(),
  cardUpdate: vi.fn(),
  createCard: vi.fn(),
}));
vi.mock('../src/core/lark-client', () => ({ LarkClient: { fromAccount: () => ({ sdk: {} }) } }));
vi.mock('../src/core/owner-policy', () => ({
  assertOwnerAccessStrict: vi.fn().mockResolvedValue(undefined),
  OwnerAccessDeniedError: class extends Error {},
}));
vi.mock('../src/core/app-scope-checker', () => ({
  getAppGrantedScopes: async () => ['calendar:calendar.event:read', 'calendar:calendar.free_busy:read'],
}));
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
  createCardEntity: doubles.createCard,
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
  doubles.createCard.mockImplementation(async () => `fixture-card-${doubles.createCard.mock.calls.length}`);
  doubles.save.mockResolvedValue(undefined);
});

afterEach(async () => {
  await drainShutdownHooks({ deadlineMs: 1000 });
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((release) => {
    resolve = release;
  });
  return { promise, resolve };
}

function successfulPoll(accessToken = 'fixture-access') {
  return {
    ok: true,
    token: {
      accessToken,
      refreshToken: 'fixture-refresh',
      expiresIn: 3600,
      refreshExpiresIn: 7200,
      scope: 'calendar:calendar.event:read',
    },
  };
}

function authorizationParams(messageId: string): ExecuteAuthorizeParams {
  return {
    account: { appId: 'fixture-app', appSecret: 'fixture-not-a-secret', accountId: 'default', brand: 'feishu' },
    senderOpenId: 'fixture-user',
    scope: 'calendar:calendar.event:read',
    forceAuth: true,
    cfg: {},
    ticket: {
      messageId,
      chatId: 'fixture-chat',
      accountId: 'default',
      senderOpenId: 'fixture-user',
      chatType: 'p2p',
      startTime: Date.now(),
    },
  } as ExecuteAuthorizeParams;
}

async function startInClosedToolScope(params: ExecuteAuthorizeParams) {
  const scope = new AsyncWorkScope();
  const result = await scope.track(() => executeAuthorize(params));
  expect(result.details).toMatchObject({ awaiting_authorization: true });
  await scope.drain();
  expect(scope.signal.aborted).toBe(true);
}

function installBoundaryHarness() {
  const polls: Array<{ signal: AbortSignal; release: (result: unknown) => void }> = [];
  doubles.poll.mockImplementation(({ signal }: { signal: AbortSignal }) => {
    const result = deferred<unknown>();
    polls.push({ signal, release: result.resolve });
    return new Promise((resolve, reject) => {
      result.promise.then(resolve, reject);
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
  });
  const identity = deferred<{ code: number; data: { open_id: string } }>();
  const validIdentity = { code: 0, data: { open_id: 'fixture-user' } };
  // Hold the first response body, even if fetch was aborted after headers arrived.
  // This makes cancellation during identity verification deterministic.
  const fetch = vi.fn().mockResolvedValue({ json: async () => validIdentity });
  fetch.mockResolvedValueOnce({ json: () => identity.promise });
  vi.stubGlobal('fetch', fetch);
  const completed = vi.fn();
  injectInboundHandler(async (params) => {
    const snapshot = await prepareMaintenance(new Map());
    try {
      snapshot.capture();
    } finally {
      snapshot.dispose();
    }
    completed(params);
  });
  return { polls, identity, validIdentity, fetch, completed };
}

async function flushContinuations() {
  for (let i = 0; i < 8; i++) await new Promise<void>((resolve) => setImmediate(resolve));
}

describe('OAuth cancellation and replacement after polling has finished', () => {
  it('suppresses token/card/continuation effects when shutdown interrupts identity verification', async () => {
    const h = installBoundaryHarness();
    await startInClosedToolScope(authorizationParams('fixture-shutdown-identity'));
    h.polls[0].release(successfulPoll());
    await vi.waitFor(() => expect(h.fetch).toHaveBeenCalledTimes(1));
    const shutdown = drainShutdownHooks({ deadlineMs: 1000 });
    expect(h.polls[0].signal.aborted).toBe(true);
    h.identity.resolve(h.validIdentity);
    await shutdown;
    expect(doubles.save).not.toHaveBeenCalled();
    expect(doubles.cardUpdate).not.toHaveBeenCalled();
    expect(h.completed).not.toHaveBeenCalled();
  });

  it.each(['same message', 'new message'])(
    'ignores the old identity result and retains the new flow for %s reauthorization',
    async (kind) => {
      const h = installBoundaryHarness();
      const original = authorizationParams('fixture-original');
      await startInClosedToolScope(original);
      h.polls[0].release(successfulPoll('fixture-obsolete-token'));
      await vi.waitFor(() => expect(h.fetch).toHaveBeenCalledTimes(1));
      const replacement = authorizationParams(kind === 'same message' ? 'fixture-original' : 'fixture-replacement');
      replacement.scope = 'calendar:calendar.free_busy:read';
      await startInClosedToolScope(replacement);
      expect(h.polls[0].signal.aborted).toBe(true);
      expect(h.polls).toHaveLength(2);
      expect(doubles.createCard).toHaveBeenCalledTimes(kind === 'same message' ? 1 : 2);
      const cardUpdatesBeforeOldResponse = doubles.cardUpdate.mock.calls.length;
      h.identity.resolve(h.validIdentity);
      await flushContinuations();
      expect(doubles.save).not.toHaveBeenCalled();
      expect(doubles.cardUpdate).toHaveBeenCalledTimes(cardUpdatesBeforeOldResponse);
      expect(h.completed).not.toHaveBeenCalled();
      // A third request must still find and cancel the second flow. An old
      // completion must not delete the newer flow's pending-map entry.
      await startInClosedToolScope(replacement);
      expect(h.polls[1].signal.aborted).toBe(true);
      expect(doubles.createCard).toHaveBeenCalledTimes(kind === 'same message' ? 1 : 2);
      h.polls[2].release(successfulPoll('fixture-current-token'));
      await vi.waitFor(() => expect(h.completed).toHaveBeenCalledTimes(1));
      expect(doubles.save).toHaveBeenCalledTimes(1);
      expect(doubles.save.mock.calls[0][0].accessToken).toBe('fixture-current-token');
      expect(h.completed.mock.calls[0][0]).toMatchObject({ replyToMessageId: replacement.ticket!.messageId });
    },
  );

  it('does not resume after shutdown while the authorization-complete callback is pending', async () => {
    const h = installBoundaryHarness();
    h.identity.resolve(h.validIdentity);
    const callback = deferred<void>();
    const onAuthComplete = vi.fn(() => callback.promise);
    await startInClosedToolScope({ ...authorizationParams('fixture-shutdown-callback'), onAuthComplete });
    h.polls[0].release(successfulPoll());
    await vi.waitFor(() => expect(onAuthComplete).toHaveBeenCalledTimes(1));
    const shutdown = drainShutdownHooks({ deadlineMs: 1000 });
    callback.resolve();
    await shutdown;
    expect(doubles.save).toHaveBeenCalledTimes(1);
    expect(h.completed).not.toHaveBeenCalled();
  });
});

describe('OAuth replacement while completion effects are already in flight', () => {
  it('serializes token writes so an older slow credential write cannot overwrite the newer token', async () => {
    const h = installBoundaryHarness();
    h.identity.resolve(h.validIdentity);
    const olderWrite = deferred<void>();
    let persistedToken: string | undefined;
    doubles.save.mockImplementation(async (token: { accessToken: string }) => {
      persistedToken = token.accessToken;
    });
    doubles.save.mockImplementationOnce(async (token: { accessToken: string }) => {
      await olderWrite.promise;
      persistedToken = token.accessToken;
    });
    try {
      await startInClosedToolScope(authorizationParams('fixture-slow-old-write'));
      h.polls[0].release(successfulPoll('fixture-obsolete-token'));
      await vi.waitFor(() => expect(doubles.save).toHaveBeenCalledTimes(1));
      await startInClosedToolScope(authorizationParams('fixture-current-write'));
      h.polls[1].release(successfulPoll('fixture-current-token'));
      await vi.waitFor(() => expect(h.fetch).toHaveBeenCalledTimes(2));
      await flushContinuations();
      expect(doubles.save).toHaveBeenCalledTimes(1);
      olderWrite.resolve();
      await vi.waitFor(() => expect(h.completed).toHaveBeenCalledTimes(1));
      expect(doubles.save).toHaveBeenCalledTimes(2);
      expect(persistedToken).toBe('fixture-current-token');
      expect(h.completed.mock.calls[0][0]).toMatchObject({ replyToMessageId: 'fixture-current-write' });
    } finally {
      olderWrite.resolve();
      await flushContinuations();
    }
  });

  it('does not resume after shutdown while the success card update is pending', async () => {
    const h = installBoundaryHarness();
    h.identity.resolve(h.validIdentity);
    const cardUpdate = deferred<void>();
    doubles.cardUpdate.mockImplementationOnce(() => cardUpdate.promise);
    await startInClosedToolScope(authorizationParams('fixture-shutdown-card'));
    h.polls[0].release(successfulPoll());
    await vi.waitFor(() => expect(doubles.cardUpdate).toHaveBeenCalledTimes(1));
    const shutdown = drainShutdownHooks({ deadlineMs: 1000 });
    cardUpdate.resolve();
    await shutdown;
    expect(doubles.save).toHaveBeenCalledTimes(1);
    expect(h.completed).not.toHaveBeenCalled();
  });

  it('cancels an old continuation callback even after its pending card entry was released', async () => {
    const h = installBoundaryHarness();
    h.identity.resolve(h.validIdentity);
    const callback = deferred<void>();
    const onAuthComplete = vi.fn(() => callback.promise);
    try {
      await startInClosedToolScope({ ...authorizationParams('fixture-old-callback'), onAuthComplete });
      h.polls[0].release(successfulPoll('fixture-obsolete-token'));
      await vi.waitFor(() => expect(onAuthComplete).toHaveBeenCalledTimes(1));
      await startInClosedToolScope(authorizationParams('fixture-current-callback'));
      h.polls[1].release(successfulPoll('fixture-current-token'));
      await vi.waitFor(() => expect(h.completed).toHaveBeenCalledTimes(1));
      callback.resolve();
      await flushContinuations();
      expect(h.polls[0].signal.aborted).toBe(true);
      expect(h.completed).toHaveBeenCalledTimes(1);
      expect(h.completed.mock.calls[0][0]).toMatchObject({ replyToMessageId: 'fixture-current-callback' });
    } finally {
      callback.resolve();
      await flushContinuations();
    }
  });

  it('uses a higher card sequence for same-message reauthorization during a success-card request', async () => {
    const h = installBoundaryHarness();
    h.identity.resolve(h.validIdentity);
    const firstCardUpdate = deferred<void>();
    doubles.cardUpdate.mockImplementationOnce(() => firstCardUpdate.promise);
    try {
      const params = authorizationParams('fixture-same-card');
      await startInClosedToolScope(params);
      h.polls[0].release(successfulPoll('fixture-obsolete-token'));
      await vi.waitFor(() => expect(doubles.cardUpdate).toHaveBeenCalledTimes(1));
      await startInClosedToolScope(params);
      expect(doubles.createCard).toHaveBeenCalledTimes(1);
      expect(doubles.cardUpdate.mock.calls[0][0].sequence).toBe(2);
      expect(doubles.cardUpdate.mock.calls[1][0].sequence).toBe(3);
      firstCardUpdate.resolve();
      await flushContinuations();
      expect(h.completed).not.toHaveBeenCalled();
      h.polls[1].release(successfulPoll('fixture-current-token'));
      await vi.waitFor(() => expect(h.completed).toHaveBeenCalledTimes(1));
      expect(doubles.cardUpdate.mock.calls[2][0].sequence).toBe(4);
    } finally {
      firstCardUpdate.resolve();
      await flushContinuations();
    }
  });
});

describe('OAuth continuation cancelled while waiting in the real chat queue', () => {
  it.each(['shutdown', 'replacement'])('does not start an obsolete queued continuation after %s', async (kind) => {
    const h = installBoundaryHarness();
    h.identity.resolve(h.validIdentity);
    const occupied = deferred<void>();
    const blocker = enqueueFeishuChatTask({
      accountId: 'default',
      chatId: 'fixture-chat',
      task: () => occupied.promise,
    });
    let shutdown: Promise<void> | undefined;
    try {
      await startInClosedToolScope(authorizationParams('fixture-queued-old'));
      h.polls[0].release(successfulPoll('fixture-obsolete-token'));
      await vi.waitFor(() => expect(doubles.cardUpdate).toHaveBeenCalledTimes(1));
      await flushContinuations();
      expect(h.completed).not.toHaveBeenCalled();
      if (kind === 'shutdown') {
        shutdown = drainShutdownHooks({ deadlineMs: 1000 });
      } else {
        await startInClosedToolScope(authorizationParams('fixture-queued-current'));
        h.polls[1].release(successfulPoll('fixture-current-token'));
        await vi.waitFor(() => expect(doubles.cardUpdate).toHaveBeenCalledTimes(2));
        await flushContinuations();
      }
      expect(h.polls[0].signal.aborted).toBe(true);
      const fence = enqueueFeishuChatTask({ accountId: 'default', chatId: 'fixture-chat', task: async () => {} });
      occupied.resolve();
      await blocker.promise;
      await fence.promise;
      await shutdown;
      expect(h.completed).toHaveBeenCalledTimes(kind === 'shutdown' ? 0 : 1);
      if (kind === 'replacement')
        expect(h.completed.mock.calls[0][0]).toMatchObject({ replyToMessageId: 'fixture-queued-current' });
    } finally {
      occupied.resolve();
      await blocker.promise;
      await shutdown;
      await flushContinuations();
    }
  });
});
