---
title: Usage
---

# Usage

## The Interface

ProseAiC has three main areas:

- **Document panel** (centre) — your writing area, with a tab bar for open documents
- **Chat panel** (right) — talk to the AI assistant
- **Outline panel** (left) — navigate the structure of the current document

Use the menu bar at the top to open and create documents, and to access settings.

---

## Writing Documents

### Creating a document

Click **New** in the menu bar. Enter a name when prompted. Documents are saved as Markdown files on the server.

### Editing

Documents are written in [Markdown](https://commonmark.org). The editor supports:

- Headings (`#`, `##`, `###`, …)
- Bold and italic (`**bold**`, `_italic_`)
- Lists (ordered and unordered)
- Links, code blocks, blockquotes

### Saving

Changes are saved manually. Use **Save** in the menu bar, or press `Ctrl+S` / `Cmd+S`. The title bar shows an unsaved indicator when there are changes.

### Document outline

The outline panel on the left shows the heading structure of the current document. Click any heading to jump to it. This is especially useful for long documents.

---

## Talking to the AI

The chat panel lets you have a conversation with the AI assistant. You can ask it to:

- **Draft content** — "Write an introduction for this document"
- **Edit content** — "Rewrite the second section to be more concise"
- **Restructure** — "Move the FAQ section to the end"
- **Review** — "Check this for clarity and suggest improvements"

The assistant has direct access to your documents through tool calls — it reads and writes document content automatically, without you having to copy and paste.

### Model selection

Use the dropdown at the top of the chat panel to choose which AI model to use. Models are listed from whichever platforms you've configured in Settings.

### How the AI edits documents

When you ask the AI to make changes, it follows this workflow:

1. **Reads the document outline** to understand its structure
2. **Reads relevant sections** to see the exact current content
3. **Makes the edits** using document tools (insert, replace, remove, or move sections)
4. **Reports back** when it's done

Changes appear in the editor immediately. You can undo them with `Ctrl+Z` / `Cmd+Z` if needed.

### What the AI can do with documents

| Action | Description |
|---|---|
| Create document | Create a new document and open it |
| List documents | See all available documents |
| Open document | Open a specific document in the editor |
| Rename document | Rename or move a document |
| Read outline | Read the full structure of a document |
| Read section | Read the content of a specific section |
| Insert section | Add a new section with content |
| Replace section | Rewrite the content of an existing section |
| Remove section | Delete a section |
| Move section | Move a section to a different position |
| Replace selection | Replace the currently selected text |

---

## Tips

- **Be specific** when asking for edits: "Rewrite the introduction to be more formal" works better than "improve this".
- **Use the outline** to navigate large documents before asking the AI to edit a specific section.
- **The AI sees one document at a time.** If you want it to work on a specific document, make sure it's open and focused.
- **Sensitive content**: your documents are stored locally on your server. With a local Ollama model, nothing leaves your machine.
