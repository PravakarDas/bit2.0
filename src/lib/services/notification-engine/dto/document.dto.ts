// NOTE: Prisma's model is named `Document`, which collides with the DOM's global
// `Document` type (this project's tsconfig includes the `dom` lib). Aliased on
// import everywhere in this module to avoid ever shadowing the DOM type.
import type { Document as DocumentModel } from "@prisma/client";

export type DocumentDTO = DocumentModel;

export type CreateDocumentInput = Pick<DocumentModel, "type" | "sourceEntityId"> &
  Partial<Pick<DocumentModel, "status" | "localTempPath">>;

export type UpdateDocumentInput = Partial<
  Pick<DocumentModel, "status" | "localTempPath" | "driveFileId" | "driveFileUrl" | "generatedAt" | "uploadedAt">
>;

export interface DocumentQueryCriteria {
  type?: string;
  status?: DocumentModel["status"];
  sourceEntityId?: string;
  take?: number;
  skip?: number;
}
