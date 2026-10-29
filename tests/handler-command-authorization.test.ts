import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isControlCommandMessage, shouldComputeCommandAuthorized } from 'openclaw/plugin-sdk/command-detection';
import type { ResolveSenderCommandAuthorizationCompatParams } from '../src/messaging/inbound/command-auth-compat';

const doubles = vi.hoisted(() => ({
  parse: vi.fn(),
  media: vi.fn(),
  gate: vi.fn(),
  dispatch: vi.fn(),
  send: vi.fn(),
}));

vi.mock('../src/messaging/inbound/parse', () => ({ parseMessageEvent: doubles.parse }));
vi.mock('../src/messaging/inbound/enrich', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/messaging/inbound/enrich')>();
  return {
    ...actual,
    resolveSenderInfo: async ({ ctx }: { ctx: unknown }) => ({ ctx }),
    prefetchUserNames: vi.fn(),
    resolveMedia: doubles.media,
    resolveQuotedContent: vi.fn(),
  };
});
vi.mock('../src/messaging/outbound/fetch', () => ({ getMessageFeishu: vi.fn() }));
vi.mock('../src/messaging/inbound/user-name-cache', () => ({
  batchResolveUserNames: vi.fn(),
  getUserNameCache: vi.fn(),
  resolveBotName: vi.fn(),
  resolveUserName: vi.fn(),
}));
vi.mock('../src/messaging/inbound/media-resolver', () => ({
  buildFeishuMediaPayload: vi.fn(),
  downloadResources: vi.fn(),
}));
vi.mock('../src/messaging/inbound/gate', () => ({
  checkMessageGate: doubles.gate,
  readFeishuAllowFromStore: vi.fn().mockResolvedValue([]),
}));
vi.mock('../src/messaging/inbound/dispatch', () => ({ dispatchToAgent: doubles.dispatch }));
vi.mock('../src/messaging/outbound/send', () => ({ sendMessageFeishu: doubles.send }));
vi.mock('../src/messaging/inbound/handler-registry', () => ({ injectInboundHandler: vi.fn() }));
vi.mock('../src/messaging/inbound/policy', () => ({
  resolveFeishuGroupConfig: vi.fn(),
  splitLegacyGroupAllowFrom: vi.fn(() => ({ senderAllowFrom: [] })),
}));
vi.mock('../src/core/accounts', () => ({
  getLarkAccount: vi.fn(() => ({ accountId: 'fixture', config: {}, configured: true, enabled: true })),
}));
vi.mock('../src/core/lark-client', async () => {
  const commands = await import('openclaw/plugin-sdk/command-detection');
  return { LarkClient: { runtime: { channel: { commands } } } };
});
vi.mock('../src/core/lark-logger', () => ({
  larkLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('../src/core/lark-ticket', () => ({ ticketElapsed: () => 0 }));
vi.mock('../src/channel/chat-queue', () => ({
  threadScopedKey: (chatId: string) => chatId,
}));
vi.mock('../src/messaging/inbound/command-auth-compat', () => ({
  // The SDK's real coarse probe runs, but this fixture sender is denied command
  // authority. Core command execution is downstream of this handler boundary.
  resolveSenderCommandAuthorizationCompat: vi.fn(async (params: ResolveSenderCommandAuthorizationCompatParams) => ({
    commandAuthorized: params.shouldComputeCommandAuthorized(params.rawBody, params.cfg) ? false : undefined,
  })),
}));

import { handleFeishuMessage } from '../src/messaging/inbound/handler';

const imagePath = '/Users/fixture/.openclaw/media/photo.jpg';
const cfg = { channels: { feishu: {} } } as never;
const event = {
  sender: { sender_id: { open_id: 'ou_fixture' } },
  message: { message_id: 'om_fixture', chat_id: 'oc_fixture' },
} as never;

function context(content: string, image = false) {
  return {
    chatId: 'oc_fixture',
    messageId: 'om_fixture',
    senderId: 'ou_fixture',
    chatType: 'group',
    content,
    contentType: image ? 'post' : 'text',
    resources: image ? [{ type: 'image', fileKey: 'img_fixture' }] : [],
    mentions: [],
    mentionAll: false,
  };
}

describe('inbound command authority does not deny ordinary media messages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    doubles.gate.mockResolvedValue({ allowed: true });
    doubles.media.mockResolvedValue({ mediaList: [], payload: {} });
  });

  it.each(['![image](img_fixture)\n这个需求不错的', '![image](img_fixture)'])(
    'dispatches image-first content after real media substitution: %s',
    async (content) => {
      doubles.parse.mockResolvedValue(context(content, true));
      doubles.media.mockResolvedValue({
        mediaList: [{ fileKey: 'img_fixture', path: imagePath, resourceType: 'image' }],
        payload: { MediaPath: imagePath },
      });

      await handleFeishuMessage({ cfg, event });

      const rendered = content.replace('![image](img_fixture)', imagePath);
      expect(shouldComputeCommandAuthorized(rendered, cfg)).toBe(true);
      expect(isControlCommandMessage(rendered, cfg)).toBe(false);
      expect(doubles.dispatch).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
        ctx: expect.objectContaining({ content: rendered }),
        mediaPayload: { MediaPath: imagePath },
        commandAuthorized: false,
      }));
      expect(doubles.send).not.toHaveBeenCalled();
    },
  );

  it('dispatches an ordinary absolute path without adding command authority', async () => {
    doubles.parse.mockResolvedValue(context(`${imagePath}\n请看看这张图`));

    await handleFeishuMessage({ cfg, event });

    expect(doubles.dispatch).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      commandAuthorized: false,
    }));
    expect(doubles.send).not.toHaveBeenCalled();
  });

  it('passes denied command authority to the core instead of authorizing a real command', async () => {
    doubles.parse.mockResolvedValue(context('/status'));

    await handleFeishuMessage({ cfg, event });

    expect(isControlCommandMessage('/status', cfg)).toBe(true);
    expect(doubles.dispatch).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      ctx: expect.objectContaining({ content: '/status' }),
      commandAuthorized: false,
    }));
  });

  it('continues to enforce the chat admission gate before downloading media', async () => {
    doubles.parse.mockResolvedValue(context('![image](img_fixture)', true));
    doubles.gate.mockResolvedValue({ allowed: false, reason: 'sender_not_allowed' });

    await handleFeishuMessage({ cfg, event });

    expect(doubles.media).not.toHaveBeenCalled();
    expect(doubles.dispatch).not.toHaveBeenCalled();
  });
});
