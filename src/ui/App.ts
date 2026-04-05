import { AgentClient } from "./agent-client.js";
import { ChatStore } from "./chat-store.js";
import type { ChatMessage, NormalizedToolCall, ToolHandler } from "./chat-store.js";
import type { ChatPanel } from "./components/chat-panel.js";
import type { DocumentPanel } from "./components/document-panel.js";
import type { TextEditor } from "./components/text-editor.js";
import {
  createDocumentMemento,
  DocumentHistoryCaretaker,
  normalizeDocumentMementoHistory,
  type DocumentMemento,
  type DocumentMementoHistory
} from "./document-memento.js";
import { ToolRegistry } from "./tool-registry.js";

const DEFAULT_DOCUMENTS_STORAGE_KEY = "documents.state";
const MAX_AI_CHECKPOINTS = 100;

type DocumentCheckpoint = {
  id: string;
  label: string;
  toolName: string;
  explanation: string;
  timestamp: number;
  memento: DocumentMemento;
};

type DocumentCheckpointRef = {
  id: string;
  documentId: string;
  label: string;
  targets: {
    before: string;
    after: string;
  };
};

type DocumentItem = {
  id: string;
  title: string;
  content: string;
  aiHistory: DocumentMementoHistory;
  aiCheckpoints: DocumentCheckpoint[];
};

type DocumentState = {
  documents: DocumentItem[];
  activeId: string;
};

type EditorSelection = {
  text: string;
  start: number;
  end: number;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  document: string;
};

type ModelOption = string | { name?: string };

type ApplyDocumentEditRequest = {
  kind: "replace-selection" | "replace-document";
  text: string;
  explanation?: string;
  toolName: string;
};

type SelectionRange = {
  start: number;
  end: number;
};

type AppElements = {
  chatPanel?: ChatPanel | null;
  textEditor?: TextEditor | null;
  documentPanel?: DocumentPanel | null;
  pullButton?: HTMLButtonElement | null;
};

type AppDependencies = {
  agentClient?: AgentClient;
  chatStore?: ChatStore;
  elements?: AppElements;
  documentRef?: Document;
  storage?: Storage;
  toolRegistry?: ToolRegistry | null;
  toolHandler?: ToolHandler | null;
  fetchFn?: typeof fetch;
  promptFn?: (message?: string, defaultValue?: string) => string | null;
  alertFn?: (message?: string) => void;
  logger?: Console;
  nowFn?: () => number;
  randomFn?: () => number;
  documentStorageKey?: string;
};

function createToolHandler({
  toolRegistry,
  getContext
}: {
  toolRegistry?: ToolRegistry | null;
  getContext: () => Record<string, unknown>;
}): ToolHandler | null {
  if (!toolRegistry) {
    return null;
  }

  return async (toolCall: NormalizedToolCall) => {
    const args = toolCall?.arguments || {};
    const toolName = toolCall?.name || "";

    const tool = toolRegistry.findTool(toolName);
    if (!tool) {
      return { ok: false, error: `Unknown tool: ${toolName}` };
    }

    try {
      const context = typeof getContext === "function" ? getContext() : {};
      const result = await tool.execute(args, context);
      return { ok: true, result };
    } catch (error) {
      return { ok: false, error: (error as Error | null)?.message || "Error executing tool" };
    }
  };
}

export class App {
  private _agentClient?: AgentClient;
  private _chatStore?: ChatStore;
  private _elements: AppElements;
  private _document?: Document;
  private _storage?: Storage;
  private _toolRegistry?: ToolRegistry | null;
  private _toolHandler?: ToolHandler | null;
  private _fetch?: typeof fetch;
  private _prompt?: (message?: string, defaultValue?: string) => string | null;
  private _alert?: (message?: string) => void;
  private _logger: Console;
  private _now: () => number;
  private _random: () => number;
  private _documentsStorageKey: string;
  private _chatPanel: ChatPanel | null;
  private _textEditor: TextEditor | null;
  private _documentPanel: DocumentPanel | null;
  private _pullButton: HTMLButtonElement | null;
  private _documentState: DocumentState | null;

  constructor({
    agentClient,
    chatStore,
    elements,
    documentRef,
    storage,
    toolRegistry,
    toolHandler,
    fetchFn,
    promptFn,
    alertFn,
    logger,
    nowFn,
    randomFn,
    documentStorageKey
  }: AppDependencies) {
    this._agentClient = agentClient;
    this._chatStore = chatStore;
    this._elements = elements || {};
    this._document = documentRef;
    this._storage = storage;
    this._toolRegistry = toolRegistry;
    this._toolHandler = toolHandler;
    this._fetch = fetchFn;
    this._prompt = promptFn;
    this._alert = alertFn;
    this._logger = logger || console;
    this._now = nowFn || Date.now;
    this._random = randomFn || Math.random;
    this._documentsStorageKey = documentStorageKey || DEFAULT_DOCUMENTS_STORAGE_KEY;

    this._chatPanel = this._elements.chatPanel || null;
    this._textEditor = this._elements.textEditor || null;
    this._documentPanel = this._elements.documentPanel || null;
    this._pullButton = this._elements.pullButton || null;

    this._documentState = null;
  }

  static async create(deps: AppDependencies = {}): Promise<App> {
    const documentRef = deps.documentRef || document;
    const logger = deps.logger || console;
    const agentClient = deps.agentClient || new AgentClient();
    const toolRegistry = deps.toolRegistry ?? ToolRegistry.create();

    let app: App | null = null;
    const getContext = () => (app ? app._buildToolContext() : {});
    const toolHandler = deps.toolHandler ?? createToolHandler({
      toolRegistry,
      getContext
    });

    const chatStore = deps.chatStore || await ChatStore.create(agentClient, { toolHandler });
    const elements = deps.elements || {
      chatPanel: documentRef.querySelector("chat-panel") as ChatPanel | null,
      textEditor: documentRef.querySelector("text-editor") as TextEditor | null,
      documentPanel: documentRef.querySelector("document-panel") as DocumentPanel | null,
      pullButton: documentRef.querySelector("footer menu-bar button") as HTMLButtonElement | null
    };

    app = new App({
      ...deps,
      agentClient,
      chatStore,
      elements,
      documentRef,
      toolHandler,
      toolRegistry,
      logger
    });

    return app;
  }

  async initialize(): Promise<void> {
    this._documentState = this._loadDocumentState(this._textEditor?.value || "");

    this._renderDocuments();
    const initialDoc = this._getActiveDocument();
    if (this._textEditor && initialDoc) {
      this._textEditor.setMarkdown(initialDoc.content || "");
    }

    this._wireDocumentPanel();
    this._wireTextEditor();
    this._wireChatPanel();
    this._wireChatStore();
    this._wirePullButton();
  }

  private _createDocumentId(): string {
    return `doc-${this._now()}-${this._random().toString(16).slice(2, 8)}`;
  }

  private _createHistoryCaretaker(history?: Partial<DocumentMementoHistory> | null): DocumentHistoryCaretaker {
    return new DocumentHistoryCaretaker(history, { nowFn: this._now });
  }

  private _createCheckpointId(): string {
    return `checkpoint-${this._now()}-${this._random().toString(16).slice(2, 8)}`;
  }

  private _formatCheckpointLabel(checkpoint: { explanation?: string; toolName?: string; timestamp: number }): string {
    const explanation = String(checkpoint.explanation || "").trim();
    if (explanation) {
      return `Restore revision: ${explanation}`;
    }

    const toolName = String(checkpoint.toolName || "").trim();
    if (toolName) {
      return `Restore revision from ${toolName}`;
    }

    return `Restore revision at ${new Date(checkpoint.timestamp).toLocaleTimeString()}`;
  }

  private _normalizeCheckpoint(checkpoint: Partial<DocumentCheckpoint> | null | undefined): DocumentCheckpoint | null {
    if (!checkpoint || typeof checkpoint.id !== "string") {
      return null;
    }

    if (!checkpoint.memento || typeof checkpoint.memento.content !== "string") {
      return null;
    }

    const timestamp = typeof checkpoint.timestamp === "number" ? checkpoint.timestamp : this._now();
    const toolName = typeof checkpoint.toolName === "string" ? checkpoint.toolName : "";
    const explanation = typeof checkpoint.explanation === "string" ? checkpoint.explanation : "";

    return {
      id: checkpoint.id,
      label: typeof checkpoint.label === "string" && checkpoint.label.trim()
        ? checkpoint.label
        : this._formatCheckpointLabel({ explanation, toolName, timestamp }),
      toolName,
      explanation,
      timestamp,
      memento: createDocumentMemento(checkpoint.memento.content)
    };
  }

  private _createDocument(title: string, content: string): DocumentItem {
    const caretaker = this._createHistoryCaretaker();
    return {
      id: this._createDocumentId(),
      title,
      content,
      aiHistory: caretaker.serialize(),
      aiCheckpoints: []
    };
  }

  private _normalizeDocumentItem(doc: Partial<DocumentItem> | null | undefined): DocumentItem | null {
    if (!doc || typeof doc.id !== "string") {
      return null;
    }

    return {
      id: doc.id,
      title: typeof doc.title === "string" && doc.title.trim() ? doc.title : "Untitled",
      content: typeof doc.content === "string" ? doc.content : "",
      aiHistory: normalizeDocumentMementoHistory(doc.aiHistory, this._now),
      aiCheckpoints: Array.isArray(doc.aiCheckpoints)
        ? doc.aiCheckpoints
          .map((checkpoint) => this._normalizeCheckpoint(checkpoint))
          .filter((checkpoint): checkpoint is DocumentCheckpoint => Boolean(checkpoint))
        : []
    };
  }

  private _getSelectionForHistory(): SelectionRange {
    const selection = this._textEditor?.getSelection ? this._textEditor.getSelection() : null;
    const content = this._textEditor?.value || "";
    const max = content.length;
    const start = Math.max(0, Math.min(Number(selection?.start) || 0, max));
    const end = Math.max(start, Math.min(Number(selection?.end) || start, max));
    return { start, end };
  }

  private _emitEditorChange(content: string): void {
    this._textEditor?.dispatchEvent(new CustomEvent("change", {
      detail: { content },
      bubbles: true,
      composed: true
    }));
  }

  private _applySnapshot(snapshot: DocumentMemento): void {
    if (!this._textEditor) {
      return;
    }

    this._textEditor.setMarkdown(snapshot.content);

    const activeDoc = this._getActiveDocument();
    if (activeDoc) {
      activeDoc.content = snapshot.content;
    }

    this._saveDocumentState();
    this._renderDocuments();
    this._emitEditorChange(snapshot.content);
  }

  private _createCheckpoint(
    activeDoc: DocumentItem,
    snapshot: DocumentMemento,
    request: ApplyDocumentEditRequest
  ): DocumentCheckpoint {
    const timestamp = this._now();
    const explanation = request.explanation || "";
    const toolName = request.toolName || "";

    return {
      id: this._createCheckpointId(),
      label: this._formatCheckpointLabel({ explanation, toolName, timestamp }),
      toolName,
      explanation,
      timestamp,
      memento: createDocumentMemento(snapshot.content)
    };
  }

  private _findCheckpoint(checkpointId: string, documentId: string): { documentItem: DocumentItem; checkpoint: DocumentCheckpoint } | null {
    if (!this._documentState) {
      return null;
    }

    const documentItem = this._documentState.documents.find(doc => doc.id === documentId);
    if (!documentItem) {
      return null;
    }

    const checkpoint = documentItem.aiCheckpoints.find(item => item.id === checkpointId);
    if (!checkpoint) {
      return null;
    }

    return { documentItem, checkpoint };
  }

  private _restoreCheckpoint(checkpointId: string, documentId: string, target: "before" | "after" = "after"): void {
    const found = this._findCheckpoint(checkpointId, documentId);
    if (!found || !this._documentState) {
      return;
    }

    const { documentItem, checkpoint } = found;
    if (documentItem.id !== this._documentState.activeId) {
      this._setActiveDocument(documentItem.id);
    }

    if (target === "before") {
      const caretaker = this._createHistoryCaretaker(documentItem.aiHistory);
      const entry = caretaker.serialize().undo.find(item => item.after.content === checkpoint.memento.content
        && item.toolName === checkpoint.toolName
        && item.explanation === checkpoint.explanation);

      if (entry) {
        this._applySnapshot(entry.before);
        return;
      }
    }

    this._applySnapshot(checkpoint.memento);
  }

  private _applyDocumentEdit(request: ApplyDocumentEditRequest): {
    ok: boolean;
    explanation?: string;
    error?: string;
    checkpoint?: DocumentCheckpointRef;
  } {
    const editor = this._textEditor;
    const activeDoc = this._getActiveDocument();
    if (!editor || !activeDoc) {
      return { ok: false, error: "Editor context is not available." };
    }

    const beforeContent = editor.value || "";
    const beforeSelection = this._getSelectionForHistory();
    let afterContent = beforeContent;
    let afterSelection = beforeSelection;

    if (request.kind === "replace-selection") {
      afterContent = `${beforeContent.slice(0, beforeSelection.start)}${request.text}${beforeContent.slice(beforeSelection.end)}`;
      afterSelection = {
        start: beforeSelection.start,
        end: beforeSelection.start + request.text.length
      };
    } else {
      afterContent = request.text;
      afterSelection = { start: 0, end: 0 };
    }

    const caretaker = this._createHistoryCaretaker(activeDoc.aiHistory);
    const recorded = caretaker.record({
      before: createDocumentMemento(beforeContent),
      after: createDocumentMemento(afterContent),
      toolName: request.toolName,
      explanation: request.explanation || "",
      timestamp: this._now()
    });

    if (!recorded) {
      return {
        ok: true,
        explanation: request.explanation || "No document changes were needed."
      };
    }

    activeDoc.aiHistory = caretaker.serialize();
  const afterSnapshot = createDocumentMemento(afterContent);
    const checkpoint = this._createCheckpoint(activeDoc, afterSnapshot, request);
    activeDoc.aiCheckpoints = [...activeDoc.aiCheckpoints, checkpoint].slice(-MAX_AI_CHECKPOINTS);
    this._applySnapshot(afterSnapshot);

    return {
      ok: true,
      explanation: request.explanation || (request.kind === "replace-selection"
        ? "Replaced the selected text."
        : "Replaced the full document."),
      checkpoint: {
        id: checkpoint.id,
        documentId: activeDoc.id,
        label: checkpoint.label,
        targets: {
          before: "Before",
          after: "After"
        }
      }
    };
  }

  private _loadDocumentState(fallbackContent: string): DocumentState {
    if (!this._storage) {
      const documentItem = this._createDocument("Untitled", fallbackContent || "");
      return {
        documents: [documentItem],
        activeId: documentItem.id
      };
    }

    const raw = this._storage.getItem(this._documentsStorageKey);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Partial<DocumentState>;
        const documents = Array.isArray(parsed?.documents)
          ? parsed.documents
            .map((doc) => this._normalizeDocumentItem(doc))
            .filter((doc): doc is DocumentItem => Boolean(doc))
          : [];

        if (documents.length > 0) {
          const activeId = documents.some(doc => doc.id === parsed?.activeId)
            ? String(parsed?.activeId)
            : documents[0].id;
          return { documents, activeId };
        }
      } catch (error) {
        this._logger.warn("Failed to parse document state:", error);
      }
    }

    const documentItem = this._createDocument("Untitled", fallbackContent || "");
    return {
      documents: [documentItem],
      activeId: documentItem.id
    };
  }

  private _saveDocumentState(): void {
    if (!this._storage || !this._documentState) {
      return;
    }
    this._storage.setItem(this._documentsStorageKey, JSON.stringify(this._documentState));
  }

  private _getActiveDocument(): DocumentItem | null {
    const documentState = this._documentState;
    if (!documentState) {
      return null;
    }
    return documentState.documents.find(doc => doc.id === documentState.activeId) || null;
  }

  private _renderDocuments(): void {
    if (this._documentPanel && this._documentState) {
      this._documentPanel.setDocuments(this._documentState.documents, this._documentState.activeId);
    }
  }

  private _setActiveDocument(docId: string): void {
    const documentState = this._documentState;
    if (!documentState) {
      return;
    }

    const currentDoc = this._getActiveDocument();
    if (currentDoc && this._textEditor) {
      currentDoc.content = this._textEditor.value;
    }

    const nextDoc = documentState.documents.find(doc => doc.id === docId);
    if (!nextDoc) {
      return;
    }

    documentState.activeId = docId;
    if (this._textEditor) {
      this._textEditor.setMarkdown(nextDoc.content || "");
    }
    this._renderDocuments();
    this._saveDocumentState();
  }

  private _wireDocumentPanel(): void {
    if (!this._documentPanel) {
      return;
    }

    this._documentPanel.addEventListener("select", (event) => {
      const detail = (event as CustomEvent<{ id?: string }>).detail;
      const docId = detail?.id;
      if (docId && docId !== this._documentState?.activeId) {
        this._setActiveDocument(docId);
      }
    });

    this._documentPanel.addEventListener("create", () => {
      const title = this._prompt ? this._prompt("Document name:", "Untitled") : "Untitled";
      if (title === null) {
        return;
      }

      const newDoc = this._createDocument(String(title).trim() || "Untitled", "");

      const currentDoc = this._getActiveDocument();
      if (currentDoc && this._textEditor) {
        currentDoc.content = this._textEditor.value;
      }

      if (this._documentState) {
        this._documentState.documents = [...this._documentState.documents, newDoc];
        this._documentState.activeId = newDoc.id;
      }
      if (this._textEditor) {
        this._textEditor.setMarkdown("");
        this._textEditor.focus();
      }
      this._renderDocuments();
      this._saveDocumentState();
    });

  }

  private _wireTextEditor(): void {
    if (!this._textEditor) {
      return;
    }

    this._textEditor.addEventListener("change", () => {
      const activeDoc = this._getActiveDocument();
      if (!activeDoc) {
        return;
      }
      activeDoc.content = this._textEditor?.value || "";
      this._saveDocumentState();
    });
  }

  private _wireChatStore(): void {
    const chatStore = this._chatStore;
    const chatPanel = this._chatPanel;
    if (!chatStore || !chatPanel) {
      return;
    }

    chatStore.addListener((eventName, data) => {
      switch (eventName) {
        case "history":
          chatPanel.setHistory(data as ChatMessage[]);
          break;
        case "active":
          chatPanel.setActive(data as ChatMessage | null);
          break;
        case "status":
          this._logger.log(data);
          break;
        case "models":
          {
            const models = Array.isArray(data) ? data : [];
            chatPanel.setModels(this._normalizeModels(models));
          }
          break;
        default:
          break;
      }
    });

    chatPanel.setHistory(chatStore.getHistory());
    chatPanel.setActive(chatStore.getActive());
    chatPanel.setModels(this._normalizeModels(chatStore.getModels()));
  }

  private _wireChatPanel(): void {
    if (!this._chatPanel) {
      return;
    }

    this._chatPanel.addEventListener("clear", () => {
      this._chatStore?.clearHistory();
    });

    this._chatPanel.addEventListener("submit", (event: Event) => {
      if (!this._chatStore) {
        return;
      }

      const selection = this._textEditor?.getSelection ? this._textEditor.getSelection() : null;
      const model = this._chatPanel?.model || "";
      const activeDoc = this._getActiveDocument();
      const context = {
        model,
        selection,
        documentId: activeDoc?.id || null,
        documentTitle: activeDoc?.title || null
      };

      const detail = (event as unknown as CustomEvent<{ prompt: string }>).detail;
      this._chatStore.submitPrompt(detail.prompt, context);
    });

    this._chatPanel.addEventListener("checkpoint-select", (event: Event) => {
      const detail = (event as CustomEvent<{ checkpointId?: string; documentId?: string; target?: "before" | "after" }>).detail;
      const checkpointId = detail?.checkpointId;
      const documentId = detail?.documentId;
      const target = detail?.target === "before" ? "before" : "after";

      if (!checkpointId || !documentId) {
        return;
      }

      this._restoreCheckpoint(checkpointId, documentId, target);
    });
  }

  private _wirePullButton(): void {
    const pullButton = this._pullButton;
    if (!pullButton) {
      return;
    }

    pullButton.addEventListener("click", async () => {
      const promptFn = this._prompt;
      if (!promptFn || !this._fetch || !this._alert) {
        return;
      }

      const model = promptFn("Enter the name of the Ollama model to pull:");
      if (!model) {
        return;
      }

      pullButton.disabled = true;
      pullButton.textContent = "Pulling...";
      try {
        const res = await this._fetch("/api/pull", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model })
        });
        if (res.ok) {
          this._alert("Model pull requested. Check server logs for progress.");
        } else {
          this._alert(`Failed to pull model: ${res.statusText}`);
        }
      } catch (error) {
        this._alert(`Error: ${(error as Error | null)?.message || error}`);
      }
      pullButton.disabled = false;
      pullButton.textContent = "Pull Model";
    });
  }

  private _normalizeModels(models: unknown[]): ModelOption[] {
    return models.map((model) => {
      if (typeof model === "string") {
        return model;
      }

      if (model && typeof model === "object") {
        return model as { name?: string };
      }

      return String(model);
    });
  }

  private _buildToolContext(): Record<string, unknown> {
    const selection = this._textEditor?.getSelection ? this._textEditor.getSelection() : null;
    const activeDocument = this._getActiveDocument();
    return {
      editor: this._textEditor || null,
      applyDocumentEdit: (request: ApplyDocumentEditRequest) => this._applyDocumentEdit(request),
      document: this._textEditor?.value || activeDocument?.content || "",
      documentMeta: activeDocument || null,
      selection: selection as EditorSelection | null
    };
  }
}
