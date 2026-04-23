import { describe, expect, it, vi } from "vitest";
import { NdJsonStreamReader } from "../../src/browser/lib/ndjson-stream-reader.js";

function createStreamFromTextParts(parts: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const part of parts) {
        controller.enqueue(encoder.encode(part));
      }
      controller.close();
    }
  });
}

describe("NdJsonStreamReader", () => {
  it("parses multiple ndjson lines across chunk boundaries", async () => {
    const reader = new NdJsonStreamReader<{ id: number; value: string }>();
    const stream = createStreamFromTextParts([
      '{"id":1,"value":"a"}\n{"id":',
      '2,"value":"b"}\n'
    ]);

    const chunks: Array<{ id: number; value: string }> = [];
    for await (const chunk of reader.read(stream)) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual([
      { id: 1, value: "a" },
      { id: 2, value: "b" }
    ]);
  });

  it("ignores blank and whitespace-only lines", async () => {
    const reader = new NdJsonStreamReader<{ ok: boolean }>();
    const stream = createStreamFromTextParts([
      "\n",
      "   \n",
      '{"ok":true}\n',
      "\t\n"
    ]);

    const chunks: Array<{ ok: boolean }> = [];
    for await (const chunk of reader.read(stream)) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual([{ ok: true }]);
  });

  it("parses trailing data even when final line is not newline terminated", async () => {
    const reader = new NdJsonStreamReader<{ id: number }>();
    const stream = createStreamFromTextParts([
      '{"id":1}\n',
      '{"id":2}'
    ]);

    const chunks: Array<{ id: number }> = [];
    for await (const chunk of reader.read(stream)) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it("releases reader lock when parsing throws", async () => {
    const releaseLock = vi.fn();
    const read = vi
      .fn<() => Promise<{ done: boolean; value?: Uint8Array }>>()
      .mockResolvedValueOnce({
        done: false,
        value: new TextEncoder().encode('{"ok":true}\nnot-json\n')
      })
      .mockResolvedValueOnce({ done: true });

    const fakeReader = {
      read,
      releaseLock
    };

    const stream = {
      getReader: () => fakeReader
    } as unknown as ReadableStream<Uint8Array>;

    const reader = new NdJsonStreamReader<{ ok: boolean }>();
    const iterator = reader.read(stream)[Symbol.asyncIterator]();

    await expect(iterator.next()).resolves.toEqual({ done: false, value: { ok: true } });
    await expect(iterator.next()).rejects.toThrow();
    expect(releaseLock).toHaveBeenCalledTimes(1);
  });

  it("releases reader lock after successful completion", async () => {
    const releaseLock = vi.fn();
    const read = vi
      .fn<() => Promise<{ done: boolean; value?: Uint8Array }>>()
      .mockResolvedValueOnce({
        done: false,
        value: new TextEncoder().encode('{"ok":true}\n')
      })
      .mockResolvedValueOnce({ done: true });

    const fakeReader = {
      read,
      releaseLock
    };

    const stream = {
      getReader: () => fakeReader
    } as unknown as ReadableStream<Uint8Array>;

    const reader = new NdJsonStreamReader<{ ok: boolean }>();
    const chunks: Array<{ ok: boolean }> = [];
    for await (const chunk of reader.read(stream)) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual([{ ok: true }]);
    expect(releaseLock).toHaveBeenCalledTimes(1);
  });
});