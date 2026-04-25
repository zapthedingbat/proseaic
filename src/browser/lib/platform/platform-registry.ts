import { ChatMessage } from "../chat/chat-message.js";
import { LoggerFactory } from "../logging/logger-factory.js";
import { Logger } from "../logging/logger.js";
import { Model } from "../models/model.js";
import { ToolSchema } from "../tools/tool-schema.js";
import { IPlatformService } from "./platform-service.js";
import { StreamEvent } from "./stream-event.js";
import { IPlatform } from "./platform.js";

export interface IPlatformRegistry {
  register(platform: IPlatform): void;
  registerMany(platforms: IPlatform[]): void;
}

export type PlatformGenerateOptions = {
  think?: boolean;
  signal?: AbortSignal;
}

export class PlatformRegistry implements IPlatformService, IPlatformRegistry {
  private _platforms: Map<string, IPlatform>;
  private _logger: Logger;

  constructor(_loggerFactory: LoggerFactory) {
    this._logger = _loggerFactory("Platform Service");
    this._platforms = new Map<string, IPlatform>();
  }

  generate(model: Model, messages: ChatMessage[], tools: ToolSchema[], options?: PlatformGenerateOptions): AsyncIterable<StreamEvent> {
    const platform = this._platforms.get(model.platform);

    if (!platform) {
      throw new Error(`No platform registered for platform name: ${model.platform}`);
    }

    return platform.generate(model, messages, tools, options);
  }

  async getModels(): Promise<Model[]> {
    const modelsFromPlatforms = await Promise.all(
      Array.from(this._platforms.entries()).map(([platformName, platform]) => {
        return platform.getModels().catch(error => {
          this._logger.error(`Error fetching models from platform ${platformName}:`, error);
          return [];
        });
      })
    );

    return modelsFromPlatforms.flat();
  }

  public register(platform: IPlatform) {
    const platformName = platform.name || platform.constructor.name;
    if(this._platforms.has(platformName)) {
      throw new Error(`Platform with name ${platformName} is already registered.`);
    }

    this._platforms.set(platformName, platform);
  }

  public registerMany(platforms: IPlatform[]): void {
    platforms.forEach(platform => this.register(platform));
  }
}
