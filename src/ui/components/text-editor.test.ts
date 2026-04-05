import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TextEditor } from "./text-editor.js";

if (!customElements.get("text-editor")) {
  customElements.define("text-editor", TextEditor);
}

describe("TextEditor selection markers", () => {
  let editorElement: TextEditor;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    editorElement = document.createElement("text-editor") as TextEditor;
    document.body.appendChild(editorElement);

    editorElement.value = "cat\ndog\nfish\nbird";
  });

  afterEach(() => {
    editorElement?.remove();
    consoleSpy?.mockRestore();
  });

  it("does not nest selection wrappers when re-applied", () => {
    (editorElement as any)._selectionRange = { start: 5, end: 11 };
    editorElement._applySelectionMarkers();
    editorElement._applySelectionMarkers();

    const selectedSpans = editorElement.shadowRoot!.querySelectorAll(".selection");
    const nestedSpans = editorElement.shadowRoot!.querySelectorAll(".selection .selection");
    const selectedChunks = Array.from(selectedSpans).map((el) => el.textContent);

    expect(nestedSpans.length).toBe(0);
    expect(selectedChunks).toEqual(["og\nfis"]);
  });

  it("treats selection end offset as exclusive", () => {
    (editorElement as any)._selectionRange = { start: 5, end: 11 };
    editorElement._applySelectionMarkers();

    const selectedText = Array.from(
      editorElement.shadowRoot!.querySelectorAll(".selection")
    )
      .map((el) => el.textContent)
      .join("");

    expect(selectedText).toBe("og\nfis");
    expect(selectedText.includes("h")).toBe(false);
  });

  it("selection offsets are based on text indices, not DOM node structure", () => {
    editorElement.value = "cat\ndog\nfish";

    const start = editorElement.value.indexOf("fish");
    const end = start + "fish".length;
    (editorElement as any)._selectionRange = { start, end };

    const selection = editorElement.getSelection();
    expect(selection.start).toBe(start);
    expect(selection.end).toBe(end);
    expect(selection.text).toBe("fish");
  });

  it("replaces the intended line using text offsets", async () => {
    editorElement.value = [
      "### The Dog",
      "",
      "<insert a poem about dogs here>",
      "",
      "### The Fish",
      "",
      "<insert a poem about fish here>"
    ].join("\n");

    const targetLine = "<insert a poem about fish here>";
    const replacement = "Ocean depths so blue";
    const start = editorElement.value.indexOf(targetLine);
    const end = start + targetLine.length;
    (editorElement as any)._selectionRange = { start, end };

    editorElement.replaceSelection(replacement);

    expect(editorElement.value).toContain(replacement);
    expect(editorElement.value).not.toContain(targetLine);
    expect(editorElement.value).toContain("### The Dog");
    expect(editorElement.value).toContain("### The Fish");
  });
});
