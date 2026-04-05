type OffsetRange = { start: number; end: number };
type TextNodeRange = { node: Text; start: number; end: number };
type DomPosition = { node: Text; offset: number };

/**
 * <text-editor> WebComponent
 * 
 * A lightweight contenteditable text editor with offset-based selections.
 * Selection markers provide visual feedback when the editor is not focused.
 */
export class TextEditor extends HTMLElement {
  // Public DOM reference
  editor: HTMLDivElement;

  // Internal text index + selection state
  private _textNodeRanges: TextNodeRange[];
  private _indexedText: string;
  private _selectionRange: OffsetRange | null;
  
  // Private state
  private _value: string;

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    
    // Initialize shadow DOM with editor styles and structure
    this.shadowRoot!.innerHTML = `
      <style>
        :host {
          flex: 1;
          display: flex;
          flex-direction: column;
        }
        .selection {
          background-color: var(--editor-selection-bg, rgba(100, 150, 250, 0.3));
          border-radius: var(--editor-selection-radius, 2px);
          outline: 1px solid #FF0;
        }
        #editor {
          font-family: var(--editor-font-family);
          font-size: var(--editor-font-size);
          line-height: var(--editor-line-height, 1.5);
          padding: var(--editor-padding, 8px);
          white-space: pre-wrap;
          word-wrap: break-word;
          border-radius: var(--input-radius);
          border: var(--input-border);
          color: var(--editor-text-color, #000);
          background-color: var(--editor-bg-color, #fff);
          height: 100%;
          overflow-y: auto;
        }
        #editor:focus {
          outline: none;
          border: var(--input-focus-border);
        }
      </style>
      <div id="editor" contenteditable="true"></div>
    `;
    
    // Cache editor element and initialize state
    this.editor = this.shadowRoot!.getElementById("editor") as HTMLDivElement;
    this._textNodeRanges = [];
    this._indexedText = "";
    this._selectionRange = null;
    this._value = "";
  }

  connectedCallback(): void {
    // Attach event listeners for selection tracking and focus management
    document.addEventListener("selectionchange", this._handleDocSelectionChange);
    this.editor.addEventListener("focus", this._handleEditorFocus);
    this.editor.addEventListener("blur", this._handleEditorBlur);
    this.editor.addEventListener("input", this._handleEditorInput);
  }

  /** Remove event listeners when component is removed from DOM */
  disconnectedCallback(): void {
    document.removeEventListener("selectionchange", this._handleDocSelectionChange);
    this.editor.removeEventListener("focus", this._handleEditorFocus);
    this.editor.removeEventListener("blur", this._handleEditorBlur);
    this.editor.removeEventListener("input", this._handleEditorInput);
  }

  /**
   * EVENT HANDLERS
   */

  /**
   * Called when document selection changes.
   * Saves selection offsets and applies highlight when markers are enabled.
   */
  private _handleDocSelectionChange = (_event: Event): void => {
    this._rebuildTextIndex();
    this._captureSelectionFromDom();

    // if (this._showSelectionMarkers) {
    //   this._renderSelectionMarkers();
    // }

    this.dispatchEvent(new CustomEvent("selection-change", {
      detail: this.getSelection(),
      bubbles: true,
      composed: true
    }));
  };

  /** When editor gains focus: hide selection markers */
  private _handleEditorFocus = (_event: FocusEvent): void => {
    this._clearSelectionMarkers();
  };

  /** When editor loses focus: show selection markers for visual feedback */
  private _handleEditorBlur = (_event: FocusEvent): void => {
    this._renderSelectionMarkers();
  };

  /** When editor content changes: update value and emit change event */
  private _handleEditorInput = (_event: Event): void => {
    // Normalize DOM to merge adjacent text nodes and remove empty ones
    this.editor.normalize();
    console.log("Editor input detected, normalizing content and updating value...");

    // Keep the text buffer in sync with the current editable content.
    this._value = this.editor.textContent || "";

    // Capture current selection
    this._rebuildTextIndex();
    this._captureSelectionFromDom();

    this.dispatchEvent(new CustomEvent("change", {
      detail: { content: this._value },
      bubbles: true,
      composed: true
    }));
  };

  /**
   * PUBLIC API - Content & Selection Management
   */

  /** Get current editor value as plain text */
  get value(): string {
    return this._value;
  }

  /** Set editor value */
  set value(val: string) {
    this._value = val ?? "";
    this.editor.textContent = this._value;
    this._rebuildTextIndex();
    this._selectionRange = { start: 0, end: 0 };
  }

  public setMarkdown(markdown: string): void {
    // For simplicity, we just set the text content directly.
    // A real implementation would parse markdown and create corresponding DOM structure.
    this._value = markdown;
    this.editor.textContent = this._value;
    this._rebuildTextIndex();
    this._selectionRange = { start: 0, end: 0 };
  }

  /**
   * Get current selection as line/column and text offsets.
   */
  getSelection(): {
    text: string;
    start: number;
    end: number;
  } {
    const range = this._selectionRange;
    const text = this._value || "";

    return {
      text: range ? text.slice(range.start, range.end) : "",
      start: range ? range.start : 0,
      end: range ? range.end : 0,
    }
  }

  /** Replace currently selected text with new markdown */
  replaceSelection(text: string): void {
  
    // The DOM structure to used represent markdown text is controlled by the browser's implementation of contenteditable, so we treat the editor content as opaque and rely on innerText for serialization.
    // This means that replacing text is a two-step process: we update our internal value and then re-render the effected content to the DOM.

    const fragment = document.createDocumentFragment();
    const template = document.createElement("template");
    fragment.appendChild(template);
    const rangeToReplace = document.createRange();
    const startPos = this._domPositionFromOffset(this._selectionRange!.start);
    const endPos = this._domPositionFromOffset(this._selectionRange!.end);
    if (startPos && endPos) {
      rangeToReplace.setStart(startPos.node, startPos.offset);
      rangeToReplace.setEnd(endPos.node, endPos.offset);
      rangeToReplace.deleteContents();
      
      rangeToReplace.insertNode(fragment);

    }

    this._value = this.editor.textContent || "";
    this._rebuildTextIndex();

    const nextStart = Math.max(0, Math.min(this._selectionRange!.start, this._value.length));
    this._selectionRange = { start: nextStart, end: nextStart };

    // TODO: if we don't have focus then re-rendering the selection markers is necessary to update their positions.
    // this._renderSelectionMarkers();

    // if (this.editor.matches(":focus")) {
    //   //this._removeSelectionMarkers();
    //   // this._rebuildTextIndex();
    //   // this._restoreSelectionToDom();
    //   return;
    // }

    //this._applySelectionMarkers();
  }

  /** Show visual selection markers */
  _applySelectionMarkers(): void {
    this._renderSelectionMarkers();
  }

  /**
   * INTERNAL HELPERS
   */

  /** Normalize all line endings to \n for stable offsets and snapshots */
  // private _normalizeValue(value: string): string {
  //   return (value ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  // }

  /** Single write path for editor content changes */
  // private _commitValue(value: string): void {
  //   this._value = this._normalizeValue(value);
  //   this.editor.textContent = this._value;
  //   this._rebuildTextIndex();
  // }

  /** Convert rendered editor DOM back to plain text */
  // private _serializeEditorValue(): string {
  //   return this.editor.textContent || "";
  // }

  /** Convert absolute text offset into 1-based line and column numbers */
  _getLineAndColumnFromOffset(offset: number): { line: number; column: number } {
    let line = 1;
    let column = 1;
    const max = Math.min(Math.max(offset, 0), this._indexedText.length);
    for (let i = 0; i < max; i += 1) {
      if (this._indexedText[i] === "\n") {
        line += 1;
        column = 1;
      } else {
        column += 1;
      }
    }
    return { line, column };
  }

  /** Rebuild text-node index for DOM <-> offset conversions */
  private _rebuildTextIndex(): void {
    this._textNodeRanges = [];
    this._indexedText = this.editor.textContent || "";

    const walker = document.createTreeWalker(this.editor, NodeFilter.SHOW_TEXT);
    let node: Text | null;
    let index = 0;

    while ((node = walker.nextNode() as Text | null)) {
      const text = node.nodeValue || "";
      const start = index;
      const end = start + text.length;
      this._textNodeRanges.push({ node, start, end });
      index = end;
    }
  }

  private _offsetFromDomPosition(node: Node, offset: number): number {
    if (!this.editor.contains(node)) {
      return 0;
    }

    const range = document.createRange();
    range.setStart(this.editor, 0);
    range.setEnd(node, offset);
    return range.toString().length;
  }

  private _domPositionFromOffset(offset: number): DomPosition | null {
    const clamped = Math.max(0, Math.min(offset, this._indexedText.length));
    let lastEntry: TextNodeRange | null = null;

    for (const entry of this._textNodeRanges) {
      if (clamped >= entry.start && clamped <= entry.end) {
        return { node: entry.node, offset: clamped - entry.start };
      }

      if (clamped < entry.start) {
        return { node: entry.node, offset: 0 };
      }

      lastEntry = entry;
    }

    if (lastEntry) {
      return { node: lastEntry.node, offset: lastEntry.end - lastEntry.start };
    }

    return null;
  }

  private _captureSelectionFromDom(): void {
    const sel = window.getSelection();
    if (!sel) {
      return;
    }

    const range = sel.getComposedRanges({ shadowRoots: [this.shadowRoot!] })[0];
    if (!range) {
      return;
    }

    // Ignore non-editor selections so switching focus to chat does not clear editor selection context.
    if (!this.editor.contains(range.startContainer) || !this.editor.contains(range.endContainer)) {
      return;
    }

    console.log("Capturing selection from DOM:", range);

    const start = this._offsetFromDomPosition(range.startContainer, range.startOffset);
    const end = this._offsetFromDomPosition(range.endContainer, range.endOffset);

    this._selectionRange = {
      start: Math.min(start, end),
      end: Math.max(start, end)
    };
  }

  // private _restoreSelectionToDom(): void {
  //   if (!this._selectionRange) {
  //     return;
  //   }

  //   const start = this._domPositionFromOffset(this._selectionRange.start);
  //   const end = this._domPositionFromOffset(this._selectionRange.end);
  //   if (!start || !end) {
  //     return;
  //   }

  //   const range = document.createRange();
  //   range.setStart(start.node, start.offset);
  //   range.setEnd(end.node, end.offset);

  //   const sel = window.getSelection();
  //   if (!sel) {
  //     return;
  //   }

  //   sel.removeAllRanges();
  //   sel.addRange(range);
  // }

  private _clearSelectionMarkers(): void {
    const spans = this.editor.querySelectorAll(".selection");
    spans.forEach((span) => {
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
    if (!this._selectionRange) {
      return;
    }

    this._clearSelectionMarkers();
    this._rebuildTextIndex();

    const { start, end } = this._selectionRange;
    for (const entry of this._textNodeRanges) {
      if (entry.end <= start || entry.start >= end) {
        continue;
      }

      const localStart = Math.max(start, entry.start) - entry.start;
      const localEnd = Math.min(end, entry.end) - entry.start;
      if (localStart >= localEnd) {
        continue;
      }

      const range = document.createRange();
      range.setStart(entry.node, localStart);
      range.setEnd(entry.node, localEnd);

      const span = document.createElement("span");
      span.className = "selection";
      range.surroundContents(span);
    }
  }

  /** Hide visual selection markers */
  // private _removeSelectionMarkers(): void {
  //   //this._showSelectionMarkers = false;
  //   //this._clearSelectionMarkers();
  // }
}
