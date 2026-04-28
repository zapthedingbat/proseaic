import { describe, it, expect } from "vitest";
import { CodeMirrorEditor } from "../../../src/browser/components/codemirror-editor.js";

// CodeMirrorEditor is self-registering (customElements.define at module load).
// If it was already defined, ignore the error.
try {
  customElements.define("codemirror-editor-test", CodeMirrorEditor);
} catch {
  // already defined
}

function makeEditor(): CodeMirrorEditor {
  const el = document.createElement("codemirror-editor") as CodeMirrorEditor;
  el.setContent("# Heading\n\nBody text");
  return el;
}

function captureChangeEvents(el: HTMLElement): string[] {
  const events: string[] = [];
  el.addEventListener("change", () => events.push("change"));
  return events;
}

describe("CodeMirrorEditor – change event on structured-document mutations", () => {
  it("emits change when insertSection is called", () => {
    const el = makeEditor();
    const events = captureChangeEvents(el);

    el.insertSection("## New Section", "Content here");

    expect(events).toHaveLength(1);
  });

  it("emits change when replaceSection is called", () => {
    const el = makeEditor();
    const outline = el.getOutline();
    expect(outline.length).toBeGreaterThan(0);
    const events = captureChangeEvents(el);

    el.replaceSection(outline[0].sectionTitleId, "Replaced content");

    expect(events).toHaveLength(1);
  });

  it("emits change when removeSection is called", () => {
    const el = makeEditor();
    const outline = el.getOutline();
    expect(outline.length).toBeGreaterThan(0);
    const events = captureChangeEvents(el);

    el.removeSection(outline[0].sectionTitleId);

    expect(events).toHaveLength(1);
  });

  it("emits change when moveSection is called", () => {
    const el = makeEditor();
    el.setContent("# A\n\nBody A\n\n# B\n\nBody B");
    const outline = el.getOutline();
    expect(outline.length).toBeGreaterThanOrEqual(2);
    const events = captureChangeEvents(el);

    el.moveSection(outline[0].sectionTitleId, outline[1].sectionTitleId);

    expect(events).toHaveLength(1);
  });
});
