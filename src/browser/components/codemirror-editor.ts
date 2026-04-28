import { EditorState, StateEffect, StateField, RangeSetBuilder, Extension } from "@codemirror/state";
import { EditorView, Decoration, DecorationSet, WidgetType, ViewPlugin, ViewUpdate, keymap, drawSelection } from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import { syntaxHighlighting, HighlightStyle, syntaxTree } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { IEditorComponent } from "../lib/editor-component.js";
import { DocumentOutline } from "../lib/document/document-outline.js";
import { AiInlineCompletionService, IInlineCompletionService } from "../lib/completion/inline-completion-service.js";

// ---------------------------------------------------------------------------
// Ghost text completion
// ---------------------------------------------------------------------------

interface GhostTextState { text: string | null; pos: number; }

const setGhostText = StateEffect.define<GhostTextState>();

const ghostTextField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setGhostText)) {
        if (!effect.value.text) return Decoration.none;
        return Decoration.set([ghostWidget(effect.value.pos, effect.value.text)]);
      }
    }
    // Any real document change clears ghost text
    if (tr.docChanged) return Decoration.none;
    return deco.map(tr.changes);
  },
  provide: f => EditorView.decorations.from(f),
});

class GhostTextWidget extends WidgetType {
  constructor(readonly text: string) { super(); }
  toDOM() {
    const span = document.createElement("span");
    span.style.cssText = "opacity:0.4;pointer-events:none;user-select:none;white-space:pre-wrap;";
    span.textContent = this.text;
    return span;
  }
  ignoreEvent() { return true; }
}

function ghostWidget(pos: number, text: string) {
  return Decoration.widget({ widget: new GhostTextWidget(text), side: 1 }).range(pos);
}

// ---------------------------------------------------------------------------
// Document-style markdown rendering
// ---------------------------------------------------------------------------

// Style inline marks: **bold**, _italic_, `code`
const markdownHighlightStyle = HighlightStyle.define([
  { tag: tags.strong,               fontWeight: "bold" },
  { tag: tags.emphasis,             fontStyle: "italic" },
  { tag: tags.monospace,            fontFamily: "monospace", fontSize: "0.9em",
                                    background: "rgba(0,0,0,0.06)", borderRadius: "3px", padding: "0 0.2em" },
  // Dim syntax markers (##, **, _, `, >, -, etc.) so content stands out
  { tag: tags.processingInstruction, color: "#aaa" },
  { tag: tags.punctuation,          color: "#bbb" },
]);

// Apply font-size line decorations to heading lines by walking the syntax tree
function buildHeadingDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  syntaxTree(view.state).iterate({
    enter(node) {
      const m = node.name.match(/^ATXHeading(\d)$/);
      if (m) {
        const line = view.state.doc.lineAt(node.from);
        builder.add(line.from, line.from, Decoration.line({ class: `cm-md-h${m[1]}` }));
      } else if (node.name === "HorizontalRule") {
        const line = view.state.doc.lineAt(node.from);
        builder.add(line.from, line.from, Decoration.line({ class: "cm-md-hr" }));
      }
    },
  });
  return builder.finish();
}

const headingDecorations = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) { this.decorations = buildHeadingDecorations(view); }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildHeadingDecorations(update.view);
      }
    }
  },
  { decorations: v => v.decorations },
);

// ---------------------------------------------------------------------------
// Syntax mark hiding: hide **,_,`,#,> etc. unless cursor is inside the node
// ---------------------------------------------------------------------------

const SYNTAX_MARK_NODES = new Set([
  "HeaderMark", "EmphasisMark", "CodeMark", "QuoteMark", "ListMark",
]);

function buildSyntaxHideDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const { from: selFrom, to: selTo } = view.state.selection.main;

  syntaxTree(view.state).iterate({
    enter(node) {
      if (!SYNTAX_MARK_NODES.has(node.name)) return;
      const parent = node.node.parent;
      // Show the mark if cursor/selection overlaps the parent node's range
      if (parent && selFrom <= parent.to && selTo >= parent.from) return;
      // For HeaderMark, also consume the trailing space so heading text isn't indented
      if (node.name === "HeaderMark") {
        const next = view.state.doc.sliceString(node.to, node.to + 1);
        builder.add(node.from, next === " " ? node.to + 1 : node.to, Decoration.replace({}));
      } else {
        builder.add(node.from, node.to, Decoration.replace({}));
      }
    },
  });

  return builder.finish();
}

const syntaxHiding = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) { this.decorations = buildSyntaxHideDecorations(view); }
    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = buildSyntaxHideDecorations(update.view);
      }
    }
  },
  { decorations: v => v.decorations },
);

// ---------------------------------------------------------------------------
// Link rendering: [text](url) → styled span when cursor is outside the node
// ---------------------------------------------------------------------------

function buildLinkDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const { from: selFrom, to: selTo } = view.state.selection.main;

  syntaxTree(view.state).iterate({
    enter(node) {
      if (node.name !== "Link") return;
      // Cursor inside: show raw markdown, don't descend
      if (selFrom <= node.to && selTo >= node.from) return false;

      // LinkMark children are [ ] ( ) in document order
      const marks = node.node.getChildren("LinkMark");
      if (marks.length < 2) return false;
      const textFrom = marks[0]!.to;    // after `[`
      const textTo   = marks[1]!.from;  // before `]`

      builder.add(node.from, textFrom, Decoration.replace({}));
      if (textFrom < textTo) {
        builder.add(textFrom, textTo, Decoration.mark({ class: "cm-md-link" }));
      }
      builder.add(textTo, node.to, Decoration.replace({}));

      return false; // children already handled
    },
  });

  return builder.finish();
}

const linkRendering = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) { this.decorations = buildLinkDecorations(view); }
    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = buildLinkDecorations(update.view);
      }
    }
  },
  { decorations: v => v.decorations },
);

// ---------------------------------------------------------------------------
// Section helpers (string-based since CM doc is plain text)
// ---------------------------------------------------------------------------

interface Section {
  id: string;
  level: number;       // 0 = root preamble, 1–6 = heading level
  heading: string;     // full heading line e.g. "## Title"
  body: string;        // content after heading, not including heading line
  startLine: number;   // 0-based line index of heading (or 0 for root)
}

function splitIntoSections(content: string): Section[] {
  const lines = content.split("\n");
  const sections: Section[] = [];
  let id = "root";
  let level = 0;
  let heading = "";
  let bodyLines: string[] = [];
  let startLine = 0;
  let hCount = 0;
  let inFence = false;

  const flush = () => sections.push({ id, level, heading, body: bodyLines.join("\n"), startLine });

  lines.forEach((line, i) => {
    if (/^```/.test(line)) inFence = !inFence;
    const hm = !inFence ? line.match(/^(#{1,6})\s/) : null;
    if (hm) {
      flush();
      id = `heading-${hCount++}`;
      level = hm[1].length;
      heading = line;
      bodyLines = [];
      startLine = i;
    } else {
      bodyLines.push(line);
    }
  });
  flush();
  return sections;
}

function reassemble(sections: Section[]): string {
  const parts: string[] = [];
  for (const s of sections) {
    if (s.level === 0) {
      if (s.body) parts.push(s.body);
    } else {
      parts.push(s.heading);
      if (s.body) parts.push(s.body);
    }
  }
  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// <codemirror-editor> WebComponent
// ---------------------------------------------------------------------------

export class CodeMirrorEditor extends HTMLElement implements IEditorComponent {
  
  private _view: EditorView | null = null;
  private _pendingContent = "";
  private _settingContent = false;
  private _completionService: IInlineCompletionService | null = null;
  private _completionAbortController: AbortController | null = null;
  private _completionDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }
  
  set completionService(completionService: AiInlineCompletionService) {
    this._completionService = completionService;
  }

  connectedCallback(): void {
    this.shadowRoot!.innerHTML = `
      <style>
        :host {
          flex: 1;
          display: flex;
          justify-content: center;
          overflow: auto;
          align-items: start;
          padding: 24px 16px;
          box-sizing: border-box;
        }

        #editor-wrap {
          display: flex;
          width: 100%;
          max-width: 1024px;
          min-height: 100%;
          box-sizing: border-box;
        }

        #paper {
          background-color: var(--editor-bg-color, #fff);
          box-shadow: var(--editor-box-shadow, 0 0 8px -4px rgba(0,0,0,0.5));
          color: var(--editor-text-color, #000);
          flex-grow: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .cm-editor {
          flex-grow: 1;
          font-family: var(--editor-font-family, Georgia, serif);
          font-size: var(--editor-font-size, 1rem);
          line-height: var(--editor-line-height, 1.6);
        }

        .cm-editor.cm-focused { outline: none; }
        .cm-content { white-space: pre-wrap; word-break: break-word; }
        .cm-selectionBackground { background: #b3d4fd !important; }

        /* Heading line sizes (applied as line decorations via syntax tree) */
        .cm-md-h1 { font-size: 2em; font-weight: bold; line-height: 1.3; border-bottom: 2px solid var(--editor-hr-color, #09f); margin-bottom: 0.1em; }
        .cm-md-h2 { font-size: 1.5em; font-weight: bold; line-height: 1.3; }
        .cm-md-h3 { font-size: 1.25em; font-weight: bold; }
        .cm-md-h4, .cm-md-h5, .cm-md-h6 { font-weight: bold; }

        /* Horizontal rule */
        .cm-md-hr { color: #bbb; border-bottom: 2px solid #ccc; padding-bottom: 0.2em; }
      </style>
      <div id="editor-wrap">
        <div id="paper">
          <div id="cm-mount"></div>
        </div>
      </div>
    `;

    const mount = this.shadowRoot!.querySelector("#cm-mount") as HTMLElement;

    const extensions: Extension[] = [
      EditorView.lineWrapping,
      history(),
      drawSelection(),
      markdown(),
      syntaxHighlighting(markdownHighlightStyle),
      headingDecorations,
      syntaxHiding,
      linkRendering,
      ghostTextField,
      keymap.of([
        // Accept ghost text with Tab
        {
          key: "Tab",
          run: (view) => {
            const deco = view.state.field(ghostTextField);
            let ghostText: string | null = null;
            let ghostPos = -1;
            deco.between(0, view.state.doc.length, (from, _to, d: Decoration) => {
              if (d.spec?.widget instanceof GhostTextWidget) {
                ghostText = (d.spec.widget as GhostTextWidget).text;
                ghostPos = from;
              }
            });
            if (!ghostText) return false;
            view.dispatch({
              changes: { from: ghostPos, insert: ghostText },
              effects: setGhostText.of({ text: null, pos: 0 }),
            });
            return true;
          },
        },
        // Dismiss ghost text with Escape
        {
          key: "Escape",
          run: (view) => {
            const deco = view.state.field(ghostTextField);
            let hasGhost = false;
            deco.between(0, view.state.doc.length, () => { hasGhost = true; });
            if (!hasGhost) return false;
            view.dispatch({ effects: setGhostText.of({ text: null, pos: 0 }) });
            return true;
          },
        },
        ...defaultKeymap,
        ...historyKeymap,
      ]),
      EditorView.theme({
        "&": { flexGrow: "1" },
        ".cm-scroller": { fontFamily: "inherit", lineHeight: "inherit", overflow: "visible" },
        ".cm-content": { padding: "2em 3em", caretColor: "#000" },
        ".cm-line": { padding: "0" },
        ".cm-cursor": { borderLeftColor: "#000" },
        ".cm-activeLine": { background: "transparent" },
        ".cm-gutters": { display: "none" },
        ".cm-activeLineGutter": { display: "none" },
        ".cm-selectionBackground, ::selection": { background: "#b3d4fd" },
        ".cm-md-link": { color: "#0969da", textDecoration: "underline", cursor: "pointer" },
      }),
      EditorView.updateListener.of((update: ViewUpdate) => {
        if (update.docChanged && !this._settingContent) {
          this._emitChange();
          this._scheduleCompletion();
        }
      }),
    ];

    this._view = new EditorView({
      state: EditorState.create({
        doc: this._pendingContent,
        extensions,
      }),
      parent: mount,
      root: this.shadowRoot!,
    });
  }

  disconnectedCallback(): void {
    this._cancelCompletion();
    this._view?.destroy();
    this._view = null;
  }

  // ---- IEditableText ----

  getContent(): string {
    return this._view ? this._view.state.doc.toString() : this._pendingContent;
  }

  setContent(content: string): void {
    this._pendingContent = content;
    if (!this._view) return;
    this._settingContent = true;
    this._view.dispatch({
      changes: { from: 0, to: this._view.state.doc.length, insert: content },
    });
    this._settingContent = false;
  }

  replaceSelection(text: string): void {
    if (!this._view) return;
    const { from, to } = this._view.state.selection.main;
    this._view.dispatch({ changes: { from, to, insert: text } });
  }

  // ---- IStructuredDocument ----

  getOutline(): DocumentOutline {
    const sections = splitIntoSections(this.getContent());
    return sections
      .filter(s => s.level > 0)
      .map((s, i) => ({
        sectionTitleId: `heading-${i}`,
        sectionLevel: s.level,
        sectionTitle: s.heading.replace(/^#{1,6}\s+/, "").trim(),
      }));
  }

  insertSection(sectionTitle: string, sectionContent: string, insertBeforeSectionId?: string): void {
    const sections = splitIntoSections(this.getContent());
    const m = sectionTitle.match(/^(#{1,6})\s+(.+)/);
    const level = m ? m[1].length : 2;
    const title = (m ? m[2] : sectionTitle).trim();
    const newSection: Section = {
      id: "new",
      level,
      heading: `${"#".repeat(level)} ${title}`,
      body: sectionContent,
      startLine: 0,
    };
    if (insertBeforeSectionId) {
      const idx = sections.findIndex(s => s.id === insertBeforeSectionId);
      if (idx !== -1) {
        sections.splice(idx, 0, newSection);
      } else {
        sections.push(newSection);
      }
    } else {
      sections.push(newSection);
    }
    this.setContent(reassemble(sections));
  }

  moveSection(sectionId: string, insertBeforeSectionId?: string): void {
    const sections = splitIntoSections(this.getContent());
    const fromIdx = sections.findIndex(s => s.id === sectionId);
    if (fromIdx === -1) return;
    const [moving] = sections.splice(fromIdx, 1);
    if (insertBeforeSectionId) {
      const toIdx = sections.findIndex(s => s.id === insertBeforeSectionId);
      sections.splice(toIdx !== -1 ? toIdx : sections.length, 0, moving);
    } else {
      sections.push(moving);
    }
    this.setContent(reassemble(sections));
  }

  removeSection(sectionId: string): void {
    const sections = splitIntoSections(this.getContent());
    const idx = sections.findIndex(s => s.id === sectionId);
    if (idx === -1) return;
    sections.splice(idx, 1);
    this.setContent(reassemble(sections));
  }

  replaceSection(sectionId: string, sectionContent: string): void {
    const sections = splitIntoSections(this.getContent());
    const idx = sections.findIndex(s => s.id === sectionId);
    if (idx === -1) return;
    sections[idx] = { ...sections[idx], body: sectionContent };
    this.setContent(reassemble(sections));
  }

  getSectionContent(sectionId: string): string {
    const sections = splitIntoSections(this.getContent());
    const s = sections.find(sec => sec.id === sectionId);
    return s?.body ?? "";
  }

  // ---- Private ----

  private _emitChange(): void {
    this.dispatchEvent(new CustomEvent("change", { bubbles: true, composed: true }));
  }

  private _scheduleCompletion(): void {
    if (!this._completionService) return;
    this._cancelCompletion();
    this._completionDebounceTimer = setTimeout(() => {
      this._completionDebounceTimer = null;
      void this._requestCompletion();
    }, 800);
  }

  private _cancelCompletion(): void {
    if (this._completionDebounceTimer !== null) {
      clearTimeout(this._completionDebounceTimer);
      this._completionDebounceTimer = null;
    }
    this._completionAbortController?.abort();
    this._completionAbortController = null;
  }

  private async _requestCompletion(): Promise<void> {
    if (!this._completionService || !this._view) return;
    const content = this._view.state.doc.toString();
    if (!content.trim()) return;

    const cursorPos = this._view.state.selection.main.head;
    const controller = new AbortController();
    this._completionAbortController = controller;

    let accumulated = "";
    try {
      for await (const text of this._completionService.getCompletion(content, controller.signal)) {
        if (controller.signal.aborted || !this._view) break;
        accumulated += text;
        this._view.dispatch({
          effects: setGhostText.of({ text: accumulated, pos: cursorPos }),
        });
      }
    } catch (e) {
      if ((e instanceof DOMException || e instanceof Error) && e.name === "AbortError") return;
    }
  }
}

customElements.define("codemirror-editor", CodeMirrorEditor);
