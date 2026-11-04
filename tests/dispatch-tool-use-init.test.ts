import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createReplyDispatcherWithTyping, settleReplyDispatcher } from 'openclaw/plugin-sdk/reply-runtime';

const {
  buildDispatchContextMock,
  buildMessageBodyMock,
  buildEnvelopeWithHistoryMock,
  buildBodyForAgentMock,
  buildInboundPayloadMock,
  resolveToolUseDisplayConfigMock,
  startToolUseTraceRunMock,
  clearToolUseTraceRunMock,
  createFeishuReplyDispatcherMock,
  dispatchReplyFromConfigMock,
} = vi.hoisted(() => ({
  buildDispatchContextMock: vi.fn(),
  buildMessageBodyMock: vi.fn(() => 'message-body'),
  buildEnvelopeWithHistoryMock: vi.fn(() => ({ combinedBody: 'combined-body', historyKey: undefined })),
  buildBodyForAgentMock: vi.fn(() => 'body-for-agent'),
  buildInboundPayloadMock: vi.fn(() => ({ kind: 'ctx-payload' })),
  resolveToolUseDisplayConfigMock: vi.fn(),
  startToolUseTraceRunMock: vi.fn(),
  clearToolUseTraceRunMock: vi.fn(),
  createFeishuReplyDispatcherMock: vi.fn(),
  dispatchReplyFromConfigMock: vi.fn(),
}));

vi.mock('../src/messaging/inbound/dispatch-context', () => ({
  buildDispatchContext: buildDispatchContextMock,
  resolveThreadSessionKey: vi.fn(),
}));

vi.mock('../src/messaging/inbound/dispatch-builders', () => ({
  buildMessageBody: buildMessageBodyMock,
  buildEnvelopeWithHistory: buildEnvelopeWithHistoryMock,
  buildBodyForAgent: buildBodyForAgentMock,
  buildInboundPayload: buildInboundPayloadMock,
  buildFeishuIdentityFields: vi.fn(() => ({})),
  buildFeishuGroupSystemPrompt: vi.fn(() => undefined),
}));

vi.mock('../src/card/tool-use-config', () => ({
  resolveToolUseDisplayConfig: resolveToolUseDisplayConfigMock,
}));

vi.mock('../src/card/tool-use-trace-store', () => ({
  startToolUseTraceRun: startToolUseTraceRunMock,
  clearToolUseTraceRun: clearToolUseTraceRunMock,
}));

vi.mock('../src/card/reply-dispatcher', () => ({
  createFeishuReplyDispatcher: createFeishuReplyDispatcherMock,
}));

vi.mock('../src/channel/chat-queue', () => ({
  buildQueueKey: vi.fn(() => 'queue-key'),
  registerActiveDispatcher: vi.fn(),
  threadScopedKey: vi.fn(() => 'thread-key'),
  unregisterActiveDispatcher: vi.fn(),
}));

vi.mock('../src/messaging/inbound/dispatch-commands', () => ({
  dispatchPermissionNotification: vi.fn(),
  dispatchSystemCommand: vi.fn(),
}));

vi.mock('../src/core/chat-info-cache', () => ({
  isThreadCapableGroup: vi.fn(),
  injectLarkClient: vi.fn(),
}));

vi.mock('../src/core/targets', () => ({
  encodeFeishuRouteTarget: vi.fn(),
}));

vi.mock('../src/messaging/outbound/send', () => ({
  buildI18nMarkdownCard: vi.fn(),
  sendCardFeishu: vi.fn(),
  sendMessageFeishu: vi.fn(),
}));

vi.mock('../src/commands/doctor', () => ({
  runFeishuDoctorI18n: vi.fn(),
}));

vi.mock('../src/commands/auth', () => ({
  runFeishuAuthI18n: vi.fn(),
}));

vi.mock('../src/commands/index', () => ({
  getFeishuHelpI18n: vi.fn(),
  runFeishuStartI18n: vi.fn(),
}));

vi.mock('../src/messaging/inbound/mention', () => ({
  mentionedBot: vi.fn(() => false),
}));

vi.mock('../src/messaging/inbound/gate', () => ({
  resolveRespondToMentionAll: vi.fn(() => false),
}));

vi.mock('../src/channel/abort-detect', () => ({
  isLikelyAbortText: vi.fn(() => false),
  isConversationStopIntent: vi.fn(() => false),
}));

vi.mock('../src/core/lark-logger', () => ({
  larkLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('../src/core/lark-ticket', () => ({
  ticketElapsed: () => 1,
}));

import { dispatchToAgent } from '../src/messaging/inbound/dispatch';
import { currentBotPeerContext } from '../src/messaging/outbound/bot-peer-context';

type HostDispatcher = ReturnType<typeof createReplyDispatcherWithTyping>['dispatcher'];
let withReplyDispatcher: <T>(params: { dispatcher: HostDispatcher; run: () => Promise<T> }) => Promise<T>;
const ownedDispatchers: HostDispatcher[] = [];

beforeAll(async () => {
  // Test only: use the locked 10.6 host lifecycle implementation without a Gateway.
  // Production calls the public runtime.channel.reply.withReplyDispatcher API.
  const require = createRequire(import.meta.url);
  const dist = dirname(dirname(require.resolve('openclaw/plugin-sdk/core')));
  const core = await import(pathToFileURL(join(dist, 'dispatch-dispatcher-BKxE1A-W.mjs')).href);
  withReplyDispatcher = core.r;
});

afterEach(async () => {
  vi.restoreAllMocks();
  for (const dispatcher of ownedDispatchers.splice(0)) {
    await settleReplyDispatcher({ dispatcher });
  }
});

function createDispatchContext() {
  return {
    ctx: {
      chatId: 'chat-1',
      messageId: 'om_msg_1',
      senderId: 'ou_sender_1',
      senderName: 'Alice',
      content: 'hello',
      chatType: 'p2p',
      mentions: [],
      resources: [],
      contentType: 'text',
      mentionAll: false,
      rawMessage: {},
      rawSender: {},
    },
    accountScopedCfg: {},
    account: {
      accountId: 'default',
      enabled: true,
      brand: 'feishu',
      config: {},
    },
    runtime: {
      log: vi.fn(),
      error: vi.fn(),
      exit: vi.fn(),
    },
    log: vi.fn(),
    error: vi.fn(),
    core: {
      channel: {
        commands: {
          isControlCommandMessage: vi.fn(() => false),
        },
        reply: {
          dispatchReplyFromConfig: dispatchReplyFromConfigMock,
          withReplyDispatcher,
        },
      },
    },
    isGroup: false,
    isThread: false,
    feishuFrom: 'feishu:ou_sender_1',
    feishuTo: 'user:ou_sender_1',
    envelopeFrom: 'ou_sender_1',
    envelopeOptions: {},
    route: {
      sessionKey: 'session-1',
      agentId: 'default',
      channel: 'feishu',
      accountId: 'default',
    },
    threadSessionKey: undefined,
    commandAuthorized: true,
  };
}

function createDispatcher() {
  return {
    markComplete: vi.fn(),
    waitForIdle: vi.fn().mockResolvedValue(undefined),
  };
}

beforeEach(() => {
  vi.clearAllMocks();

  buildDispatchContextMock.mockReturnValue(createDispatchContext());
  resolveToolUseDisplayConfigMock.mockReturnValue({ showToolUse: true, showToolResultDetail: false, showFullPaths: false });
  createFeishuReplyDispatcherMock.mockReturnValue({
    dispatcher: createDispatcher(),
    replyOptions: {},
    markDispatchIdle: vi.fn(),
    markFullyComplete: vi.fn(),
    abortCard: vi.fn(),
  });
  dispatchReplyFromConfigMock.mockResolvedValue({
    queuedFinal: false,
    counts: { final: 0 },
  });
});

describe('dispatchToAgent tool_use trace initialization', () => {
  it('starts the trace run exactly once when tool_use is enabled', async () => {
    const dc = createDispatchContext();

    await dispatchToAgent({
      ctx: dc.ctx as never,
      mediaPayload: {},
      account: dc.account as never,
      accountScopedCfg: {} as never,
      historyLimit: 0,
    });

    expect(startToolUseTraceRunMock).toHaveBeenCalledTimes(1);
    expect(startToolUseTraceRunMock).toHaveBeenCalledWith('session-1');
    expect(clearToolUseTraceRunMock).not.toHaveBeenCalled();
  });

  it('clears the trace run without initializing it when tool_use is disabled', async () => {
    const dc = createDispatchContext();

    resolveToolUseDisplayConfigMock.mockReturnValueOnce({
      showToolUse: false,
      showToolResultDetail: false,
      showFullPaths: false,
    });

    await dispatchToAgent({
      ctx: dc.ctx as never,
      mediaPayload: {},
      account: dc.account as never,
      accountScopedCfg: {} as never,
      historyLimit: 0,
    });

    expect(startToolUseTraceRunMock).not.toHaveBeenCalled();
    expect(clearToolUseTraceRunMock).toHaveBeenCalledTimes(1);
    expect(clearToolUseTraceRunMock).toHaveBeenCalledWith('session-1');
  });

  it('forwards extra inbound fields into the finalized payload', async () => {
    const dc = createDispatchContext();

    await dispatchToAgent({
      ctx: dc.ctx as never,
      mediaPayload: {},
      extraInboundFields: {
        SyntheticEventType: 'vc.bot.meeting_invited_v1',
        VcMeetingNo: '123456789',
      },
      account: dc.account as never,
      accountScopedCfg: {} as never,
      historyLimit: 0,
    });

    expect(buildInboundPayloadMock).toHaveBeenCalledTimes(1);
    const buildInboundPayloadArgs =
      buildInboundPayloadMock.mock.calls[0] as unknown as [unknown, { extraFields?: unknown }];
    expect(buildInboundPayloadArgs[1]).toMatchObject({
      extraFields: {
        SyntheticEventType: 'vc.bot.meeting_invited_v1',
        VcMeetingNo: '123456789',
      },
    });
  });

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
  createFeishuReplyDispatcherMock.mockReturnValueOnce({
    ...host,
    markFullyComplete,
    abortCard: vi.fn(),
  });
  return { ...host, markFullyComplete };
}

function dispatchOnce(dc = createDispatchContext()) {
  buildDispatchContextMock.mockReturnValueOnce(dc);
  return dispatchToAgent({
    ctx: dc.ctx as never,
    mediaPayload: {},
    account: dc.account as never,
    accountScopedCfg: {} as never,
    historyLimit: 0,
  });
}

describe('normal reply dispatcher settlement', () => {
  it('releases the host pending slot after a delivered final reply', async () => {
    const before = pendingReplyDispatches();
    const { dispatcher } = useHostDispatcher();
    expect(pendingReplyDispatches()).toBe(before + 1);
    dispatchReplyFromConfigMock.mockImplementationOnce(async () => {
      dispatcher.sendFinalReply({ text: 'done' });
      return { queuedFinal: true, counts: { final: 1 } };
    });

    await dispatchOnce();

    expect(pendingReplyDispatches()).toBe(before);
  });

  it('releases the host pending slot when the model run throws', async () => {
    const before = pendingReplyDispatches();
    const { markFullyComplete } = useHostDispatcher();
    const failure = new Error('model unavailable');
    dispatchReplyFromConfigMock.mockRejectedValueOnce(failure);

    await expect(dispatchOnce()).rejects.toBe(failure);

    expect(pendingReplyDispatches()).toBe(before);
    expect(markFullyComplete).not.toHaveBeenCalled();
  });

  it('waits for queued delivery before finalizing the card and notifying idle', async () => {
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
      dispatcher.sendFinalReply({ text: 'final paragraph' });
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

  it('retains bot-peer context while draining delayed deliveries', async () => {
    const base = createDispatchContext();
    const dc = {
      ...base,
      isGroup: true,
      ctx: { ...base.ctx, chatType: 'group', senderIsBot: true },
    };
    const { dispatcher } = useHostDispatcher();
    const waitForIdle = dispatcher.waitForIdle.bind(dispatcher);
    const contexts: unknown[] = [];
    vi.spyOn(dispatcher, 'waitForIdle').mockImplementation(async () => {
      await Promise.resolve();
      contexts.push(currentBotPeerContext());
      return waitForIdle();
    });
    dispatchReplyFromConfigMock.mockImplementationOnce(async () => {
      expect(currentBotPeerContext()).toMatchObject({ peerOpenId: 'ou_sender_1' });
      dispatcher.sendFinalReply({ text: 'peer reply' });
      return { queuedFinal: true, counts: { final: 1 } };
    });

    await dispatchOnce(dc);

    expect(contexts).toEqual([expect.objectContaining({ peerOpenId: 'ou_sender_1' })]);
    expect(currentBotPeerContext()).toBeUndefined();
  });

  it('preserves the original dispatch error if draining also fails', async () => {
    const before = pendingReplyDispatches();
    const { dispatcher } = useHostDispatcher();
    const failure = new Error('original model error');
    dispatchReplyFromConfigMock.mockRejectedValueOnce(failure);
    vi.spyOn(dispatcher, 'waitForIdle').mockRejectedValueOnce(new Error('drain failed'));

    await expect(dispatchOnce()).rejects.toBe(failure);

    expect(pendingReplyDispatches()).toBe(before);
  });

  it('propagates a drain failure when the model run succeeded', async () => {
    const before = pendingReplyDispatches();
    const { dispatcher, markFullyComplete } = useHostDispatcher();
    const failure = new Error('drain failed');
    vi.spyOn(dispatcher, 'waitForIdle').mockRejectedValueOnce(failure);

    await expect(dispatchOnce()).rejects.toBe(failure);

    expect(pendingReplyDispatches()).toBe(before);
    expect(markFullyComplete).not.toHaveBeenCalled();
  });
});
