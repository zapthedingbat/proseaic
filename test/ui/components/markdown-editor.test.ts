import { describe, expect, it, vi } from "vitest";
import { MarkdownEditor } from "../../../src/ui/components/markdown-editor.js";

if (!customElements.get("ui-markdown-editor")) {
  customElements.define("ui-markdown-editor", MarkdownEditor);
}

describe("MarkdownEditor section operations", () => {
  it("exposes and replaces root content before first heading", () => {
    const editor = document.createElement("ui-markdown-editor") as MarkdownEditor;

    editor.setMarkdown("Intro paragraph\n\n# Heading\nBody");

    const outline = editor.getOutline();
    expect(editor.getSectionContent("root")).toBe("Intro paragraph\n");
    expect(outline.children).toHaveLength(1);

    editor.replaceSection("root", "Updated intro");

    expect(editor.markdown).toBe("Updated intro\n# Heading\nBody");
  });

  it("exposes and replaces root content when there are no headings", () => {
    const editor = document.createElement("ui-markdown-editor") as MarkdownEditor;

    editor.setMarkdown("Line one\nLine two");

    expect(editor.getOutline().children).toHaveLength(0);
    expect(editor.getSectionContent("root")).toBe("Line one\nLine two");

    editor.replaceSection("root", "Rewritten");

    expect(editor.markdown).toBe("Rewritten");
  });

  it("flushes pending debounced edits on blur", () => {
    vi.useFakeTimers();

    const editor = document.createElement("ui-markdown-editor") as MarkdownEditor;
    document.body.appendChild(editor);

    const updates: string[] = [];
    editor.addEventListener("change", (event: Event) => {
      const detail = (event as CustomEvent<{ markdown: string }>).detail;
      updates.push(detail.markdown);
    });

    const contentEditable = editor.shadowRoot!.querySelector("#editor") as HTMLDivElement;
    contentEditable.textContent = "Draft content";
    contentEditable.dispatchEvent(new Event("input", { bubbles: true, composed: true }));

    expect(updates).toHaveLength(0);

    contentEditable.dispatchEvent(new FocusEvent("blur", { bubbles: true, composed: true }));

    expect(updates).toEqual(["Draft content"]);
    expect(editor.markdown).toBe("Draft content");

    vi.runAllTimers();
    expect(updates).toHaveLength(1);

    document.body.removeChild(editor);
    vi.useRealTimers();
  });
});
