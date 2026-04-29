import type { Page, Locator } from "@playwright/test";

export class MenuBarPage {
  constructor(private readonly page: Page) {}

  save(): Locator { return this.page.locator('button[data-app-action="save"]'); }
  saveAs(): Locator { return this.page.locator('button[data-app-action="save-as"]'); }
}

export class DocumentsPanelPage {
  constructor(private readonly page: Page) {}

  pane(): Locator { return this.page.locator("ui-pane", { hasText: "Documents" }); }
  items(): Locator { return this.pane().locator(".list-item"); }
  item(title: string): Locator { return this.pane().locator(".list-item-title", { hasText: title }); }
  newDocumentButton(): Locator { return this.pane().locator('button[title="New document"]'); }
  renameInput(): Locator { return this.pane().locator('input[type="text"].input'); }
  renameError(): Locator { return this.pane().locator(".input-error"); }

  async createDocument(): Promise<void> { await this.newDocumentButton().click(); }
  async openDocument(title: string): Promise<void> { await this.item(title).click(); }
}

export class OutlinePanelPage {
  constructor(private readonly page: Page) {}

  pane(): Locator { return this.page.locator("ui-pane", { hasText: "Outline" }); }
  itemTitles(): Locator { return this.pane().locator(".list-item-title"); }
  emptyState(): Locator { return this.page.locator("ui-document-outline-panel .cover.empty"); }
}

export class ChatPanelPage {
  constructor(private readonly page: Page) {}

  pane(): Locator { return this.page.locator("ui-pane", { hasText: "Chat" }); }
  textarea(): Locator { return this.page.locator("ui-chat-panel #chat-textarea"); }
  settingsButton(): Locator { return this.pane().locator('button[title="Settings"]'); }

  async openSettings(): Promise<void> { await this.settingsButton().click(); }
}

export class TabBarPage {
  constructor(private readonly page: Page) {}

  tab(title: string): Locator { return this.page.locator('ui-tab-bar [role="tab"]', { hasText: title }); }
  activeTab(): Locator { return this.page.locator('ui-tab-bar [role="tab"][aria-selected="true"]'); }
  allTabs(): Locator { return this.page.locator('ui-tab-bar [role="tab"]'); }
}

export class EditorPage {
  constructor(private readonly page: Page) {}

  async getContent(): Promise<string> {
    return this.page.evaluate(() => {
      const editor = document.querySelector("codemirror-editor");
      return (editor as { getContent?(): string } | null)?.getContent?.() ?? "";
    });
  }

  // Returns the document text — equivalent to getContent() for the CodeMirror editor.
  async getRenderedText(): Promise<string> {
    return this.getContent();
  }

  async type(text: string): Promise<void> {
    await this.page.evaluate(() => {
      const editor = document.querySelector("codemirror-editor");
      const cm = editor?.shadowRoot?.querySelector(".cm-content") as HTMLElement | null;
      cm?.focus();
    });
    await this.page.keyboard.type(text);
  }

  async focusEnd(): Promise<void> {
    await this.page.evaluate(() => {
      const editor = document.querySelector("codemirror-editor");
      const cm = editor?.shadowRoot?.querySelector(".cm-content") as HTMLElement | null;
      cm?.focus();
    });
    await this.page.keyboard.press("Control+End");
  }
}

export class AppPage {
  readonly menuBar: MenuBarPage;
  readonly documents: DocumentsPanelPage;
  readonly outline: OutlinePanelPage;
  readonly chat: ChatPanelPage;
  readonly tabBar: TabBarPage;
  readonly editor: EditorPage;

  constructor(private readonly page: Page) {
    this.menuBar = new MenuBarPage(page);
    this.documents = new DocumentsPanelPage(page);
    this.outline = new OutlinePanelPage(page);
    this.chat = new ChatPanelPage(page);
    this.tabBar = new TabBarPage(page);
    this.editor = new EditorPage(page);
  }

  async goto(): Promise<void> { await this.page.goto("/"); }
  settings(): Locator { return this.page.locator("#ui-settings-panel"); }
  async closeSettings(): Promise<void> { await this.page.getByRole("button", { name: "✕" }).click(); }
}
