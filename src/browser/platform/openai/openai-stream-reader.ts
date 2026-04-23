
import { SseStreamReader } from "../../lib/platform/sse-stream-reader.js";
import { OpenAIStreamChunk } from "./openai-request.js";

export interface IOpenAIStreamReader {
  read(stream: ReadableStream<Uint8Array>): AsyncIterable<OpenAIStreamChunk>;
}

export class OpenAIStreamReader extends SseStreamReader<OpenAIStreamChunk> implements IOpenAIStreamReader {
  constructor() {
    super();
  }
}
