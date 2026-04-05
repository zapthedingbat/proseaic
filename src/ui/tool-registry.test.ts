import { describe, expect, it, vi } from "vitest";
import { ToolRegistry } from "./tool-registry.js";

describe("ToolRegistry", () => {
  it("supports explicit registration for test-specific tools", async () => {
    const execute = vi.fn(async () => ({ ok: true }));
    const registry = new ToolRegistry().register({
      name: "test_tool",
      execute
    });

    const tool = registry.findTool("test_tool");
    const missingTool = registry.findTool("replace_selection");

    expect(tool).not.toBeNull();
    expect(missingTool).toBeNull();

    const result = await tool?.execute({ value: 1 }, { editor: null });

    expect(execute).toHaveBeenCalledWith({ value: 1 }, { editor: null });
    expect(result).toEqual({ ok: true });
  });

  it("creates the default tool set through the factory", () => {
    const registry = ToolRegistry.create();

    expect(registry.findTool("read_document_lines")).not.toBeNull();
    expect(registry.findTool("replace_selection")).not.toBeNull();
    expect(registry.findTool("replace_document")).not.toBeNull();
  });
});