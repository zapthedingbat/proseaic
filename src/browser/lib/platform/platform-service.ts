import { ChatMessage } from "../chat/chat-message.js";
import { Model } from "../models/model.js";
import { ToolSchema } from "../tools/tool-schema.js";
import { PlatformGenerateOptions } from "./platform-registry.js";
import { StreamEvent } from "./stream-event.js";

export interface IPlatformService {
  generate(
    model: Model,
    messages: ChatMessage[],
    tools: ToolSchema[],
    options?: PlatformGenerateOptions
  ): AsyncIterable<StreamEvent>;
  getModels(): Promise<Model[]>;
}
