import { describe, expect, it } from "vitest";
import { MarkdownEditor } from "../../../src/ui/components/markdown-editor.js";

if (!customElements.get("markdown-editor")) {
  customElements.define("markdown-editor", MarkdownEditor);
}

describe("MarkdownEditor section operations", () => {
  it("exposes and replaces root content before first heading", () => {
    const editor = document.createElement("markdown-editor") as MarkdownEditor;

    editor.setMarkdown("Intro paragraph\n\n# Heading\nBody");

    const outline = editor.getOutline();
    expect(editor.getSectionContent("root")).toBe("Intro paragraph\n");
    expect(outline.children).toHaveLength(1);

    editor.replaceSection("root", "Updated intro");

    expect(editor.markdown).toBe("Updated intro\n# Heading\nBody");
  });

  it("exposes and replaces root content when there are no headings", () => {
    const editor = document.createElement("markdown-editor") as MarkdownEditor;

    editor.setMarkdown("Line one\nLine two");

    expect(editor.getOutline().children).toHaveLength(0);
    expect(editor.getSectionContent("root")).toBe("Line one\nLine two");

    editor.replaceSection("root", "Rewritten");

    expect(editor.markdown).toBe("Rewritten");
  });
});
