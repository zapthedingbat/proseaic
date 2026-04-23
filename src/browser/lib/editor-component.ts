import { IEditableText } from "./document/editable-text";
import { IStructuredDocument } from "./document/structured-document";

export interface IEditorComponent extends IEditableText, IStructuredDocument, HTMLElement {
}
