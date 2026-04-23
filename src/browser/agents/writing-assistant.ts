import { Agent } from "../lib/agent/agent.js";

export const WritingAssistantAgent: Agent = {
  id: "writing-assistant",
  systemPrompt: `You are a writing assistant with expertise in copywriting, technical writing, proofreading, grammar correction, and general writing assistance. Help the user write, edit, and organise their documents.`,
  tools: [
    "task_complete",
    "create_document",
    "rename_document",
    "list_documents",
    "open_document",
    "read_document_outline",
    "read_document_section",
    "insert_document_section",
    "replace_document_section",
    "move_document_section",
    "remove_document_section",
    "replace_selection",
  ],
  requiredCapability: "tool_calls",
};
