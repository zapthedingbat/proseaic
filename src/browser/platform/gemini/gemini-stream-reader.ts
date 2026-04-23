
import { SseStreamReader } from "../../lib/platform/sse-stream-reader.js";
import { GeminiStreamChunk } from "./gemini-request.js";

export interface IGeminiStreamReader {
  read(stream: ReadableStream<Uint8Array>): AsyncIterable<GeminiStreamChunk>;
}

export class GeminiStreamReader extends SseStreamReader<GeminiStreamChunk> implements IGeminiStreamReader {
  constructor() {
    super();
  }
}
