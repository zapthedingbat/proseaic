import { IEditableText } from "../lib/document/editable-text.js";
import { BaseHtmlElement } from "./base-html-element.js";
import { LineType, MdLine, MdSection } from "../lib/markdown/markdown.js";
import { IStructuredDocument } from "../lib/document/structured-document.js";

/**
 * I didn't set out to build a markdown editor, but I needed a way to edit markdown content with a decent UX and some structure (e.g. to support an outline view), so here we are.
 * If this becomes a monster it could potentially be replaced with an existing markdown editor component, but for now it's a minimal component that supports the features
 * I need and gives me control over the editing experience and interface.
 */

export interface EditorSelection {
  text: string;
  start: number;
  end: number;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CaretPos {
  lineIndex: number;
  charOffset: number;
}

// ---------------------------------------------------------------------------
// Inline tokens
// ---------------------------------------------------------------------------

type InlineToken =
  | { t: "text";   s: string }
  | { t: "bold";   syn: string; inner: string }
  | { t: "italic"; syn: string; inner: string }
  | { t: "strike"; syn: string; inner: string }
  | { t: "code";   syn: string; inner: string };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LINE_CLASS: Record<LineType, string> = {
  h1: "mde-h1", h2: "mde-h2", h3: "mde-h3",
  h4: "mde-h4", h5: "mde-h5", h6: "mde-h6",
  blockquote:    "mde-blockquote",
  "fence-open":  "mde-fence-marker",
  "fence-close": "mde-fence-marker",
  "fence-body":  "mde-fence-body",
  "list-ul":     "mde-list-ul",
  "list-ol":     "mde-list-ol",
  hr:            "mde-hr",
  blank:         "",
  paragraph:     "",
};

const TAB_SIZE = 2;
const UL_BULLETS = ["•", "◦", "▪"];

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function classifyLine(raw: string, inFence: boolean): LineType {
  // Inside a fenced code block, all lines are "fence-body" until we see a closing fence.
  if (inFence) return /^```/.test(raw) ? "fence-close" : "fence-body";
  
  // Blank line
  if (!raw.trim()) return "blank";
  
  // Fenced code block
  if (/^```/.test(raw)) return "fence-open";

  // Headings
  const hm = raw.match(/^(#{1,6}) /);
  if (hm) return `h${hm[1].length}` as LineType;
  
  // Blockquote
  if (/^> /.test(raw)) return "blockquote";

  // Lists (check before hr — `---` won't match `^[-*+]\s` but `- item` will)
  if (/^(\s*)[-*+]\s/.test(raw)) return "list-ul";
  if (/^(\s*)\d+\.\s/.test(raw)) return "list-ol";

  // Horizontal rule
  if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(raw)) return "hr";
  
  // Paragraph (default)
  return "paragraph";
}

/**
 * Tokenize inline markdown. Plain characters that don't form a recognised
 * span are accumulated as { t:"text" } tokens.  Unmatched delimiters (e.g.
 * a lone `*` with no closing `*`) are absorbed into surrounding text tokens.
 */
function tokenizeInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let i = 0;
  let textStart = 0;

  const flushText = (end: number) => {
    if (end > textStart) tokens.push({ t: "text", s: text.slice(textStart, end) });
  };

  while (i < text.length) {
    let matched = false;

    if (text.startsWith("**", i)) {
      const end = text.indexOf("**", i + 2);
      if (end !== -1) {
        flushText(i);
        tokens.push({ t: "bold", syn: "**", inner: text.slice(i + 2, end) });
        i = end + 2; textStart = i; matched = true;
      }
    } else if (text.startsWith("~~", i)) {
      const end = text.indexOf("~~", i + 2);
      if (end !== -1) {
        flushText(i);
        tokens.push({ t: "strike", syn: "~~", inner: text.slice(i + 2, end) });
        i = end + 2; textStart = i; matched = true;
      }
    } else if (text[i] === "*") {
      const end = text.indexOf("*", i + 1);
      if (end !== -1) {
        flushText(i);
        tokens.push({ t: "italic", syn: "*", inner: text.slice(i + 1, end) });
        i = end + 1; textStart = i; matched = true;
      }
    } else if (text[i] === "`") {
      const end = text.indexOf("`", i + 1);
      if (end !== -1) {
        flushText(i);
        tokens.push({ t: "code", syn: "`", inner: text.slice(i + 1, end) });
        i = end + 1; textStart = i; matched = true;
      }
    }

    if (!matched) i++;
  }

  flushText(text.length);
  return tokens;
}

/** Render a line-level prefix as mde-syn, then the remaining content as inline tokens. */
function renderWithPrefix(container: Element, prefix: string, raw: string, doc: Document): void {
  if (prefix) {

    // For nested structures like list items, the depth is indicated by multiples of 2 spaces before the marker
    // (e.g. "  - ", or "    - " for a nested list item).  We preserve those spaces in the DOM so that the text content of the line matches the raw markdown exactly.
    // We also want to apply CSS styling to maintain the structural indentation and numbering. For each level of indentation we add a span with the appropriate number of spaces as content and the "mde-syn" class, which hides it visually but keeps it in the text content for selection and copying.
    // This way we can support arbitrary levels of nesting without needing to special-case them in the CSS.

    const depthMatch = prefix.match(/^([ \u00A0]*)(.*)$/);
    const depthSpaces = depthMatch ? depthMatch[1] : "";
    const remainingPrefix = depthMatch ? depthMatch[2] : prefix;

    // Work out the depth as a multiple of TAB_SIZE spaces, so that the indentation levels are visually distinct and consistent regardless of the actual number of spaces used in the markdown.
    const depth = Math.floor(depthSpaces.length / TAB_SIZE);
    for (let i = 0; i < depth; i++) {
      const indent = " ".repeat(TAB_SIZE);
      const syn = doc.createElement("span");
      syn.className = "mde-syn mde-indent";
      syn.textContent = indent;
      container.appendChild(syn);
    }

    const syn = doc.createElement("span");
    syn.className = "mde-syn";
    syn.textContent = remainingPrefix;
    container.appendChild(syn);
  }

  renderTokens(container, tokenizeInline(raw.slice(prefix.length)), doc);
  if (!container.firstChild) container.appendChild(doc.createElement("br"));
}

function renderTokens(container: Element, tokens: InlineToken[], doc: Document): void {
  for (const tok of tokens) {
    if (tok.t === "text") {
      container.appendChild(doc.createTextNode(tok.s));
      continue;
    }
    const span = doc.createElement("span");
    span.className = `mde-${tok.t}`;
    const open = doc.createElement("span");
    open.className = "mde-syn";
    open.textContent = tok.syn;
    const close = doc.createElement("span");
    close.className = "mde-syn";
    close.textContent = tok.syn;
    span.append(open, tok.inner, close);
    container.appendChild(span);
  }
}

/**
 * Count characters from the start of `container` to `targetNode` at
 * `targetOffset`.  Used to save the caret as a plain character offset.
 */
function charOffsetInSubtree(
  container: Node,
  targetNode: Node,
  targetOffset: number,
): number {
  let total = 0;
  const walk = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  while (walk.nextNode()) {
    const n = walk.currentNode as Text;
    if (n === targetNode) return total + targetOffset;
    total += n.length;
  }
  return total;
}

/**
 * Reverse of charOffsetInSubtree: find the text node and local offset that
 * corresponds to a character offset in the subtree.
 */
function nodeAtCharOffset(
  container: Node,
  target: number,
): { node: Node; offset: number } | null {
  let total = 0;
  const walk = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let last: Text | null = null;
  while (walk.nextNode()) {
    const n = walk.currentNode as Text;
    last = n;
    if (total + n.length >= target) return { node: n, offset: target - total };
    total += n.length;
  }
  if (last) return { node: last, offset: last.length };
  return null;
}

/** Split text on \n, stripping trailing \r (Windows line endings). */
function splitOnNewlines(text: string): string[] {
  return text.split("\n").map(l => l.replace(/\r$/, ""));
}

function parseHeading(raw: string): { level: number; title: string } | null {
  const match = raw.match(/^(#{1,6})\s+(.+)$/);
  if (!match) return null;
  return {
    level: match[1].length,
    title: match[2].trim(),
  };
}

function buildModel(lines: MdLine[]): MdSection {
  const root: MdSection = { id: "root", level: 0, headingLine: null, bodyLines: [], children: [] };
  const stack: MdSection[] = [root];
  let nextSectionId = 1;

  for (const line of lines) {
    const hm = line.type.match(/^h([1-6])$/);
    if (hm) {
      const level = parseInt(hm[1]);
      while (stack.length > 1 && stack[stack.length - 1].level >= level) stack.pop();
      const section: MdSection = { id: `section-${nextSectionId++}`, level, headingLine: line, bodyLines: [], children: [] };
      stack[stack.length - 1].children.push(section);
      stack.push(section);
    } else {
      stack[stack.length - 1].bodyLines.push(line);
    }
  }

  return root;
}

// ---------------------------------------------------------------------------
// <markdown-editor> WebComponent
// ---------------------------------------------------------------------------

/**
 * Minimal markdown editor WebComponent.
 *
 * Uses a `contenteditable` div as the editing surface.  On every `input`
 * event `_processDomChange` is called: it saves the caret, reads raw text
 * from each line-div, classifies each line, rebuilds the div content with
 * line-level CSS classes and inline-formatting spans (keeping the raw
 * markdown characters in the DOM so `textContent` always returns the
 * markdown), then restores the caret and updates the internal model.
 *
 * `beforeinput` handles special cases (e.g. Enter inside a fenced block)
 * before the browser mutates the DOM.
 *
 */
export class MarkdownEditor extends BaseHtmlElement implements IEditableText, IStructuredDocument {

  private _editor!: HTMLDivElement;
  private _markdown = "";
  private _model: MdSection = { id: "root", level: 0, headingLine: null, bodyLines: [], children: [] };
  private _processing = false;
  private _activeDiv: HTMLElement | null = null;
  private _overlay: HTMLDivElement;
  // Saved selection offsets (character positions in the markdown string), kept up-to-date on blur
  // so that replaceSelection works even when the editor doesn't have focus.
  private _savedStart = 0;
  private _savedEnd = 0;

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot!.innerHTML = `
      <style>
        :host {
          --editor-line-height: 1.6;
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
          font-family: var(--editor-font-family, Georgia, serif);
          font-size: var(--editor-font-size, 1rem);
          line-height: var(--editor-line-height, 1.6);
          padding: 2em 32px;
          color: var(--editor-text-color, #000);
          background-color: var(--editor-bg-color, #fff);
          box-shadow: var(--editor-box-shadow, 0 0 8px -4px rgba(0,0,0,0.5));
          outline: none;
          cursor: text;
        }

        #overlay {
          position: absolute;
          top: 0; left: 0; right: 0; bottom: 0;
          pointer-events: none;
        }

        .mde {
          min-height: calc(var(--editor-line-height) * 1em);
        }

        /* Line-level types */

        /* Headings */
        .mde-h1 { 
          border-bottom: 2px solid var(--editor-hr-color, #09f);
          font-size: 2em;
          font-weight: bold;
          line-height: 1.2;
          margin-block: 0.25em;
        }

        .mde-h2 { font-size: 1.5em; font-weight: bold; line-height: 1.3; margin-block: 0.25em; }
        .mde-h3 { font-size: 1.25em; font-weight: bold; margin-block: 0.2em; }
        .mde-h4, .mde-h5, .mde-h6 { font-weight: bold; }
        
        /* Blockquote */
        .mde-blockquote {
          border-left: 3px solid #bbb;
          padding-left: 0.75em;
          color: #555;
          font-style: italic;
        }
        
        /* Horizontal rule */
        .mde-hr {
          color: transparent;
          text-align: center;
          position: relative;
        }
        .mde-hr::before {
          content: "";
          border-top: 2px solid var(--editor-hr-color, #09f);
          opacity: 1;
          width: 100%;
          position: absolute;
          top: 50%;
          display: block;
        }
        .mde-active.mde-hr {
          color: inherit;
        }
        .mde-active.mde-hr::before {
          opacity: 0;
        }

        /* Lists */
        .mde-list-ul,
        .mde-list-ol {
          margin-left: 2em;
          display: list-item;
          margin-inline-start: calc(var(--mde-list-depth, 0) * 1em);
        }
        .mde-list-ul::marker,
        .mde-list-ol::marker {
        }
        .mde-list-ul::marker {
          content: var(--mde-list-bullet, "•");
        }
        
        .mde-list-ol::marker {
          content: attr(data-list-index) ".";
        }

        .mde-active.mde-list-ul,
        .mde-active.mde-list-ol {
          
        }


        /* Fenced code blocks */
        .mde-fence-marker {
          color: transparent;
          min-height: 20px;
          background-repeat: repeat-x;
          background-size: 100px 20px;
        }
        .mde-fence-marker.mde-active {
          color: inherit;
        }
        .mde-fence-marker:not(:has(+ .mde-fence-body)) {
          background-position: top;
          background-image: url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 20'><path d='M0,10 Q10,7 20,10 T40,9 T60,11 T80,10 T100,10 V0 H0 Z' fill='%23eee'/></svg>");
          border-radius: 4px 4px 0 0;
        }
        .mde-fence-marker:has(+ .mde-fence-body) {
          background-position: bottom;
          background-image: url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 20'><path d='M0,10 Q10,7 20,10 T40,9 T60,11 T80,10 T100,10 V20 H0 Z' fill='%23eee'/></svg>");
          border-radius: 0 0 4px 4px;
        }
        .mde-fence-body {
          font-family: monospace;
          font-size: 0.88em;
          background: #eee;
          padding: 0 1em;
          white-space: pre;
          overflow-x: auto;
        }
        .mde-fence-body:not(.mde-fence-body + .mde-fence-body) {
          padding-top: 0.5em;
        }
        .mde-fence-body:not(:has(+ .mde-fence-body)) {
          padding-bottom: 0.5em;
        }

        /* Inline types */
        .mde-bold   { font-weight: bold; }
        .mde-italic { font-style: italic; }
        .mde-strike { text-decoration: line-through; }
        .mde-code   {
          display: inline-block;
          font-family: monospace;
          font-size: 0.88em;
          background: #eee;
          border-radius: 3px;
          padding: 0 0.25em;
        }

        .mde-active .mde-code {
          display: inline;
        }

        .mde-indent {
          /* invisible spacer spans used to preserve indentation in nested lists */
          white-space: pre;
          white-space-collapse: preserve;
        }

        /* Syntax characters: hidden by default, revealed on the active line */
        .mde-syn {
          display: inline-block;
          opacity: 0;
          max-width: 0;
        }
        
        .mde-active .mde-syn {
          display: inline;
          opacity: 0.5;
          max-width: none;
        }

      </style>
      <div id="editor" contenteditable="true" spellcheck="true"></div>
      <div id="overlay"></div>
    `;
    this._editor = this.shadowRoot!.getElementById("editor") as HTMLDivElement;
    this._overlay = this.shadowRoot!.getElementById("overlay") as HTMLDivElement;
    this._initEmptyLine();
  }
  
  insertSection(
    sectionTitle: string,
    sectionContent: string,
    insertBeforeSectionId?: string,
  ): void {
    const before = insertBeforeSectionId ? this._findSectionNode(insertBeforeSectionId) : null;
    const defaultLevel = before?.section.level ?? 2;
    const section = this._createSection(sectionTitle, sectionContent, defaultLevel);
    if (!section) return;

    if (before) {
      before.parent.children.splice(before.index, 0, section);
    } else {
      this._model.children.push(section);
    }

    this._rebuildFromModel();
  }

  moveSection(sectionId: string, insertBeforeSectionId?: string): void {
    const found = this._findSectionNode(sectionId);
    if (!found) return;

    if (insertBeforeSectionId && insertBeforeSectionId === found.section.id) {
      return;
    }

    const movingSection = found.section;
    found.parent.children.splice(found.index, 1);

    if (insertBeforeSectionId) {
      const before = this._findSectionNode(insertBeforeSectionId);
      if (before) {
        before.parent.children.splice(before.index, 0, movingSection);
      } else {
        this._model.children.push(movingSection);
      }
    } else {
      this._model.children.push(movingSection);
    }

    this._rebuildFromModel();
  }

  removeSection(sectionId: string): void {
    const found = this._findSectionNode(sectionId);
    if (!found) return;

    found.parent.children.splice(found.index, 1);
    this._rebuildFromModel();
  }

  replaceSection(sectionId: string, sectionContent: string): void {
    const found = this._findSectionNode(sectionId);
    if (!found) return;

    const rawLines = sectionContent ? splitOnNewlines(sectionContent) : [];
    found.section.bodyLines = this._classifyLines(rawLines);
    this._rebuildFromModel();
  }

  getSectionContent(sectionId: string): string {
    const found = this._findSectionNode(sectionId);
    if (!found) return "";
    return found.section.bodyLines.map(line => line.raw).join("\n");
  }

  private _createSection(sectionTitle: string, sectionContent: string, defaultLevel: number): MdSection | null {
    const parsedHeading = parseHeading(sectionTitle.trim());
    const headingLevel = Math.max(1, Math.min(6, parsedHeading?.level ?? defaultLevel));
    const headingText = parsedHeading?.title ?? sectionTitle.replace(/^#{1,6}\s+/, "").trim();
    if (!headingText) return null;

    const headingLine: MdLine = {
      type: `h${headingLevel}` as LineType,
      raw: `${"#".repeat(headingLevel)} ${headingText}`,
    };

    const rawLines = sectionContent ? splitOnNewlines(sectionContent) : [];
    return {
      id: "new-section",
      level: headingLevel,
      headingLine,
      bodyLines: this._classifyLines(rawLines),
      children: [],
    };
  }

  private _findSectionNode(sectionId: string): { section: MdSection; parent: MdSection; index: number } | null {
    const walk = (parent: MdSection): { section: MdSection; parent: MdSection; index: number } | null => {
      for (let i = 0; i < parent.children.length; i++) {
        const section = parent.children[i];

        if (section.id === sectionId) {
          return { section, parent, index: i };
        }

        const nested = walk(section);
        if (nested) return nested;
      }
      return null;
    };

    return walk(this._model);
  }

  private _rebuildFromModel(): void {
    const rawLines = this._modelToRawLines();
    const mdLines = this._classifyLines(rawLines);

    this._markdown = rawLines.join("\n");
    this._model = buildModel(mdLines);

    this._processing = true;
    this._renderDom(mdLines, null);
    this._processing = false;

    this._emitChange();
  }

  private _modelToRawLines(): string[] {
    const lines: string[] = [];
    lines.push(...this._model.bodyLines.map(line => line.raw));

    const appendSection = (section: MdSection): void => {
      if (section.headingLine) lines.push(section.headingLine.raw);
      lines.push(...section.bodyLines.map(line => line.raw));
      section.children.forEach(appendSection);
    };

    this._model.children.forEach(appendSection);
    return lines;
  }

  // ---- Lifecycle ----

  connectedCallback(): void {
    this._editor.addEventListener("beforeinput", this._onBeforeInput);
    this._editor.addEventListener("input", this._onInput);
    this._editor.addEventListener("paste", this._onPaste);
    this._editor.addEventListener("focus", this._onFocus);
    this._editor.addEventListener("blur",  this._onBlur);
    document.addEventListener("selectionchange", this._onSelectionChange);
  }

  disconnectedCallback(): void {
    this._editor.removeEventListener("beforeinput", this._onBeforeInput);
    this._editor.removeEventListener("input", this._onInput);
    this._editor.removeEventListener("paste", this._onPaste);
    this._editor.removeEventListener("focus", this._onFocus);
    this._editor.removeEventListener("blur",  this._onBlur);
    document.removeEventListener("selectionchange", this._onSelectionChange);
  }

  // ---- Public API ----

  get markdown(): string { return this._markdown; }

  setMarkdown(md: string): void {
    this._markdown = md;
    const lines = this._classifyLines(md.split("\n"));
    this._model = buildModel(lines);
    this._processing = true;
    this._renderDom(lines, null);
    this._processing = false;
  }

  /** Return the currently selected text and its character offsets. */
  getSelection(): EditorSelection {
    const sel = document.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
      return { text: "", start: 0, end: 0 };
    }
    const range = sel.getRangeAt(0);
    const text  = range.toString();
    // Compute absolute offsets over the full markdown string
    let start = 0;
    let end   = 0;
    const divs = Array.from(this._editor.children);
    let pos = 0;
    for (let i = 0; i < divs.length; i++) {
      if (i > 0) pos++; // newline between lines
      if (divs[i].contains(range.startContainer)) {
        start = pos + charOffsetInSubtree(divs[i], range.startContainer, range.startOffset);
      }
      if (divs[i].contains(range.endContainer)) {
        end = pos + charOffsetInSubtree(divs[i], range.endContainer, range.endOffset);
      }
      pos += (divs[i].textContent ?? "").length;
    }
    return { text, start, end };
  }

  getOutline(): MdSection {
    return this._model;
  }

  /** Return the section outline as a typed array for the outline panel. */
  // getOutlineItems(): OutlineItem[] {
  //   const convert = (sections: MdSection[]): OutlineItem[] =>
  //     sections.map(s => ({
  //       level: s.level,
  //       title: (s.headingLine?.raw ?? "").replace(/^#{1,6}\s+/, ""),
  //       children: convert(s.children),
  //     }));
  //   return convert(this._model.children);
  // }

  // /** Return the section outline as a plain JSON-serializable array. */
  // getDocumentOutline(): JSONValue[] {
  //   const convert = (sections: MdSection[]): JSONValue[] =>
  //     sections.map(s => {
  //       const item: Record<string, JSONValue> = {
  //         level:    s.level,
  //         heading:  s.headingLine?.raw ?? "",
  //         children: convert(s.children),
  //       };
  //       return item;
  //     });
  //   return convert(this._model.children);
  // }

  /** Replace the current selection with `text`. */
  replaceSelection(text: string): void {
    const sel = document.getSelection();
    const liveRange = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;

    if (liveRange && this._editor.contains(liveRange.startContainer)) {
      liveRange.deleteContents();
      liveRange.insertNode(document.createTextNode(text));
      liveRange.collapse(false);
      sel!.removeAllRanges();
      sel!.addRange(liveRange);
      this._processDomChange();
      const updated = this.getSelection();
      this._savedStart = updated.start;
      this._savedEnd = updated.end;
    } else {
      // Editor doesn't have focus — insert at the saved selection offsets
      const before = this._markdown.slice(0, this._savedStart);
      const after = this._markdown.slice(this._savedEnd);
      this._savedStart = this._savedStart + text.length;
      this._savedEnd = this._savedStart;
      this.setMarkdown(before + text + after);
    }
  }

  // ---- Event handlers ----

  private _onFocus = (_e: FocusEvent): void => {
    this._clearSelectionMarkers();
  };

  private _onBlur = (_e: FocusEvent): void => {
    this._renderSelectionMarkers();
    this._setActiveLineDivs(null);
  };

  private _onSelectionChange = (): void => {
    const sel = window.getSelection();
    if (!sel) {
      this._setActiveLineDivs(null);
      return;
    }
    // getComposedRanges is required to read selections inside a shadow root
    const composedRange = sel.getComposedRanges({ shadowRoots: [this.shadowRoot!] })[0];
    if (!composedRange) {
      this._setActiveLineDivs(null);
      return;
    }
    const anchor = composedRange.startContainer;

    // Update saved selection offsets whenever the selection is inside the editor
    if (this._editor.contains(anchor) && this._editor.contains(composedRange.endContainer)) {
      const start = this._offsetFromDomPosition(composedRange.startContainer, composedRange.startOffset);
      const end   = this._offsetFromDomPosition(composedRange.endContainer,   composedRange.endOffset);
      this._savedStart = Math.min(start, end);
      this._savedEnd   = Math.max(start, end);
    }

    const divs = Array.from(this._editor.children) as HTMLElement[];
    const active = divs.find(d => d.contains(anchor)) ?? null;
    // Skip if the active line div hasn't changed — avoids redundant DOM writes
    // on every keystroke (the caret stays in the same div as the user types).
    if (active === this._activeDiv) return;
    this._setActiveLineDivs(active, divs);
  };

  /** Apply mde-active to the line(s) that should show their syntax markers. */
  private _setActiveLineDivs(
    activeDiv: HTMLElement | null,
    divs: HTMLElement[] = Array.from(this._editor.children) as HTMLElement[],
  ): void {
    this._activeDiv = activeDiv;
    divs.forEach(d => d.classList.remove("mde-active"));
    if (!activeDiv) return;

    const isFenceLine = (d: HTMLElement) =>
      d.classList.contains("mde-fence-body") ||
      d.classList.contains("mde-fence-marker");

    if (isFenceLine(activeDiv)) {
      // Activate the whole contiguous fence block so open/close markers
      // are always visible together with the body.
      const idx = divs.indexOf(activeDiv);
      let start = idx;
      let end   = idx;
      while (start > 0 && isFenceLine(divs[start - 1])) start--;
      while (end < divs.length - 1 && isFenceLine(divs[end + 1])) end++;
      divs.slice(start, end + 1).forEach(d => d.classList.add("mde-active"));
    } else {
      activeDiv.classList.add("mde-active");
    }
  }

  private _onBeforeInput = (e: InputEvent): void => {
    // When pressing Enter inside a fence-body line we want to stay in the
    // fence. The browser will create a new div and _processDomChange will
    // re-classify it, so no special action is needed here.
    // This hook is reserved for future cases where we must preventDefault().
    void e;
  };

  private _onInput = (_e: Event): void => {
    // Debounce DOM changes until the user stops typing for a moment, to avoid
    // excessive re-processing on every keystroke.

    const DEBOUNCE_DELAY = 250; // ms
    if (this._processing){
      return; // already scheduled or processing
    }

    this._processing = true;
    setTimeout(() => {
      this._processDomChange();
      this._processing = false;
    }, DEBOUNCE_DELAY);
  };

  private _onPaste = (e: ClipboardEvent): void => {
    e.preventDefault();
    const text = e.clipboardData?.getData("text/plain") ?? "";
    if (!text) return;
    const sel = document.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    range.deleteContents();
    range.insertNode(document.createTextNode(text));
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
    this._processDomChange();
  };

  // ---- Core: DOM → model sync ----

  /**
   * Called after every DOM mutation.
   * Saves the caret, reads raw text, rebuilds the DOM with proper classes and
   * inline spans, restores the caret, then updates the markdown string and
   * structured model.
   */

  private _processDomChange(): void {

    const caretPos = this._saveCaretPos();
    const rawLines = this._extractRawLines();
    const mdLines  = this._classifyLines(rawLines);

    this._processing = true;
    this._renderDom(mdLines, caretPos);
    this._processing = false;

    // Re-apply mde-active synchronously after the DOM rebuild so the active
    // line never loses its class between the innerHTML wipe and the next
    // selectionchange event (which is async and would cause a flash).
    if (caretPos !== null) {
      const divs = Array.from(this._editor.children) as HTMLElement[];
      const activeDiv = divs[caretPos.lineIndex] ?? null;
      this._setActiveLineDivs(activeDiv, divs);
    }

    this._markdown = rawLines.join("\n");
    this._model    = buildModel(mdLines);
    this._emitChange();
  }

  /**
   * Read one raw text string per line from the current (possibly messy) DOM.
   *
   * The canonical structure is one <div> per line, which is what
   * contenteditable produces after the first Enter and what _renderDom
   * always writes.  However the DOM may be messy between a user keystroke
   * and the next _processDomChange call: the browser may have inserted \n
   * text nodes, <br> elements, or given a div textContent that contains \n.
   *
   * Rule: every \n — regardless of where it appears — is a line separator.
   */
  private _extractRawLines(): string[] {
    const children = Array.from(this._editor.childNodes);
    if (children.length === 0) return [""];

    const hasDivs = children.some(n => n.nodeName === "DIV");

    if (!hasDivs) {
      // Before the first Enter: editor has only text/inline nodes.
      // Split on \n so pasted multi-line content is handled correctly.
      return splitOnNewlines(this._editor.textContent ?? "");
    }

    const lines: string[] = [];
    for (const node of children) {
      if (node.nodeName === "DIV") {
        // Each div is one logical line, but its textContent might contain \n
        // (browser quirk or paste into an existing line).
        splitOnNewlines((node as HTMLElement).textContent ?? "")
          .forEach(l => lines.push(l));
      } else if (node.nodeType === Node.TEXT_NODE) {
        // Stray text node between divs — treat \n as a line break.
        splitOnNewlines((node as Text).data).forEach(l => lines.push(l));
      }
    }

    return lines.length > 0 ? lines : [""];
  }

  private _classifyLines(rawLines: string[]): MdLine[] {
    let inFence = false;
    return rawLines.map(raw => {
      const type = classifyLine(raw, inFence);
      if (type === "fence-open")  inFence = true;
      if (type === "fence-close") inFence = false;
      return { type, raw };
    });
  }

  // ---- DOM rendering ----

  /**
   * Rebuild the editor DOM from classified lines.
   * Each line becomes one <div> with:
   *  - a class from LINE_CLASS (if non-empty)
   *  - inline spans for bold/italic/code/strike (raw syntax chars included)
   *  - a <br> placeholder for blank/empty lines
   *
   * Raw markdown characters are always present as text nodes so that
   * textContent of each div equals the raw markdown line.
   */
  private _renderDom(lines: MdLine[], caretPos: CaretPos | null): void {
    const doc = this._editor.ownerDocument;
    
    // Note: Ideally I would like to reuse existing divs and just update their content to avoid disrupting the caret,
    // but in practice it's simpler and more robust to just wipe and rebuild the whole DOM on every change, since we save and restore the caret separately.
    // Modern browsers can handle this without noticeable performance issues for typical document sizes.

    this._editor.innerHTML = "";

    // Tracks ordered-list counter per nesting depth across consecutive ol items.
    // Truncated when depth decreases; reset entirely on any non-list line.
    const olCounters: number[] = [];

    for (const line of lines) {
      const div = doc.createElement("div");
      const cls = LINE_CLASS[line.type];
      div.className = `mde ${cls || ""}`;

      if (line.type !== "list-ul" && line.type !== "list-ol") olCounters.length = 0;

      if (line.type === "blank") {
        div.appendChild(doc.createElement("br"));
      } else if (
        line.type === "fence-open"  ||
        line.type === "fence-close" ||
        line.type === "fence-body"  ||
        line.type === "hr"
      ) {
        // No inline formatting in these line types
        div.textContent = line.raw;
      } else if (line.type === "list-ul" || line.type === "list-ol") {
        const depthMatch = line.raw.match(/^( *)/);
        const depth = depthMatch ? Math.floor(depthMatch[1].length / TAB_SIZE) : 0;
        div.dataset.listDepth = String(depth);
        div.style.setProperty("--mde-list-depth", String(depth));

        if (line.type === "list-ul") {
          const bullet = UL_BULLETS[Math.min(depth, UL_BULLETS.length - 1)];
          div.style.setProperty("--mde-list-bullet", `"${bullet}"`);
        } else if (line.type === "list-ol") {
          // Truncate sub-counters when returning to a shallower depth, then increment.
          if (olCounters.length > depth + 1) olCounters.length = depth + 1;
          olCounters[depth] = (olCounters[depth] ?? 0) + 1;
          div.dataset.listIndex = olCounters.slice(0, depth + 1).join(".");
        }

        // Render marker (e.g. "- " or "1. ") as de-emphasised syntax, then
        // apply inline formatting to the rest of the content.
        const markerMatch = line.raw.match(/^(\s*[-*+]\s+|\s*\d+\.\s+)/);
        renderWithPrefix(div, markerMatch ? markerMatch[1] : "", line.raw, doc);
      } else if (line.type === "blockquote") {
        // Render the "> " leader as syntax, rest as inline.
        const bqMatch = line.raw.match(/^(>\s+)/);
        renderWithPrefix(div, bqMatch ? bqMatch[1] : "", line.raw, doc);
      } else if (line.type.match(/^h[1-6]$/)) {
        // Render the "## " prefix as syntax, rest as inline.
        const hMatch = line.raw.match(/^(#{1,6}\s+)/);
        renderWithPrefix(div, hMatch ? hMatch[1] : "", line.raw, doc);
      } else {
        renderTokens(div, tokenizeInline(line.raw), doc);
        if (!div.firstChild) div.appendChild(doc.createElement("br"));
      }

      this._editor.appendChild(div);
    }

    if (caretPos) this._restoreCaretPos(caretPos);
  }

  // ---- Caret persistence ----

  /**
   * Save the caret as { lineIndex, charOffset } so it survives a full DOM
   * rebuild.  charOffset is counted over the text nodes of the line div.
   */
  private _saveCaretPos(): CaretPos | null {
    const sel = document.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    const divs = Array.from(this._editor.children);

    for (let i = 0; i < divs.length; i++) {
      if (divs[i].contains(range.startContainer)) {
        return {
          lineIndex:  i,
          charOffset: charOffsetInSubtree(divs[i], range.startContainer, range.startOffset),
        };
      }
    }
    return null;
  }

  /**
   * Restore the caret from a saved CaretPos after the DOM has been rebuilt.
   */
  private _restoreCaretPos(pos: CaretPos): void {
    const divs = Array.from(this._editor.children);
    const div  = divs[Math.min(pos.lineIndex, divs.length - 1)];
    if (!div) return;

    const target = nodeAtCharOffset(div, pos.charOffset) ?? { node: div, offset: 0 };

    try {
      const range = document.createRange();
      range.setStart(target.node, target.offset);
      range.collapse(true);
      const sel = document.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    } catch {
      // Ignore DOMException for out-of-range positions
    }
  }

  // ---- Selection markers ----

  private _renderSelectionMarkers(): void {
    this._clearSelectionMarkers();
    if (this._savedStart === this._savedEnd) return; // nothing selected
    const range = this._domRangeFromSelection();
    const textNodes = this._getTextNodesInRange(range);
    textNodes.forEach(node => {
      const span = this._editor.ownerDocument.createElement("span");
      span.className = "selection";
      node.parentNode!.insertBefore(span, node);
      span.appendChild(node);
    });
  }

  private _clearSelectionMarkers(): void {
    this._editor.querySelectorAll("span.selection").forEach(span => {
      const parent = span.parentNode;
      if (!parent) return;
      while (span.firstChild) parent.insertBefore(span.firstChild, span);
      parent.removeChild(span);
    });
  }

  /** Build a DOM Range from the saved character-offset selection. */
  private _domRangeFromSelection(): Range {
    const { _savedStart: start, _savedEnd: end } = this;
    const walker = document.createTreeWalker(this._editor, NodeFilter.SHOW_TEXT, null);
    let pos = 0;
    const range = this._editor.ownerDocument.createRange();
    let startSet = false;
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const text = node as Text;
      const len = text.length;
      if (!startSet && pos + len >= start) {
        range.setStart(text, start - pos);
        startSet = true;
      }
      if (startSet && pos + len >= end) {
        range.setEnd(text, end - pos);
        break;
      }
      pos += len;
    }
    return range;
  }

  /** Return the text nodes intersecting `range`, split so they exactly cover the selection. */
  private _getTextNodesInRange(range: Range): Text[] {
    const nodes: Text[] = [];
    const walker = document.createTreeWalker(this._editor, NodeFilter.SHOW_TEXT, null);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      if (range.intersectsNode(node as Text)) nodes.push(node as Text);
    }
    if (nodes.length === 0) return nodes;

    const first = nodes[0];
    const last  = nodes[nodes.length - 1];
    const startOffset = first === range.startContainer ? range.startOffset : 0;
    const endOffset   = last  === range.endContainer   ? range.endOffset   : last.length;

    // Split end before start so that startOffset is still valid relative to first
    if (endOffset < last.length) last.splitText(endOffset);
    if (startOffset > 0) nodes[0] = first.splitText(startOffset);

    return nodes;
  }

  /** Character offset of a DOM position from the start of the editor content. */
  private _offsetFromDomPosition(node: Node, offset: number): number {
    if (!this._editor.contains(node)) return 0;
    const range = document.createRange();
    range.setStart(this._editor, 0);
    range.setEnd(node, offset);
    return range.toString().length;
  }

  // ---- Misc ----

  private _initEmptyLine(): void {
    const div = this._editor.ownerDocument.createElement("div");
    div.appendChild(this._editor.ownerDocument.createElement("br"));
    this._editor.appendChild(div);
  }

  private _emitChange(): void {
    this.dispatchEvent(new CustomEvent("change", {
      detail: { markdown: this._markdown, model: this._model },
      bubbles: true,
      composed: true,
    }));
  }
}
