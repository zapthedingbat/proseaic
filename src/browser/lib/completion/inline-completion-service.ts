import { IPlatformService } from "../platform/platform-service.js";
import { Model } from "../models/model.js";
import { IConfigurationService } from "../configuration/configuration-service.js";

export interface IInlineCompletionService {
  getCompletion(documentBefore: string, signal: AbortSignal): AsyncIterable<string>;
}

export class AiInlineCompletionService implements IInlineCompletionService {
  private static readonly MAX_CONTEXT_CHARS = 4000;
  private static readonly SYSTEM_PROMPT =
    "You are an inline text completion engine for a markdown editor. " +
    "Continue the text after the cursor. Output only the continuation — " +
    "no commentary, no code fences, no explanations. Keep it concise " +
    "(one phrase or sentence). Match the style and tone of the existing text.";
  private readonly _configurationService: IConfigurationService;
  private readonly _platform: IPlatformService;

  constructor(
    configurationService: IConfigurationService,
    platform: IPlatformService
  ) {
    this._configurationService = configurationService;
    this._platform = platform;
  }

  protected async getModel(): Promise<Model | null> {
    const models = await this._platform.getModels();
    const modelName = this._configurationService.get("ai.completion.model");
    const resolvedModel = models.find(m => m.name === modelName);
    return resolvedModel ?? null;
  }

  async *getCompletion(documentBefore: string, signal: AbortSignal): AsyncIterable<string> {
    if (this._configurationService.get("ai.completion.enabled") === "false") return;

    const model = await this.getModel();
    if (!model) {
      return;
    }

    // Strip thinking capability so completion requests never trigger extended thinking.

    const context = documentBefore.length > AiInlineCompletionService.MAX_CONTEXT_CHARS
      ? documentBefore.slice(-AiInlineCompletionService.MAX_CONTEXT_CHARS)
      : documentBefore;

    const messages = [
      {
        role: "system" as const,
        model: model.name,
        content: [{ type: "text" as const, text: AiInlineCompletionService.SYSTEM_PROMPT }],
      },
      {
        role: "user" as const,
        model: model.name,
        content: [{
          type: "text" as const,
          text: `<document_before>\n${context}\n</document_before>\nContinue the text from the cursor position.`,
        }],
      },
    ];

    const stream = this._platform.generate(model, messages, [], { signal, think: false });

    for await (const event of stream) {
      if (signal.aborted) return;
      if (event.type === "text_delta") yield event.text;
      if (event.type === "done") return;
    }
  }
}
