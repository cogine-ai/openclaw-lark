import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createReplyDispatcherWithTyping, settleReplyDispatcher } from 'openclaw/plugin-sdk/reply-runtime';

const { createFeishuReplyDispatcherMock, dispatchReplyFromConfigMock } = vi.hoisted(() => ({
  createFeishuReplyDispatcherMock: vi.fn(),
  dispatchReplyFromConfigMock: vi.fn(),
}));

vi.mock('../src/card/reply-dispatcher', () => ({
  createFeishuReplyDispatcher: createFeishuReplyDispatcherMock,
}));
vi.mock('../src/card/tool-use-trace-store', () => ({ startToolUseTraceRun: vi.fn() }));
vi.mock('../src/messaging/inbound/dispatch-builders', () => ({
  buildInboundPayload: (_dc: unknown, payload: unknown) => payload,
}));
vi.mock('../src/messaging/outbound/send', () => ({ sendMessageFeishu: vi.fn() }));
vi.mock('../src/core/lark-logger', () => ({
  larkLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('../src/core/lark-ticket', () => ({ ticketElapsed: () => 1 }));

import { dispatchPermissionNotification } from '../src/messaging/inbound/dispatch-commands';

type HostDispatcher = ReturnType<typeof createReplyDispatcherWithTyping>['dispatcher'];
let withReplyDispatcher: <T>(params: { dispatcher: HostDispatcher; run: () => Promise<T> }) => Promise<T>;
const ownedDispatchers: HostDispatcher[] = [];

beforeAll(async () => {
  // Test only: pin the same real Core10.6 lifecycle used by the runtime field.
  // This module has no Gateway/config/credential initialization.
  const require = createRequire(import.meta.url);
  const dist = dirname(dirname(require.resolve('openclaw/plugin-sdk/core')));
  const core = await import(pathToFileURL(join(dist, 'dispatch-dispatcher-BKxE1A-W.mjs')).href);
  withReplyDispatcher = core.r;
});

beforeEach(() => {
  vi.clearAllMocks();
  dispatchReplyFromConfigMock.mockResolvedValue({ queuedFinal: false, counts: { final: 0 } });
});

afterEach(async () => {
  vi.restoreAllMocks();
  for (const dispatcher of ownedDispatchers.splice(0)) {
    await settleReplyDispatcher({ dispatcher });
  }
});

function pendingReplyDispatches(): number {
  const registry = (globalThis as Record<symbol, Set<{ pending: () => number }> | undefined>)[
    Symbol.for('openclaw.activeReplyDispatchers')
  ];
  return [...(registry ?? [])].reduce((total, entry) => total + entry.pending(), 0);
}

function useHostDispatcher(options: {
  deliver?: () => Promise<void>;
  onFullyComplete?: () => void;
  onIdle?: () => void;
} = {}) {
  const host = createReplyDispatcherWithTyping({
    deliver: options.deliver ?? (async () => {}),
    onIdle: options.onIdle,
  });
  ownedDispatchers.push(host.dispatcher);
  const markFullyComplete = vi.fn(options.onFullyComplete ?? (() => {}));
  createFeishuReplyDispatcherMock.mockReturnValueOnce({ ...host, markFullyComplete });
  return { ...host, markFullyComplete };
}

function dispatchOnce() {
  const dc = {
    ctx: { messageId: 'om_permission', chatId: 'oc_fixture', chatType: 'p2p' },
    envelopeFrom: 'fixture-user',
    envelopeOptions: {},
    route: { agentId: 'default', sessionKey: 'fixture-session' },
    threadSessionKey: undefined,
    accountScopedCfg: {},
    account: { accountId: 'fixture' },
    isThread: false,
    log: vi.fn(),
    core: {
      channel: {
        reply: {
          formatAgentEnvelope: ({ body }: { body: string }) => body,
          dispatchReplyFromConfig: dispatchReplyFromConfigMock,
          withReplyDispatcher,
        },
      },
    },
  };
  return dispatchPermissionNotification(dc as never, { grantUrl: 'https://example.invalid/grant' } as never);
}

describe('permission notification dispatcher settlement', () => {
  it('releases the host pending slot after delivering the notification', async () => {
    const before = pendingReplyDispatches();
    const { dispatcher } = useHostDispatcher();
    expect(pendingReplyDispatches()).toBe(before + 1);
    dispatchReplyFromConfigMock.mockImplementationOnce(async () => {
      dispatcher.sendFinalReply({ text: 'Permission required' });
      return { queuedFinal: true, counts: { final: 1 } };
    });

    await dispatchOnce();

    expect(pendingReplyDispatches()).toBe(before);
  });

  it('releases the host pending slot when notification dispatch throws', async () => {
    const before = pendingReplyDispatches();
    const { markFullyComplete } = useHostDispatcher();
    const failure = new Error('notification model unavailable');
    dispatchReplyFromConfigMock.mockRejectedValueOnce(failure);

    await expect(dispatchOnce()).rejects.toBe(failure);

    expect(pendingReplyDispatches()).toBe(before);
    expect(markFullyComplete).not.toHaveBeenCalled();
  });

  it('waits for the queued notification before final card completion', async () => {
    let release!: () => void;
    let started!: () => void;
    const deliveryGate = new Promise<void>((resolve) => { release = resolve; });
    const deliveryStarted = new Promise<void>((resolve) => { started = resolve; });
    const events: string[] = [];
    let complete = false;
    const { dispatcher, markFullyComplete } = useHostDispatcher({
      deliver: async () => {
        started();
        await deliveryGate;
        events.push('delivered');
      },
      onFullyComplete: () => { complete = true; events.push('complete'); },
      onIdle: () => { if (complete) events.push('final-idle'); },
    });
    dispatchReplyFromConfigMock.mockImplementationOnce(async () => {
      dispatcher.sendFinalReply({ text: 'Permission grant URL' });
      return { queuedFinal: true, counts: { final: 1 } };
    });
    const pending = dispatchOnce();
    try {
      await deliveryStarted;
      expect(markFullyComplete).not.toHaveBeenCalled();
    } finally {
      release();
    }
    await pending;

    expect(events).toEqual(['delivered', 'complete', 'final-idle']);
  });

  it('preserves the dispatch error when draining also fails', async () => {
    const before = pendingReplyDispatches();
    const { dispatcher } = useHostDispatcher();
    const failure = new Error('original notification error');
    dispatchReplyFromConfigMock.mockRejectedValueOnce(failure);
    vi.spyOn(dispatcher, 'waitForIdle').mockRejectedValueOnce(new Error('drain failed'));

    await expect(dispatchOnce()).rejects.toBe(failure);

    expect(pendingReplyDispatches()).toBe(before);
  });

  it('propagates a drain failure after successful notification dispatch', async () => {
    const before = pendingReplyDispatches();
    const { dispatcher, markFullyComplete } = useHostDispatcher();
    const failure = new Error('notification drain failed');
    vi.spyOn(dispatcher, 'waitForIdle').mockRejectedValueOnce(failure);

    await expect(dispatchOnce()).rejects.toBe(failure);

    expect(pendingReplyDispatches()).toBe(before);
    expect(markFullyComplete).not.toHaveBeenCalled();
  });
});
