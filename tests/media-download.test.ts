import { Readable } from 'node:stream';
import { expect, it, vi } from 'vitest';
import { downloadMessageResourceFeishu } from '../src/messaging/outbound/media';

const { getMessageResource } = vi.hoisted(() => ({ getMessageResource: vi.fn() }));

vi.mock('../src/core/lark-client', () => ({
  LarkClient: {
    fromCfg: () => ({ sdk: { im: { messageResource: { get: getMessageResource } } } }),
  },
}));

it.each([
  ['attachment; filename="report;final.txt"', 'report;final.txt'],
  [`attachment; filename="report.txt"; filename*=UTF-8''%E6%8A%A5%E5%91%8A.txt`, '报告.txt'],
  ['attachment; filename="report%20final.txt"', 'report final.txt'],
])('downloads the attachment with its filename from %s', async (disposition, fileName) => {
  const buffer = Buffer.from('attachment contents');
  getMessageResource.mockResolvedValueOnce({
    headers: { 'content-disposition': disposition, 'content-type': 'text/plain' },
    getReadableStream: () => Readable.from([buffer]),
  });

  const result = await downloadMessageResourceFeishu({
    cfg: {},
    messageId: 'om_message',
    fileKey: 'file_attachment',
    type: 'file',
  });

  expect(result).toEqual({ buffer, contentType: 'text/plain', fileName });
});
