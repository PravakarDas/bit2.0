import type { CreateDocumentInput } from "../dto";

export interface BuildDocumentParams {
  type: string;
  sourceEntityId: string;
}

/**
 * Builds a well-formed `CreateDocumentInput` with the correct initial state
 * (`PENDING_GENERATION`, per the Document state machine — Design §23). Does
 * NOT generate a PDF and does NOT talk to Google Drive — see
 * NotificationEngineDesign.md §11-§15 for where that logic will live.
 */
export class DocumentFactory {
  static build(params: BuildDocumentParams): CreateDocumentInput {
    return {
      type: params.type,
      sourceEntityId: params.sourceEntityId,
      status: "PENDING_GENERATION",
    };
  }
}
