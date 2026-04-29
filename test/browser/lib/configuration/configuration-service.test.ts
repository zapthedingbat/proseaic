// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { ConfigurationManager } from "../../../../src/browser/lib/configuration/configuration-service";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStorage(initial?: string): Storage {
  const map = new Map<string, string>();
  if (initial !== undefined) {
    map.set("configuration", initial);
  }
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, value),
    removeItem: (key) => { map.delete(key); },
    clear: () => map.clear(),
    get length() { return map.size; },
    key: (index) => [...map.keys()][index] ?? null,
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let storage: Storage;
let config: ConfigurationManager;

beforeEach(() => {
  storage = makeStorage();
  config = new ConfigurationManager(storage);
});

// ---------------------------------------------------------------------------
// get
// ---------------------------------------------------------------------------

describe("get", () => {
  it("returns undefined for an unset key", () => {
    expect(config.get("ai.chat.model")).toBeUndefined();
  });

  it("returns the defaultValue for an unset key", () => {
    expect(config.get("ai.chat.model", "gpt-4")).toBe("gpt-4");
  });

  it("returns the stored value, ignoring the default", () => {
    config.set("ai.chat.model", "claude-3");
    expect(config.get("ai.chat.model", "gpt-4")).toBe("claude-3");
  });
});

// ---------------------------------------------------------------------------
// set
// ---------------------------------------------------------------------------

describe("set", () => {
  it("makes the value readable via get", () => {
    config.set("ai.chat.model", "claude-3");
    expect(config.get("ai.chat.model")).toBe("claude-3");
  });

  it("persists the value to storage", () => {
    config.set("ai.chat.model", "claude-3");
    const stored = JSON.parse(storage.getItem("configuration")!);
    expect(stored["ai.chat.model"]).toBe("claude-3");
  });

  it("overwrites a previous value", () => {
    config.set("ai.chat.model", "old");
    config.set("ai.chat.model", "new");
    expect(config.get("ai.chat.model")).toBe("new");
  });
});

// ---------------------------------------------------------------------------
// keys
// ---------------------------------------------------------------------------

describe("keys", () => {
  it("returns an empty array when nothing is set", () => {
    expect(config.keys()).toEqual([]);
  });

  it("returns all keys that have been set", () => {
    config.set("ai.chat.model", "a");
    config.set("ai.completion.model", "b");
    expect(config.keys()).toEqual(expect.arrayContaining(["ai.chat.model", "ai.completion.model"]));
  });
});

// ---------------------------------------------------------------------------
// Change events
// ---------------------------------------------------------------------------

describe("addListener", () => {
  it("calls the listener when a value is set", () => {
    const listener = vi.fn();
    config.addListener(listener);
    config.set("ai.chat.model", "claude-3");
    expect(listener).toHaveBeenCalledOnce();
  });

  it("passes the key, value, and oldValue in the event", () => {
    const listener = vi.fn();
    config.addListener(listener);
    config.set("ai.chat.model", "first");
    config.set("ai.chat.model", "second");
    expect(listener).toHaveBeenLastCalledWith({
      key: "ai.chat.model",
      oldValue: "first",
      value: "second",
    });
  });

  it("passes undefined as oldValue on first set", () => {
    const listener = vi.fn();
    config.addListener(listener);
    config.set("ai.chat.model", "claude-3");
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ oldValue: undefined, value: "claude-3" })
    );
  });
});

describe("removeListener", () => {
  it("stops the listener from being called after removal", () => {
    const listener = vi.fn();
    config.addListener(listener);
    config.removeListener(listener);
    config.set("ai.chat.model", "claude-3");
    expect(listener).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Storage persistence across instances
// ---------------------------------------------------------------------------

describe("constructor", () => {
  it("loads previously persisted configuration from storage", () => {
    const prepopulated = makeStorage(JSON.stringify({ "ai.chat.model": "persisted-model" }));
    const loaded = new ConfigurationManager(prepopulated);
    expect(loaded.get("ai.chat.model")).toBe("persisted-model");
  });

  it("handles corrupt storage data without throwing", () => {
    const corrupt = makeStorage("this is not json");
    expect(() => new ConfigurationManager(corrupt)).not.toThrow();
  });

  it("starts empty when storage has no configuration entry", () => {
    expect(config.keys()).toHaveLength(0);
  });
});
