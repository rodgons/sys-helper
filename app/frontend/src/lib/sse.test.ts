import { describe, expect, it } from 'vitest';
import { readEvents } from './sse';

function streamOf(...chunks: string[]) {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
}

async function all(stream: ReadableStream<Uint8Array>) {
  const out = [];
  for await (const ev of readEvents(stream)) out.push(ev);
  return out;
}

describe('readEvents', () => {
  it('parses events split across chunks at arbitrary points', async () => {
    const events = await all(
      streamOf(
        'event: delta\nda',
        'ta: {"text":"Hel"}\n\nevent: del',
        'ta\ndata: {"text":"lo"}\n\n',
        'event: done\ndata: {"body":"Hello"}\n\n',
      ),
    );

    expect(events).toEqual([
      { event: 'delta', data: { text: 'Hel' } },
      { event: 'delta', data: { text: 'lo' } },
      { event: 'done', data: { body: 'Hello' } },
    ]);
  });

  it('handles CRLF line endings and ignores comments', async () => {
    const events = await all(streamOf(': ping\r\n\r\nevent: delta\r\ndata: {"text":"x"}\r\n\r\n'));

    expect(events).toEqual([{ event: 'delta', data: { text: 'x' } }]);
  });
});
