import type {
  CreateDocumentInput,
  CreateDocumentUploadAttemptInput,
  DocumentDTO,
  DocumentQueryCriteria,
  DocumentUploadAttemptDTO,
  UpdateDocumentInput,
} from "../../dto";

/**
 * Data access for `Document` and its `DocumentUploadAttempt` history. No PDF
 * generation, no Google Drive calls — see NotificationEngineDesign.md
 * §11-§15 for where that logic will live in a later phase.
 */
export interface IDocumentRepository {
  create(input: CreateDocumentInput): Promise<DocumentDTO>;
  findById(id: string): Promise<DocumentDTO | null>;
  findMany(criteria?: DocumentQueryCriteria): Promise<DocumentDTO[]>;
  update(id: string, input: UpdateDocumentInput): Promise<DocumentDTO>;
  addUploadAttempt(input: CreateDocumentUploadAttemptInput): Promise<DocumentUploadAttemptDTO>;
  findUploadAttemptsByDocumentId(documentId: string): Promise<DocumentUploadAttemptDTO[]>;
}
