import { BaseHtmlElement } from "./base-html-element.js";

export interface EditorSelection {
  text: string;
  start: number;
  end: number;
}

type OutlineEntryList = Array<{ id: string; title: string; level: number }>;

/**
 * <text-editor> WebComponent
 * 
 * A lightweight contenteditable text editor with offset-based selections.
 * Selection markers provide visual feedback when the editor is not focused.
 */
export class TextEditor extends BaseHtmlElement {
  // Public DOM reference
  private _editor: HTMLDivElement;

  // Internal state
  private _selectionRange: { start: number; end: number };
  private _markdown: string;

  constructor() {
    super();
    
    // Initialize shadow DOM with editor styles and structure
    this.innerHTML = `
      <style>
        :host {
          flex: 1;
          display: flex;
          flex-direction: column;
          max-width: 1024px;
          justify-self: center;
          margin: 0 auto;
          overflow-y: auto;
        }
        .selection {
          background-color: var(--editor-selection-bg, rgba(100, 150, 250, 0.3));
          border-radius: var(--editor-selection-radius, 2px);
          outline: 1px solid #FF0;
        }
        #editor {
          flex: 1 0 auto;
          margin: 16px;
          font-family: var(--editor-font-family);
          font-size: var(--editor-font-size);
          line-height: var(--editor-line-height, 1.5);
          padding: var(--editor-padding, 8px);
          white-space: pre-wrap;
          word-wrap: break-word;
          /*
          border-radius: var(--input-radius);
          border: var(--input-border);
          */
          color: var(--editor-text-color, #000);
          background-color: var(--editor-bg-color, #fff);
          box-shadow: var(--editor-box-shadow, 0 0 8px -4px rgba(0,0,0,0.5));
        }
        #editor:focus {
          outline: none;
          border: var(--input-focus-border);
        }
      </style>
      <div id="editor" contenteditable="true"></div>
    `;
    
    // Cache editor element and initialize state
    this._editor = this.shadowRoot!.getElementById("editor") as HTMLDivElement;
    this._selectionRange = { start: 0, end: 0 };
    this._markdown = "";
  }

  connectedCallback(): void {
    // Attach event listeners for selection tracking and focus management
    document.addEventListener("selectionchange", this._handleDocSelectionChange);
    this._editor.addEventListener("focus", this._handleEditorFocus);
    this._editor.addEventListener("blur", this._handleEditorBlur);
    this._editor.addEventListener("input", this._handleEditorInput);
  }

  /** Remove event listeners when component is removed from DOM */
  disconnectedCallback(): void {
    document.removeEventListener("selectionchange", this._handleDocSelectionChange);
    this._editor.removeEventListener("focus", this._handleEditorFocus);
    this._editor.removeEventListener("blur", this._handleEditorBlur);
    this._editor.removeEventListener("input", this._handleEditorInput);
  }

  private _handleDocSelectionChange = (_event: Event): void => {
    const sel = window.getSelection();
    if (!sel) {
      return;
    }

    const range = sel.getComposedRanges({ shadowRoots: [this.shadowRoot!] })[0];
    if (!range) {
      return;
    }

    // Ignore non-editor selections so switching focus does not clear editor selection.
    if (!this._editor.contains(range.startContainer) || !this._editor.contains(range.endContainer)) {
      return;
    }

    const start = this._offsetFromDomPosition(range.startContainer, range.startOffset);
    const end = this._offsetFromDomPosition(range.endContainer, range.endOffset);

    const newStart = Math.min(start, end),
      newEnd = Math.max(start, end);

    if (newStart === this._selectionRange.start && newEnd === this._selectionRange.end) {
      return;
    }
    
    this._selectionRange.start = newStart;
    this._selectionRange.end = newEnd;

    this.dispatchEvent(new CustomEvent("selection-change", {
      detail: this.getSelection(),
      bubbles: true,
      composed: true
    }));
  };

  private _handleEditorFocus = (_event: FocusEvent): void => {
    this._clearSelectionMarkers();
  };

  private _handleEditorBlur = (_event: FocusEvent): void => {
    this._renderSelectionMarkers();
  };

  private _handleEditorInput = (_event: Event): void => {
    // Normalize DOM to merge adjacent text nodes and remove empty ones
    this._editor.normalize();

    // TODO: Rebuild the document model (markdown) from the DOM. For now we just serialize the text content, but this is where markdown parsing and rendering would be integrated.
    const nextState = this._editor.textContent || "";

    if (this._markdown !== nextState) {
      this._markdown = nextState;
      this.dispatchEvent(new CustomEvent("change", {
        detail: { content: this._markdown },
        bubbles: true,
        composed: true
      }));
    }
  };

  getDocumentMarkdown(): string {
    return this._markdown;
  }

  get value(): string {
    return this.getDocumentMarkdown();
  }

  set value(text: string) {
    this.setDocumentMarkdown(text);
  }

  setDocumentMarkdown(text: string): void {
    this._markdown = text;
    this._editor.textContent = text;
    this._selectionRange = { start: 0, end: 0 };
    this._clearSelectionMarkers();
  }

  getSelection(): EditorSelection {
    const range = this._selectionRange;
    return {
      text: this._markdown.slice(range.start, range.end),
      start: range.start,
      end: range.end,
    }
  }

  setSelectionMarkdown(text: string): void {
    const domRange = this._domRangeFromSelection();
    domRange.deleteContents();
    domRange.insertNode(document.createTextNode(text));
    this._markdown = this._editor.textContent || "";
    this._selectionRange.end = this._selectionRange.start + text.length;
    this._renderSelectionMarkers();
  }

  replaceSelection(text: string): void {
    this.setSelectionMarkdown(text);
  }

  getDocumentOutline(): OutlineEntryList {
    const headingsPattern = /^(#{1,6})\s+(.*)$/gm;
    const outline: OutlineEntryList = [];
    let match;
    let ids = new Set<string>();
    while ((match = headingsPattern.exec(this._markdown)) !== null) {
      const level = match[1].length;
      const title = match[2];
      let id = title.toLowerCase().replace(/\s+/g, "_").replace(/[^\w\-]/g, "");
      let headingDuplicateCount = 1;
      while (ids.has(id)) {
        id = `${id}_${headingDuplicateCount++}`;
      }
      ids.add(id);
      outline.push({ id, title, level });
    }
    return outline;
  }

  getLineAndColumnFromOffset(offset: number): { line: number; column: number } {
    let line = 1;
    let column = 1;
    const max = Math.min(Math.max(offset, 0), this._markdown.length);
    for (let i = 0; i < max; i += 1) {
      if (this._markdown[i] === "\n") {
        line += 1;
        column = 1;
      } else {
        column += 1;
      }
    }
    return { line, column };
  }

  private _offsetFromDomPosition(node: Node, offset: number): number {
    if (!this._editor.contains(node)) {
      return 0;
    }

    const range = document.createRange();
    range.setStart(this._editor, 0);
    range.setEnd(node, offset);
    return range.toString().length;
  }

  private _clearSelectionMarkers(): void {
    const spans = this._editor.querySelectorAll(".selection");
    spans.forEach((span) => {
      // Unwrap the text node from the selection span and remove the span from the DOM.
      const parent = span.parentNode;
      if (!parent) {
        return;
      }
      while (span.firstChild) {
        parent.insertBefore(span.firstChild, span);
      }
      parent.removeChild(span);
    });
  }

  private _renderSelectionMarkers(): void {
    this._clearSelectionMarkers();
    const range = this._domRangeFromSelection()
    const textNodes = this._getTextNodesInRange(range);
    // wrap each text node in the selection with a span.selection element to provide visual feedback of the selection when the editor is not focused.
    textNodes.forEach((textNode) => {
      const selectionSpan = document.createElement("span");
      selectionSpan.classList.add("selection");
      textNode.parentNode!.insertBefore(selectionSpan, textNode);
      selectionSpan.appendChild(textNode);
    });
  }

  private _domRangeFromSelection(): Range
  {
    const { start, end } = this._selectionRange;
    this._editor.normalize();
    const treeWalker = document.createTreeWalker(this._editor, NodeFilter.SHOW_TEXT, null);
    let currentOffset = 0;
    const range = this._editor.ownerDocument.createRange();
    while (treeWalker.nextNode()) {
      const node = treeWalker.currentNode as Text;
      const nodeEnd = currentOffset + node.textContent!.length;
      if (start >= currentOffset && start <= nodeEnd) {
        range.setStart(node, start - currentOffset);
      }
      if (end >= currentOffset && end <= nodeEnd) {
        range.setEnd(node, end - currentOffset);
        break;
      }
      currentOffset = nodeEnd;
    }

    return range;
  }

  private _getTextNodesInRange(range: Range): Text[] {

    // Collect all text nodes that intersect with the selection range.
    const textNodes: Text[] = [];
    const treeWalker = document.createTreeWalker(this._editor, NodeFilter.SHOW_TEXT, null);
    while (treeWalker.nextNode()) {
      const node = treeWalker.currentNode as Text;
      if (node.textContent && range.intersectsNode(node)) {
        textNodes.push(node);
      }
    }

    // If no text nodes intersect with the range, return an empty array.
    if (textNodes.length === 0) {
      return textNodes;
    }

    // Split the first node at the start offset.
    if (range.startOffset > 0) {
      textNodes[0] = textNodes[0].splitText(range.startOffset);
    }

    // Split the last node at the end offset.
    const lastNode = textNodes[textNodes.length - 1];
    if(range.endOffset < lastNode.textContent.length) {
      lastNode.splitText(range.endOffset);
    }

    return textNodes;
  }

  _applySelectionMarkers(): void {
    this._renderSelectionMarkers();
  }
}
