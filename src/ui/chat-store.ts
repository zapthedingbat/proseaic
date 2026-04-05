import type { AgentClient } from "./agent-client.js";
import {
  buildOllamaChatRequest,
  buildPrompt,
  buildSystemMessage,
  loadModelCapabilities,
  type ModelCapabilities,
  TOOL_NAMES
} from "./agent-request.js";

type ChatRole = "user" | "assistant" | "tool" | string;

export type ChatCheckpointRef = {
  id: string;
  documentId: string;
  label?: string;
  targets?: {
    before?: string;
    after?: string;
  };
};

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  thinking?: string;
  done?: boolean;
  checkpoint?: ChatCheckpointRef;
};

type ChatListener = (eventName: string, data: unknown) => void;

type ToolCall = {
  id?: string | null;
  name?: string | null;
  function?: { name?: string; arguments?: unknown };
  arguments?: unknown;
  [key: string]: unknown;
};

export type NormalizedToolCall = {
  id: string | null;
  name: string | null;
  arguments: Record<string, unknown>;
  raw: ToolCall;
};

export type ToolResult = {
  ok: boolean;
  result?: unknown;
  error?: string;
  [key: string]: unknown;
};

type AgentConversationMessage = {
  role: string;
  content?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
};

export type ToolHandler = (call: NormalizedToolCall) => Promise<ToolResult | null | undefined> | ToolResult | null | undefined;

type PromptContext = Record<string, unknown> & {
  model?: string;
  role?: string;
  options?: Record<string, unknown>;
  selection?: Record<string, unknown> | null;
  document?: string;
};

type ChatStoreOptions = {
  toolHandler?: ToolHandler | null;
};

export class ChatStore {
  private _agentClient: AgentClient;
  private _storageKey: string;
  private _history: ChatMessage[];
  private _active: ChatMessage | null;
  private _models: unknown[];
  private _status: string;
  private _messageId: number;
  private _listeners: Set<ChatListener>;
  private _toolHandler: ToolHandler | null;
  private _pendingToolCalls: ToolCall[];
  private _handledToolCallIds: Set<string>;
  private _currentModel?: unknown;
  private _streamConversationMessage: AgentConversationMessage | null;
  private _capabilitiesCache: Map<string, Promise<ModelCapabilities>>;

  constructor(agentClient: AgentClient, storageKey = "chat.history", options: ChatStoreOptions = {}) {
    this._agentClient = agentClient;
    this._storageKey = storageKey;
    this._history = [];
    this._active = null;
    this._models = [];
    this._status = "";
    this._messageId = 0;
    this._listeners = new Set();
    this._toolHandler = typeof options.toolHandler === "function" ? options.toolHandler : null;
    this._pendingToolCalls = [];
    this._handledToolCallIds = new Set();
    this._streamConversationMessage = null;
    this._capabilitiesCache = new Map();
  }

  static async create(agentClient: AgentClient, options?: ChatStoreOptions): Promise<ChatStore> {
    const store = new ChatStore(agentClient, undefined, options);
    await Promise.all([
      store._loadModels(),
      store._loadHistory()
    ]);
    return store;
  }

  addListener(listener: ChatListener): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  getHistory(): ChatMessage[] {
    return [...this._history];
  }

  getActive(): ChatMessage | null {
    return this._active ? { ...this._active } : null;
  }

  getModels(): unknown[] {
    return [...this._models];
  }

  getStatus(): string {
    return this._status;
  }

  _emit(eventName: string, data: unknown): void {
    for (const listener of this._listeners) {
      try {
        listener(eventName, data);
      } catch (error) {
        console.error("Error in listener:", error);
      }
    }
  }

  _loadHistory(): void {
    const raw = localStorage.getItem(this._storageKey);
    const parsed = raw ? JSON.parse(raw) : [];
    this._history = Array.isArray(parsed) ? parsed : [];
    this._emit("history", [...this._history]);
  }

  _saveHistory(): void {
    localStorage.setItem(this._storageKey, JSON.stringify(this._history));
  }

  _setStatus(status: string): void {
    this._status = status;
  }

  _createMessage(role: ChatRole, content: string, extra: Partial<ChatMessage> = {}): ChatMessage {
    this._messageId += 1;
    return {
      id: `${role}-${this._messageId}`,
      role,
      content,
      ...extra
    };
  }

  async _loadModels(): Promise<void> {
    this._setStatus("Loading models...");
    const models = await this._agentClient.loadModels();
    this._models = models;
    this._emit("models", [...models]);
  }

  setCurrentModel(model: unknown): void {
    this._currentModel = model;
    this._emit("model-change", model);
  }

  clearHistory(): void {
    this._history = [];
    this._active = null;
    this._saveHistory();
    this._emit("history", []);
    this._emit("active", null);
  }

  _setNextActiveMessage(message: ChatMessage | null): void {
    if (this._active) {
      this._active = { ...this._active, done: true };
      this._history.push(this._active);
      this._active = null;
      this._saveHistory();
      this._emit("history", [...this._history]);
    }
    this._active = message || null;
    this._emit("active", this._active);
  }

  _addHistoryEntry(entry: ChatMessage | null): void {
    if (!entry) {
      return;
    }

    const finalized = { ...entry, done: true };
    this._history.push(finalized);
    this._saveHistory();
    this._emit("history", [...this._history]);
  }

  async submitPrompt(prompt: string, context: Record<string, unknown>): Promise<void> {
    const userMessage = this._createMessage("user", prompt, { done: true });
    this._setNextActiveMessage(userMessage);
    this._pendingToolCalls = [];
    this._handledToolCallIds.clear();
    this._streamConversationMessage = null;

    const promptContext = {
      ...context,
      prompt
    } as PromptContext;

    const model = String(promptContext.model || "");
    const capabilities = await this._loadModelCapabilities(model);
    const initialMessages: AgentConversationMessage[] = [
      {
        role: "system",
        content: buildSystemMessage(String(promptContext.role || ""))
      },
      {
        role: "user",
        content: buildPrompt(promptContext, TOOL_NAMES, capabilities)
      }
    ];

    const conversation: AgentConversationMessage[] = [];

    while (true) {
      this._streamConversationMessage = null;
      const chatRequest = buildOllamaChatRequest({
          model,
          messages: [...initialMessages, ...conversation],
          options: promptContext.options,
          capabilities
        });
      console.log("Submitting chat request with payload:", chatRequest);
      await this._agentClient.streamChat(
        chatRequest,
        event => this._handleStreamEvent(event)
      );

      const assistantMessage = this._consumeStreamConversationMessage();
      if (assistantMessage) {
        conversation.push(assistantMessage);
      }

      const toolMessages = await this._drainToolCalls();
      if (toolMessages.length === 0) {
        this._setNextActiveMessage(null);
        break;
      }

      conversation.push(...toolMessages);
    }
  }

  async _loadModelCapabilities(model: string): Promise<ModelCapabilities> {
    if (!model) {
      return { enableTools: false, think: false, raw: [] };
    }

    const cached = this._capabilitiesCache.get(model);
    if (cached) {
      return cached;
    }

    const request = loadModelCapabilities(model)
      .catch((_error) => ({
        enableTools: false,
        think: false,
        raw: []
      }));

    this._capabilitiesCache.set(model, request);
    return request;
  }

  async _handleStreamEvent(event: Record<string, unknown>): Promise<void> {
    console.debug("Received stream event:", event);

    if (event?.type === "status") {
      this._setStatus(String(event.status || ""));
      this._emit("status", this._status);
      return;
    }

    if (event?.type === "error") {
      this._setStatus(String(event.error || ""));
      this._emit("status", this._status);
      return;
    }

    const message = (event as { message?: Record<string, unknown>; type?: string }).message
      || (event?.type === "assistant-message" ? event : null);
    const messageToolCalls = Array.isArray(message?.tool_calls) ? message.tool_calls as ToolCall[] : [];
    const eventToolCalls = Array.isArray((event as { tool_calls?: ToolCall[] }).tool_calls)
      ? (event as { tool_calls?: ToolCall[] }).tool_calls || []
      : [];

    let strippedFallback = false;
    if (message?.content && event?.done) {
      const fallbackToolCalls = getFallbackToolCalls(String(message.content));
      if (fallbackToolCalls.length > 0) {
        eventToolCalls.push(...fallbackToolCalls);
        message.content = stripJsonPayload(String(message.content));
        strippedFallback = true;
      }
    }

    if (message) {
      const role = String(message.role || "assistant");
      const content = String(message.content || "");
      const thinking = String(message.thinking || "");
      const done = Boolean((event as { done?: boolean }).done);

      this._appendAssistantMessageToConversation(message);

      if (!this._active) {
        this._active = this._createMessage(role, content, { thinking, done });
      } else if (this._active.role === role) {
        this._active = {
          ...this._active,
          content: `${this._active.content}${content}`,
          thinking: `${this._active.thinking || ""}${thinking}`,
          done
        };
      } else {
        const nextMessage = this._createMessage(role, content, { thinking, done });
        this._setNextActiveMessage(nextMessage);
      }
      this._emit("active", this._active);
    }

    if (!message && (messageToolCalls.length > 0 || eventToolCalls.length > 0)) {
      this._ensureAssistantTurnStarted();
    }

    const queuedToolCalls = uniqueToolCalls([...messageToolCalls, ...eventToolCalls]);
    if (queuedToolCalls.length > 0) {
      this._appendToolCallsToConversation(queuedToolCalls);
      this._queueToolCalls(queuedToolCalls);
    }

    if (strippedFallback && this._active) {
      this._active = {
        ...this._active,
        content: stripJsonPayload(this._active.content || "")
      };
      this._emit("active", this._active);
    }
  }

  _ensureAssistantTurnStarted(): void {
    if (!this._active) {
      this._active = this._createMessage("assistant", "", { done: false });
      this._emit("active", this._active);
      return;
    }

    if (this._active.role !== "assistant") {
      const nextMessage = this._createMessage("assistant", "", { done: false });
      this._setNextActiveMessage(nextMessage);
    }
  }

  _appendAssistantMessageToConversation(message: Record<string, unknown>): void {
    const role = typeof message.role === "string" ? message.role : "assistant";
    const content = typeof message.content === "string" ? message.content : "";

    if (!this._streamConversationMessage) {
      this._streamConversationMessage = { role, content: "" };
    }

    this._streamConversationMessage.role = role;
    this._streamConversationMessage.content = `${this._streamConversationMessage.content || ""}${content}`;
  }

  _appendToolCallsToConversation(toolCalls: ToolCall[]): void {
    if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
      return;
    }

    if (!this._streamConversationMessage) {
      this._streamConversationMessage = {
        role: "assistant",
        content: ""
      };
    }

    const existing = Array.isArray(this._streamConversationMessage.tool_calls)
      ? this._streamConversationMessage.tool_calls
      : [];
    const merged = [...existing];
    const seen = new Set(existing.map(toolCall => getToolCallKey(toolCall)));

    for (const toolCall of toolCalls) {
      const key = getToolCallKey(toolCall);
      if (seen.has(key)) {
        continue;
      }

      merged.push(toolCall);
      seen.add(key);
    }

    this._streamConversationMessage.tool_calls = merged;
  }

  _consumeStreamConversationMessage(): AgentConversationMessage | null {
    const message = normalizeConversationMessage(this._streamConversationMessage);
    this._streamConversationMessage = null;
    return message;
  }

  _queueToolCalls(toolCalls: ToolCall[]): void {
    if (!Array.isArray(toolCalls)) {
      return;
    }

    for (const call of toolCalls) {
      const normalized = normalizeToolCall(call);
      if (!normalized?.name) {
        continue;
      }
      if (normalized.id && this._handledToolCallIds.has(normalized.id)) {
        continue;
      }
      this._addHistoryEntry({
        id: normalized.id || `tool-call-${Date.now()}`,
        role: "tool",
        content: formatToolCall(normalized)
      });
    }

    this._pendingToolCalls.push(...toolCalls);
  }

  async _drainToolCalls(): Promise<AgentConversationMessage[]> {
    if (!this._toolHandler || this._pendingToolCalls.length === 0) {
      this._pendingToolCalls = [];
      return [];
    }

    const queued = [...this._pendingToolCalls];
    this._pendingToolCalls = [];
    const toolMessages: AgentConversationMessage[] = [];

    for (const call of queued) {
      const normalized = normalizeToolCall(call);
      if (!normalized?.name) {
        continue;
      }

      if (normalized.id) {
        if (this._handledToolCallIds.has(normalized.id)) {
          continue;
        }
        this._handledToolCallIds.add(normalized.id);
      }

      try {
        const result = normalizeToolResult(await this._toolHandler(normalized));
        const checkpoint = extractCheckpointRef(result);
        this._addHistoryEntry({
          id: normalized.id ? `${normalized.id}-result` : `tool-result-${Date.now()}`,
          role: "tool",
          content: formatToolResult(normalized.name, result),
          checkpoint
        });
        this._emit("tool-result", { tool: normalized.name, ...result });
        toolMessages.push(createToolConversationMessage(normalized, result));
      } catch (error) {
        const result = {
          ok: false,
          error: (error as Error | null)?.message || "Tool execution failed."
        };
        this._addHistoryEntry({
          id: normalized.id ? `${normalized.id}-result` : `tool-result-${Date.now()}`,
          role: "tool",
          content: formatToolResult(normalized.name, result)
        });
        this._emit("tool-result", {
          tool: normalized.name,
          ...result
        });
        toolMessages.push(createToolConversationMessage(normalized, result));
      }
    }

    return toolMessages;
  }
}

function normalizeToolCall(toolCall: ToolCall | null): NormalizedToolCall | null {
  if (!toolCall) {
    return null;
  }

  const id = toolCall.id || null;
  const fn = toolCall.function || toolCall;
  const name = fn.name || toolCall.name || null;
  const rawArgs = fn.arguments ?? toolCall.arguments ?? {};
  const parsedArgs = parseToolArguments(rawArgs);

  return {
    id,
    name,
    arguments: parsedArgs,
    raw: toolCall
  };
}

function parseToolArguments(value: unknown): Record<string, unknown> {
  if (!value) {
    return {};
  }

  if (typeof value === "string") {
    try {
      return normalizeToolArgumentValues(JSON.parse(value)) as Record<string, unknown>;
    } catch {
      return { text: normalizeEscapedMultilineText(value) };
    }
  }

  if (typeof value === "object") {
    return normalizeToolArgumentValues(value) as Record<string, unknown>;
  }

  return {};
}

function normalizeToolArgumentValues(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(item => normalizeToolArgumentValues(item));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => {
      if (key === "text" && typeof entry === "string") {
        return [key, normalizeEscapedMultilineText(entry)];
      }

      return [key, normalizeToolArgumentValues(entry)];
    })
  );
}

function normalizeEscapedMultilineText(value: string): string {
  if (!value) {
    return "";
  }

  const escapedLineBreakCount = (value.match(/\\r\\n|\\n|\\r/g) || []).length;
  const escapedTabCount = (value.match(/\\t/g) || []).length;
  if (escapedLineBreakCount === 0 && escapedTabCount === 0) {
    return value;
  }

  const actualLineBreakCount = (value.match(/\r?\n/g) || []).length;
  const looksLikeEscapedMultiline = escapedLineBreakCount >= 2
    || (escapedLineBreakCount >= 1 && actualLineBreakCount === 0 && value.length > 40);

  if (!looksLikeEscapedMultiline) {
    return value;
  }

  return value
    .replace(/\\r\\n/g, "\r\n")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t");
}

function normalizeConversationMessage(message: AgentConversationMessage | null): AgentConversationMessage | null {
  if (!message) {
    return null;
  }

  const content = typeof message.content === "string" ? message.content : "";
  const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
  if (!content && toolCalls.length === 0) {
    return null;
  }

  const normalized: AgentConversationMessage = {
    role: typeof message.role === "string" ? message.role : "assistant"
  };

  if (content || toolCalls.length === 0) {
    normalized.content = content;
  }

  if (toolCalls.length > 0) {
    normalized.tool_calls = toolCalls;
  }

  return normalized;
}

function normalizeToolResult(result: unknown): ToolResult {
  if (result && typeof result === "object") {
    return result as ToolResult;
  }

  return {
    ok: true,
    result: result ?? null
  };
}

function createToolConversationMessage(normalized: NormalizedToolCall, result: ToolResult): AgentConversationMessage {
  const message: AgentConversationMessage = {
    role: "tool",
    content: JSON.stringify(result ?? {}, null, 2)
  };

  if (normalized.id) {
    message.tool_call_id = normalized.id;
  }

  if (normalized.name) {
    message.name = normalized.name;
  }

  return message;
}

function getToolCallKey(toolCall: ToolCall): string {
  if (typeof toolCall.id === "string" && toolCall.id) {
    return toolCall.id;
  }

  const fn = toolCall.function || toolCall;
  return JSON.stringify({
    name: fn?.name || toolCall.name || "",
    arguments: fn?.arguments ?? toolCall.arguments ?? null
  });
}

function uniqueToolCalls(toolCalls: ToolCall[]): ToolCall[] {
  const unique: ToolCall[] = [];
  const seen = new Set<string>();

  for (const toolCall of toolCalls) {
    const key = getToolCallKey(toolCall);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(toolCall);
  }

  return unique;
}

function formatToolCall(normalized: NormalizedToolCall | null): string {
  const args = normalized?.arguments ?? {};
  const prettyArgs = JSON.stringify(args, null, 2);
  return `Tool call: ${normalized?.name}\n\n\
\`\`\`json\n${prettyArgs}\n\`\`\``;
}

function formatToolResult(name: string | null, result: ToolResult): string {
  const prettyResult = JSON.stringify(result ?? {}, null, 2);
  return `Tool result: ${name}\n\n\
\`\`\`json\n${prettyResult}\n\`\`\``;
}

function extractCheckpointRef(result: ToolResult): ChatCheckpointRef | undefined {
  const direct = (result as { checkpoint?: unknown }).checkpoint;
  const nested = (result as { result?: { checkpoint?: unknown } }).result?.checkpoint;
  const candidate = nested || direct;

  if (!candidate || typeof candidate !== "object") {
    return undefined;
  }

  const checkpoint = candidate as {
    id?: unknown;
    documentId?: unknown;
    label?: unknown;
    targets?: {
      before?: unknown;
      after?: unknown;
    };
  };
  if (typeof checkpoint.id !== "string" || typeof checkpoint.documentId !== "string") {
    return undefined;
  }

  return {
    id: checkpoint.id,
    documentId: checkpoint.documentId,
    label: typeof checkpoint.label === "string" ? checkpoint.label : "",
    targets: {
      before: typeof checkpoint.targets?.before === "string" ? checkpoint.targets.before : "Before",
      after: typeof checkpoint.targets?.after === "string" ? checkpoint.targets.after : "After"
    }
  };
}

function parseJsonCandidate(text: string): unknown {
  if (!text) {
    return null;
  }

  const trimmed = text.trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidates: string[] = [];

  if (fencedMatch?.[1]) {
    candidates.push(fencedMatch[1].trim());
  }

  candidates.push(trimmed);

  const startIndexes: number[] = [];
  for (let index = 0; index < trimmed.length; index += 1) {
    const char = trimmed[index];
    if (char === "{" || char === "[") {
      startIndexes.push(index);
    }
  }

  for (const start of startIndexes) {
    for (let end = trimmed.length; end > start; end -= 1) {
      const candidate = trimmed.slice(start, end).trim();
      if (!candidate) {
        continue;
      }

      candidates.push(candidate);
    }
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Continue trying shorter candidates.
    }
  }

  return null;
}

function normalizeFallbackEdits(parsed: unknown): Array<Record<string, unknown>> {
  if (!parsed) {
    return [];
  }

  if (Array.isArray(parsed)) {
    return parsed as Array<Record<string, unknown>>;
  }

  if (Array.isArray((parsed as { edits?: unknown[] }).edits)) {
    return (parsed as { edits?: Array<Record<string, unknown>> }).edits || [];
  }

  if ((parsed as { function?: string; text?: string }).function && typeof (parsed as { text?: string }).text === "string") {
    return [parsed as Record<string, unknown>];
  }

  return [];
}

function getFallbackToolCalls(content: string): ToolCall[] {
  const parsed = parseJsonCandidate(content);
  const edits = normalizeFallbackEdits(parsed);

  return edits
    .filter(edit => edit && typeof edit.function === "string" && typeof edit.text === "string")
    .map(edit => ({
      function: {
        name: edit.function as string,
        arguments: {
          text: normalizeEscapedMultilineText(edit.text as string),
          explanation: (edit as { explanation?: string }).explanation || ""
        }
      }
    }));
}

function stripJsonPayload(content: string): string {
  if (!content) {
    return "";
  }

  const fencedRemoved = content.replace(/```(?:json)?\s*[\s\S]*?\s*```/gi, " ").trim();
  const parsed = parseJsonCandidate(content);
  if (!parsed) {
    return fencedRemoved;
  }

  const serialized = JSON.stringify(parsed);
  return fencedRemoved.replace(serialized, " ").replace(/\s+/g, " ").trim();
}
