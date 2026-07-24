import type { DocumentUploadAttempt } from "@prisma/client";

export type DocumentUploadAttemptDTO = DocumentUploadAttempt;

export type CreateDocumentUploadAttemptInput = Pick<
  DocumentUploadAttempt,
  "documentId" | "attemptNumber" | "outcome"
> &
  Partial<Pick<DocumentUploadAttempt, "errorMessage">>;
