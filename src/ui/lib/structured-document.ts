import { MdSection } from "./markdown/markdown";

export interface IStructuredDocument {
  insertSection(sectionTitle: string, sectionContent: string, insertBeforeSectionId?: string): void;
  moveSection(sectionId: string, insertBeforeSectionId?: string): void;
  removeSection(sectionId: string): void;
  replaceSection(sectionId: string, sectionContent: string): void;
  getSectionContent(sectionId: string): string;
  getOutline(): MdSection;
}
