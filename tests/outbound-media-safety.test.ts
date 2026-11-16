import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { lookup, resolve, fileCreate, messageCreate, releases } = vi.hoisted(() => ({
  lookup: vi.fn(),
  resolve: vi.fn(),
  fileCreate: vi.fn(),
  messageCreate: vi.fn(),
  releases: [] as ReturnType<typeof vi.fn>[],
}));

// Keep the host's real guard; replace only DNS and HTTP transports.
vi.mock('openclaw/plugin-sdk/ssrf-runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('openclaw/plugin-sdk/ssrf-runtime')>();
  return {
    ...actual,
    fetchWithSsrFGuard: async (params: Parameters<typeof actual.fetchWithSsrFGuard>[0]) => {
      const result = await actual.fetchWithSsrFGuard({ ...params, lookupFn: lookup });
      const release = vi.fn(result.release);
      releases.push(release);
      return { ...result, release };
    },
  };
});
vi.mock('node:dns/promises', () => ({ resolve }));
vi.mock('../src/core/lark-logger', () => ({
  larkLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('../src/core/lark-client', () => ({
  LarkClient: {
    fromCfg: () => ({ sdk: { im: { file: { create: fileCreate }, message: { create: messageCreate } } } }),
  },
}));

import { fetchRemoteImageBuffer, uploadAndSendMediaLark } from '../src/messaging/outbound/media';
import type { OpenClawConfig } from 'openclaw/plugin-sdk/core';

const cfg = {} as OpenClawConfig;
const fetchMock = vi.fn<typeof fetch>();
const deniedCfg = {
  tools: { web: { fetch: { ssrfPolicy: { blockedHostnames: ['blocked.example', '*.denied.example'] } } } },
} as OpenClawConfig;

beforeEach(() => {
  vi.resetAllMocks();
  releases.length = 0;
  lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
  resolve.mockResolvedValue(['93.184.216.34']);
  vi.stubGlobal('fetch', fetchMock);
  fileCreate.mockResolvedValue({ data: { file_key: 'file_fixture' } });
  messageCreate.mockResolvedValue({ data: { message_id: 'om_fixture' } });
});
afterEach(() => vi.unstubAllGlobals());

describe('remote media uses the host SSRF guard', () => {
  it('follows a public redirect and preserves bytes', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: '/final' } }));
    fetchMock.mockResolvedValueOnce(new Response(new Uint8Array([0, 1, 255])));
    expect(await fetchRemoteImageBuffer('https://public.example/start', cfg)).toEqual(Buffer.from([0, 1, 255]));
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      'https://public.example/start', 'https://public.example/final',
    ]);
    expect(releases[0]).toHaveBeenCalledOnce();
  });

  it.each(['http://127.0.0.1/private', 'http://[::ffff:127.0.0.1]/private', 'http://100.64.0.1/private'])(
    'blocks redirect destination %s before connecting', async (location) => {
      fetchMock.mockResolvedValue(new Response(null, { status: 302, headers: { location } }));
      await expect(fetchRemoteImageBuffer('https://public.example/start', cfg)).rejects.toThrow(/blocked|private|reserved/i);
      expect(fetchMock).toHaveBeenCalledOnce();
    },
  );

  it('rejects a public hostname resolving to a private address before connecting', async () => {
    lookup.mockResolvedValue([{ address: '10.0.0.1', family: 4 }]);
    fetchMock.mockResolvedValue(new Response('must not download'));
    await expect(fetchRemoteImageBuffer('https://public.example/file', cfg)).rejects.toThrow(/blocked|private|reserved/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('supports a fake-IP proxy address in 198.18.0.0/15', async () => {
    lookup.mockResolvedValue([{ address: '198.18.0.6', family: 4 }]);
    fetchMock.mockResolvedValue(new Response('proxy image bytes'));
    expect(await fetchRemoteImageBuffer('https://public.example/image.png', cfg)).toEqual(Buffer.from('proxy image bytes'));
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('still enforces the hostname deny list with a fake-IP proxy', async () => {
    lookup.mockResolvedValue([{ address: '198.18.0.6', family: 4 }]);
    fetchMock.mockResolvedValue(new Response('must not download'));
    await expect(fetchRemoteImageBuffer('https://blocked.example/image.png', deniedCfg)).rejects.toThrow(/blocked|denied/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails closed when DNS fails', async () => {
    lookup.mockRejectedValue(new Error('DNS unavailable'));
    resolve.mockRejectedValue(new Error('DNS unavailable'));
    fetchMock.mockResolvedValue(new Response('must not download'));
    await expect(fetchRemoteImageBuffer('https://public.example/file', cfg)).rejects.toThrow('DNS unavailable');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['blocked.example', 'sub.denied.example'])('honors the configured deny list for %s', async (hostname) => {
    fetchMock.mockResolvedValue(new Response('must not download'));
    await expect(uploadAndSendMediaLark({
      cfg: deniedCfg, to: 'oc_fixture', mediaUrl: `https://${hostname}/file.txt`,
    })).rejects.toThrow(/blocked|denied/i);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(fileCreate).not.toHaveBeenCalled();
  });

  it('also enforces the deny list for card image redirects', async () => {
    fetchMock.mockResolvedValue(new Response(null, {
      status: 302, headers: { location: 'https://blocked.example/image.png' },
    }));
    await expect(fetchRemoteImageBuffer('https://public.example/image.png', deniedCfg)).rejects.toThrow(/blocked|denied/i);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('releases the host download after an HTTP failure', async () => {
    fetchMock.mockResolvedValue(new Response('not found', { status: 404 }));
    await expect(fetchRemoteImageBuffer('https://public.example/missing', cfg)).rejects.toThrow('HTTP 404');
    expect(releases[0]).toHaveBeenCalledOnce();
  });

  it('keeps transient HTTP retries and releases each attempt', async () => {
    fetchMock.mockResolvedValueOnce(new Response('unavailable', { status: 503 }));
    fetchMock.mockResolvedValueOnce(new Response('recovered'));
    expect(await fetchRemoteImageBuffer('https://public.example/file', cfg)).toEqual(Buffer.from('recovered'));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(releases).toHaveLength(2);
    for (const release of releases) expect(release).toHaveBeenCalledOnce();
  });

  it('does not inherit web_fetch permission to access private networks', async () => {
    const privateCfg = { tools: { web: { fetch: { ssrfPolicy: { allowPrivateNetwork: true } } } } } as OpenClawConfig;
    fetchMock.mockResolvedValue(new Response('must not download'));
    await expect(fetchRemoteImageBuffer('http://127.0.0.1/private', privateCfg)).rejects.toThrow(/blocked|private|reserved/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('preserves local-root access and its default denial', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'lark-media-'));
    const mediaUrl = join(directory, 'report;final.txt');
    writeFileSync(mediaUrl, 'local fixture');
    try {
      await expect(uploadAndSendMediaLark({ cfg, to: 'oc_fixture', mediaUrl })).rejects.toThrow('Local file access denied');
      await uploadAndSendMediaLark({ cfg, to: 'oc_fixture', mediaUrl, mediaLocalRoots: [directory] });
      expect(fileCreate.mock.calls[0][0].data.file_name).toBe('report;final.txt');
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      rmSync(directory, { recursive: true });
    }
  });
});

function oggPacket(packet: string): Buffer {
  const page = Buffer.alloc(28);
  page.write('OggS');
  page[26] = 1;
  page[27] = 19;
  const identification = Buffer.alloc(19);
  identification.write(packet);
  return Buffer.concat([page, identification]);
}

describe('outbound audio routing checks the bytes', () => {
  it.each(['sample.ogg', 'sample.opus', 'sample.bin'])('keeps genuine Ogg Opus as voice: %s', async (fileName) => {
    await uploadAndSendMediaLark({ cfg, to: 'oc_fixture', fileName, mediaBuffer: oggPacket('OpusHead') });
    expect(fileCreate.mock.calls[0][0].data.file_type).toBe('opus');
    expect(messageCreate.mock.calls[0][0].data.msg_type).toBe('audio');
  });

  it.each([
    ['vorbis.ogg', oggPacket('\x01vorbis')],
    ['renamed.opus', Buffer.from('not Opus')],
    ['truncated.ogg', Buffer.from('OggS')],
  ])('sends non-Opus bytes as a regular file: %s', async (fileName, mediaBuffer) => {
    await uploadAndSendMediaLark({ cfg, to: 'oc_fixture', fileName, mediaBuffer });
    expect(fileCreate.mock.calls[0][0].data.file_type).toBe('stream');
    expect(fileCreate.mock.calls[0][0].data.file_name).toBe(fileName);
    expect(messageCreate.mock.calls[0][0].data.msg_type).toBe('file');
  });
});
