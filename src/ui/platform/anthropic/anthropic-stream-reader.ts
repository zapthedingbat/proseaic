
import { SseStreamReader } from "../../lib/platform/sse-stream-reader.js";
import { AnthropicStreamChunk } from "./anthropic-request.js";

export interface IAnthropicStreamReader {
  read(stream: ReadableStream<Uint8Array>): AsyncIterable<AnthropicStreamChunk>;
}

export class AnthropicStreamReader extends SseStreamReader<AnthropicStreamChunk> implements IAnthropicStreamReader {
  constructor() {
    super();
  }
}
