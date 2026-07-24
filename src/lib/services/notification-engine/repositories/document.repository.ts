import { prisma } from "@/lib/prisma";
import { BaseRepository } from "./base.repository";
import type { IDocumentRepository } from "./interfaces";
import type {
  CreateDocumentInput,
  CreateDocumentUploadAttemptInput,
  DocumentDTO,
  DocumentQueryCriteria,
  DocumentUploadAttemptDTO,
  UpdateDocumentInput,
} from "../dto";

/** Pure data access for `Document` + `DocumentUploadAttempt`. No PDF generation, no Google Drive calls — see NotificationEngineDesign.md §11-§15. */
export class DocumentRepository extends BaseRepository implements IDocumentRepository {
  protected readonly repositoryName = "DocumentRepository";

  async create(input: CreateDocumentInput): Promise<DocumentDTO> {
    return this.wrap("create", () =>
      prisma.document.create({
        data: {
          type: input.type,
          sourceEntityId: input.sourceEntityId,
          status: input.status ?? "PENDING_GENERATION",
          localTempPath: input.localTempPath,
        },
      })
    );
  }

  async findById(id: string): Promise<DocumentDTO | null> {
    return this.wrap("findById", () => prisma.document.findUnique({ where: { id } }));
  }

  async findMany(criteria: DocumentQueryCriteria = {}): Promise<DocumentDTO[]> {
    return this.wrap("findMany", () =>
      prisma.document.findMany({
        where: {
          type: criteria.type,
          status: criteria.status,
          sourceEntityId: criteria.sourceEntityId,
        },
        orderBy: { createdAt: "desc" },
        take: criteria.take,
        skip: criteria.skip,
      })
    );
  }

  async update(id: string, input: UpdateDocumentInput): Promise<DocumentDTO> {
    return this.wrap("update", () =>
      prisma.document.update({
        where: { id },
        data: input,
      })
    );
  }

  async addUploadAttempt(input: CreateDocumentUploadAttemptInput): Promise<DocumentUploadAttemptDTO> {
    return this.wrap("addUploadAttempt", () =>
      prisma.documentUploadAttempt.create({
        data: {
          documentId: input.documentId,
          attemptNumber: input.attemptNumber,
          outcome: input.outcome,
          errorMessage: input.errorMessage,
        },
      })
    );
  }

  async findUploadAttemptsByDocumentId(documentId: string): Promise<DocumentUploadAttemptDTO[]> {
    return this.wrap("findUploadAttemptsByDocumentId", () =>
      prisma.documentUploadAttempt.findMany({
        where: { documentId },
        orderBy: { attemptNumber: "asc" },
      })
    );
  }
}
