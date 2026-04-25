import { EventDispatcher } from "../events/event-dispatcher";

const eventName = "change";

export type ConfigurationChangeEvent = {
  key: keyof Configuration;
  oldValue?: Configuration[keyof Configuration];
  value: Configuration[keyof Configuration];
}

export interface Configuration {
  "ai.chat.model": string;
  "ai.completion.model": string;
  "ai.platform.anthropic.api_key": string;
  "ai.platform.openai.api_key": string;
  "ai.platform.gemini.api_key": string;
  "ai.platform.mistral.api_key": string;
}

export interface IConfigurationService {
  get<K extends keyof Configuration>(key: K, defaultValue?: Configuration[K]): Configuration[K] | undefined;
  set<K extends keyof Configuration>(key: K, value: Configuration[K]): void;
  addListener(cb: (e: ConfigurationChangeEvent) => void): void;
  removeListener(cb: (e: ConfigurationChangeEvent) => void): void;
  keys(): (keyof Configuration)[];
}

export class ConfigurationManager implements IConfigurationService {
  private _configuration: Partial<Configuration> = {};
  private _events = new EventDispatcher<{ [eventName]: ConfigurationChangeEvent }>();
  private _storage: Storage;

  constructor(storage: Storage) {
    this._storage = storage;
    this._load();
  }

  get<K extends keyof Configuration>(key: K, defaultValue?: Configuration[K]): Configuration[K] | undefined {
    return this._configuration[key] ?? defaultValue;
  }

  set<K extends keyof Configuration>(key: K, value: Configuration[K]) {
    const oldValue = this._configuration[key];
    this._configuration[key] = value;
    this._persist();
    this._events.emit(eventName, { key, oldValue, value });
  }

  keys(): (keyof Configuration)[] {
    return Object.keys(this._configuration) as (keyof Configuration)[];
  }

  addListener(cb: (e: ConfigurationChangeEvent) => void): void {
    this._events.on(eventName, cb);
  }

  removeListener(cb: (e: ConfigurationChangeEvent) => void): void {
    this._events.off(eventName, cb);
  }

  protected _load(): Configuration {
    const dataStr = this._storage.getItem("configuration");
    if (dataStr) {
      try {
        this._configuration = JSON.parse(dataStr);
      } catch (e) {
        console.error("Failed to parse configuration from storage", e);
      }
    }
    return {} as Configuration;
  }

  protected _persist(): void {
    const dataStr = JSON.stringify(this._configuration);
    this._storage.setItem("configuration", dataStr);
  }
}

