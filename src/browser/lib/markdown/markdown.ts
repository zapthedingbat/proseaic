export type LineType =
  | "h1" | "h2" | "h3" | "h4" | "h5" | "h6"
  | "blockquote" | "fence-open" | "fence-body" | "fence-close"
  | "list-ul" | "list-ol"
  | "hr" | "blank" | "paragraph";

export interface MdLine {
  type: LineType;
  raw: string;
}

export interface MdSection {
  id: string;
  level: number;           // 0 = root, 1-6 = heading level
  headingLine: MdLine | null;
  bodyLines: MdLine[];
  children: MdSection[];
}