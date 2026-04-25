import { LoggerFactory } from "../logging/logger-factory.js";
import { Logger } from "../logging/logger.js";
import { IPlatformService } from "../platform/platform-service.js";
import { IToolService } from "../tools/tool-service.js";
import { IChatSession } from "./chat-session.js";

export interface IChatService {
  removeAllSessions(): Promise<void>;
  removeSession(sessionId: string): Promise<void>;
  startSession(modelIdentifier: string, prompt: string): IChatSession;
}

export class ChatManager implements IChatService {

  private readonly _chatSessions: Map<string, IChatSession> = new Map();
  private _loggerFactory: LoggerFactory;
  private _logger: Logger;
  private _platformService: IPlatformService;
  private _toolsService: IToolService;

  constructor(loggerFactory: LoggerFactory, platformService: IPlatformService, toolsService: IToolService) {
    this._loggerFactory = loggerFactory;
    this._logger = loggerFactory("Chat Service");
    this._platformService = platformService;
    this._toolsService = toolsService;
  }

  removeAllSessions(): Promise<void> {
    throw new Error("Method not implemented.");
  }

  removeSession(sessionId: string): Promise<void> {
    throw new Error("Method not implemented.");
  }

  // Factory for chat sessions.
  // Each session corresponds to a single conversation with an AI, and manages the message history and interactions for that conversation.
  startSession(modelIdentifier: string, prompt: string): IChatSession {
    const sessionId = crypto.randomUUID();

    throw new Error("Method not implemented.");

    //const history = new ChatHistory();
    //const agent = new Agent(modelIdentifier, platformService, history, toolsService);

    //const chatSession = new ChatSession(this._loggerFactory, platformService, history, toolsService, agent);

    //_chatSessions.set(sessionId, new ChatSession(loggerFactory, platformService, history, toolsService, agent));
  }
}


