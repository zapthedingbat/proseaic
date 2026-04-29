/**
 * Evaluation scenarios for the ProseAI writing assistant.
 *
 * Each scenario defines:
 *   id              - unique slug
 *   name            - human-readable description
 *   document        - initial document content (markdown)
 *   prompt          - user message sent to the assistant
 *   expectedTools   - tools the model should call (in any order)
 *   requiredTools   - subset of expectedTools that MUST appear for correctness
 *   expectDocChange - whether the document content should be different after
 *   scoreDoc        - optional fn(before, after) => boolean for richer doc checks
 *   scoreReply      - optional fn(replyText) => boolean for verifying text answers
 */

export const SCENARIOS = [
  {
    id: "add-section",
    name: "Add a new section",
    document: `# Project Overview\n\n## Introduction\n\nThis project aims to build a better markdown editor.\n\n## Goals\n\n- Ship version 1 by Q3\n- Achieve 100 daily active users\n- Support three AI providers\n`,
    prompt: `Add a new section called "Summary" at the end of the document with a one-sentence summary of what the project is about.`,
    expectedTools: ["read_document_outline", "insert_document_section", "task_complete"],
    requiredTools: ["insert_document_section", "task_complete"],
    expectDocChange: true,
    scoreDoc: (before, after) => {
      const hasSummaryHeading = /##\s*summary/i.test(after);
      const hasNewContent = after.length > before.length;
      return hasSummaryHeading && hasNewContent;
    },
  },

  {
    id: "edit-section",
    name: "Rewrite an existing section",
    document: `# Technical Spec\n\n## Introduction\n\nBad.\n\n## Architecture\n\nThe system uses three layers.\n`,
    prompt: `Rewrite the Introduction section to be a proper two-sentence introduction explaining this is a technical specification document for a markdown editor.`,
    expectedTools: ["read_document_outline", "read_document_section", "replace_document_section", "task_complete"],
    requiredTools: ["replace_document_section", "task_complete"],
    expectDocChange: true,
    scoreDoc: (before, after) => {
      const introBefore = before.match(/## Introduction\n+([\s\S]*?)(?=\n##|$)/)?.[1]?.trim() ?? "";
      const introAfter = after.match(/## Introduction\n+([\s\S]*?)(?=\n##|$)/)?.[1]?.trim() ?? "";
      return introAfter !== introBefore && introAfter.length > 10;
    },
  },

  {
    id: "answer-question",
    name: "Answer a question about the document",
    document: `# Meeting Notes\n\n## Action Items\n\n- [ ] Send the proposal to the client\n- [ ] Schedule a follow-up call\n- [ ] Update the project timeline\n- [ ] Review the design mockups\n`,
    prompt: `How many unchecked action items are listed in the document?`,
    expectedTools: ["read_document_outline", "read_document_section", "task_complete"],
    requiredTools: ["task_complete"],
    expectDocChange: false,
    scoreReply: (text) => {
      // Accept "4", "four", "4 unchecked", "there are 4" etc.
      return /\b4\b|four/i.test(text);
    },
  },

  {
    id: "multi-section-fill",
    name: "Fill multiple empty sections",
    document: `# Product Roadmap\n\n## Q1 Goals\n\n\n\n## Q2 Goals\n\n\n`,
    prompt: `Fill in the Q1 Goals section with three bullet points for improving performance, and the Q2 Goals section with three bullet points for new features.`,
    expectedTools: ["read_document_outline", "replace_document_section", "task_complete"],
    requiredTools: ["replace_document_section", "task_complete"],
    expectDocChange: true,
    scoreDoc: (before, after) => {
      const q1After = after.match(/## Q1 Goals\n+([\s\S]*?)(?=\n##|$)/)?.[1]?.trim() ?? "";
      const q2After = after.match(/## Q2 Goals\n+([\s\S]*?)(?=\n##|$)/)?.[1]?.trim() ?? "";
      return q1After.length > 10 && q2After.length > 10;
    },
  },
];

export const PROMPT_VARIANTS = ["default", "minimal", "direct", "verbose", "ultra-minimal", "task-explicit"];

export const MODELS = [
  "gemma4:e2b",
  "phi4-mini:3.8b",
  "llama3.2:3b",
  "qwen3.5:0.8b",
  "gpt-oss:20b",
  "qwen3.6:35b",
];
