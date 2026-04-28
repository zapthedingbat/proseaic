import { describe, it, expect, vi, beforeEach } from "vitest";
import { PlatformRegistry } from "../../../../src/browser/lib/platform/platform-registry";
import type { IPlatform } from "../../../../src/browser/lib/platform/platform";
import type { LoggerFactory } from "../../../../src/browser/lib/logging/logger-factory";
import type { Logger } from "../../../../src/browser/lib/logging/logger";
import type { Model } from "../../../../src/browser/lib/models/model";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLogger(): Logger {
  return {
    trace: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  };
}

function makeLoggerFactory(logger = makeLogger()): LoggerFactory {
  return vi.fn().mockReturnValue(logger);
}

function makePlatform(name: string, overrides: Partial<IPlatform> = {}): IPlatform {
  return {
    name,
    isAvailable: vi.fn().mockReturnValue(true),
    getModels: vi.fn().mockResolvedValue([]),
    generate: vi.fn(),
    ...overrides,
  };
}

const model = (platform: string): Model => ({ name: "test-model", platform });

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let logger: Logger;
let registry: PlatformRegistry;

beforeEach(() => {
  logger = makeLogger();
  registry = new PlatformRegistry(makeLoggerFactory(logger));
});

// ---------------------------------------------------------------------------
// register
// ---------------------------------------------------------------------------

describe("register", () => {
  it("registers a platform without throwing", () => {
    expect(() => registry.register(makePlatform("ollama"))).not.toThrow();
  });

  it("throws when a platform with the same name is registered twice", () => {
    registry.register(makePlatform("ollama"));
    expect(() => registry.register(makePlatform("ollama"))).toThrow("already registered");
  });
});

// ---------------------------------------------------------------------------
// registerMany
// ---------------------------------------------------------------------------

describe("registerMany", () => {
  it("registers all platforms in the array", () => {
    registry.registerMany([makePlatform("a"), makePlatform("b")]);
    // generate throws if the platform isn't registered — use that as a proxy
    expect(() => registry.generate(model("a"), [], [])).not.toThrow();
    expect(() => registry.generate(model("b"), [], [])).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// generate
// ---------------------------------------------------------------------------

describe("generate", () => {
  it("delegates to the platform matching the model's platform field", () => {
    const platform = makePlatform("ollama");
    registry.register(platform);
    registry.generate(model("ollama"), [], []);
    expect(platform.generate).toHaveBeenCalledWith(model("ollama"), [], [], undefined);
  });

  it("throws when no platform is registered for the model's platform", () => {
    expect(() => registry.generate(model("unknown"), [], [])).toThrow(
      "No platform registered for platform name: unknown"
    );
  });
});

// ---------------------------------------------------------------------------
// getModels
// ---------------------------------------------------------------------------

describe("getModels", () => {
  it("returns an empty array when no platforms are registered", async () => {
    expect(await registry.getModels()).toEqual([]);
  });

  it("aggregates models from all available platforms", async () => {
    const modelsA: Model[] = [{ name: "a1", platform: "a" }];
    const modelsB: Model[] = [{ name: "b1", platform: "b" }];
    registry.registerMany([
      makePlatform("a", { getModels: vi.fn().mockResolvedValue(modelsA) }),
      makePlatform("b", { getModels: vi.fn().mockResolvedValue(modelsB) }),
    ]);
    expect(await registry.getModels()).toEqual([...modelsA, ...modelsB]);
  });

  it("skips platforms where isAvailable returns false", async () => {
    registry.registerMany([
      makePlatform("available", { getModels: vi.fn().mockResolvedValue([{ name: "m1", platform: "available" }]) }),
      makePlatform("unavailable", { isAvailable: vi.fn().mockReturnValue(false) }),
    ]);
    const models = await registry.getModels();
    expect(models).toHaveLength(1);
    expect(models[0].platform).toBe("available");
  });

  it("returns models from successful platforms when one platform rejects", async () => {
    const goodModels: Model[] = [{ name: "good", platform: "good" }];
    registry.registerMany([
      makePlatform("good", { getModels: vi.fn().mockResolvedValue(goodModels) }),
      makePlatform("bad", { getModels: vi.fn().mockRejectedValue(new Error("network error")) }),
    ]);
    const result = await registry.getModels();
    expect(result).toEqual(goodModels);
  });

  it("logs an error for each platform that rejects", async () => {
    const err = new Error("network error");
    registry.register(makePlatform("bad", { getModels: vi.fn().mockRejectedValue(err) }));
    await registry.getModels();
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("bad"), err);
  });
});
