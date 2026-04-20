
export interface IEditableText {
  replaceSelection(text: string): void;
  getTextContent(): string;
  setTextContent(content: string): void;
}
