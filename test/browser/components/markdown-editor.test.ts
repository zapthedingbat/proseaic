import { describe, expect, it, vi } from "vitest";
import { MarkdownEditor } from "../../../src/browser/components/markdown-editor.js";
import { IInlineCompletionService } from "../../../src/browser/lib/completion/inline-completion-service.js";

if (!customElements.get("ui-markdown-editor")) {
  customElements.define("ui-markdown-editor", MarkdownEditor);
}

describe("MarkdownEditor section operations", () => {
  it("exposes and replaces root content before first heading", () => {
    const editor = document.createElement("ui-markdown-editor") as MarkdownEditor;

    editor.setContent("Intro paragraph\n\n# Heading\nBody");

    const outline = editor.getOutline();
    expect(editor.getSectionContent("root")).toBe("Intro paragraph\n");
    expect(outline).toHaveLength(1);

    editor.replaceSection("root", "Updated intro");

    expect(editor.getContent()).toBe("Updated intro\n# Heading\nBody");
  });

  it("exposes and replaces root content when there are no headings", () => {
    const editor = document.createElement("ui-markdown-editor") as MarkdownEditor;

    editor.setContent("Line one\nLine two");

    expect(editor.getOutline()).toHaveLength(0);
    expect(editor.getSectionContent("root")).toBe("Line one\nLine two");

    editor.replaceSection("root", "Rewritten");

    expect(editor.getContent()).toBe("Rewritten");
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

    const editorPage = editor.shadowRoot!.querySelector("#editor-page") as HTMLDivElement;
    editorPage.textContent = "Draft content";
    editorPage.dispatchEvent(new Event("input", { bubbles: true, composed: true }));

    expect(updates).toHaveLength(0);

    editorPage.dispatchEvent(new FocusEvent("blur", { bubbles: true, composed: true }));

    expect(updates).toEqual(["Draft content"]);
    expect(editor.getContent()).toBe("Draft content");

    vi.runAllTimers();
    expect(updates).toHaveLength(1);

    document.body.removeChild(editor);
    vi.useRealTimers();
  });
});

describe("MarkdownEditor inline completion placement", () => {
  it("inserts ghost text in the correct line div when the cursor is on the last of three lines", async () => {
    // CORRECT BEHAVIOR: In a 3-line document with the cursor at the start of the third
    // line, the .mde-ghost span must be injected into the third <div> (index 2),
    // not into an earlier div.
    //
    // BUG: _offsetFromDomPosition computes _savedStart via:
    //   range.setStart(editorPage, 0); range.setEnd(node, offset);
    //   return range.toString().length;
    //
    // In JSDOM, range.toString() omits the implicit newlines between sibling block
    // <div> elements.  For content "Line one\nLine two\nLine three" with the cursor
    // placed at position 0 of the "Line three" text node the correct document offset
    // is 18 (= len("Line one\n") + len("Line two\n")), but JSDOM's range.toString()
    // skips the 2 inter-div newlines and returns 16.
    //
    // _requestCompletion then decomposes _savedStart using:
    //   remaining -= lines[i].length + 1   (+1 for the newline)
    // With _savedStart=16 that loop lands on lineIndex=1 (charOffset=7), so the ghost
    // span is inserted into div[1] ("Line two") instead of div[2] ("Line three").
    //
    // The test replicates the exact call sequence used at runtime: it calls
    // _offsetFromDomPosition with the DOM node at the cursor position (as
    // _onSelectionChange does) and feeds the result straight into _savedStart.
    // Once _offsetFromDomPosition is fixed to return 18 the test will pass.

    const editor = document.createElement("ui-markdown-editor") as MarkdownEditor;
    document.body.appendChild(editor);

    editor.setContent("Line one\nLine two\nLine three");

    // Completion provider that immediately yields a single text chunk.
    const mockProvider: IInlineCompletionService = {
      getCompletion(_documentBefore: string, _signal: AbortSignal): AsyncIterable<string> {
        return (async function* () {
          yield " (suggestion)";
        })();
      },
    };
    editor.setCompletionProvider(mockProvider);

    // Replicate what _onSelectionChange does for a cursor placed at the very start
    // of the third line: call the private _offsetFromDomPosition with (node, 0) where
    // node is the first text node inside the last <div>.
    //
    // Correct offset: "Line one\n" + "Line two\n" = 9 + 9 = 18.
    // JSDOM offset (bug):  "Line one"  + "Line two"  = 8 + 8 = 16  (newlines missing).
    const editorPage = editor.shadowRoot!.querySelector("#editor-page") as HTMLDivElement;
    const lastDiv = editorPage.children[2] as HTMLElement;
    const lastDivFirstNode = lastDiv.firstChild!;

    (editor as any)._savedStart =
      (editor as any)._offsetFromDomPosition(lastDivFirstNode, 0);

    await (editor as any)._requestCompletion();

    const divs = Array.from(editorPage.children) as HTMLElement[];
    const ghostSpan = editorPage.querySelector(".mde-ghost");

    expect(ghostSpan).not.toBeNull();

    const ghostDiv = divs.find(d => d.contains(ghostSpan!));

    // The ghost span must be inside divs[2] ("Line three") — the div that corresponds
    // to the line where the cursor actually is.  Before the fix it lands in divs[1]
    // ("Line two") because _offsetFromDomPosition returns 16 instead of 18.
    expect(ghostDiv).toBe(divs[2]);

    document.body.removeChild(editor);
  });
});
