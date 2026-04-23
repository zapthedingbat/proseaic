import { ChatMessage } from "../chat/chat-message.js";
import { LoggerFactory } from "../logging/logger-factory.js";
import { Logger } from "../logging/logger.js";
import { Model } from "../models/model.js";
import { ToolSchema } from "../tools/tool-schema.js";
import { IPlatformService } from "./platform-service.js";
import { StreamEvent } from "./stream-event.js";
import { IPlatform } from "./platform.js";
import { EventDispatcher } from "../events/event-dispatcher.js";
import { IEventEmitter } from "../events/event-emitter.js";
import { ChatStreamEventMap } from "./chat-stream-event-map.js";

export interface IPlatformRegistry {
  register(platform: IPlatform): void;
  registerMany(platforms: IPlatform[]): void;
}

export class PlatformRegistry implements IPlatformService, IPlatformRegistry {
  private _platforms: Map<string, IPlatform>;
  private _logger: Logger;
  private _events: IEventEmitter<ChatStreamEventMap> = new EventDispatcher<ChatStreamEventMap>();
  
  constructor(_loggerFactory: LoggerFactory) {
    this._logger = _loggerFactory("Platform Service");
    this._platforms = new Map<string, IPlatform>();
    this._events = new EventDispatcher<ChatStreamEventMap>();
  }

  on<K extends keyof ChatStreamEventMap>(event: K, cb: (e: ChatStreamEventMap[K]) => void): void {
    this._events.on(event, cb);
  }
  
  off<K extends keyof ChatStreamEventMap>(event: K, cb: (e: ChatStreamEventMap[K]) => void): void {
    this._events.off(event, cb);
  }

  async *generate(model: Model, messages: ChatMessage[], tools: ToolSchema[]): AsyncIterable<StreamEvent> {
    
    // Select the platform adapter based on the model details, and delegate the generation to it.
    const platform = this._platforms.get(model.platform);

    if (!platform) {
      throw new Error(`No platform registered for platform name: ${model.platform}`);
    }

    const streamEvents = platform.generate(model, messages, tools);
    for await (const streamEvent of streamEvents) {
      this._events.emit("streamEvent", streamEvent);
      yield streamEvent;
    }
  }

  async getModels(): Promise<Model[]> {

    // Get the list of models from all registered platforms in parallel and combine them into a single list.
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

    // Implementation for registering a platform
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
