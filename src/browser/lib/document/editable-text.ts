
export interface IEditableText {
  replaceSelection(text: string): void;
  getContent(): string;
  setContent(content: string): void;
}
