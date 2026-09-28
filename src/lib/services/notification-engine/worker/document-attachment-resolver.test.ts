import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DocumentAttachmentResolver } from "./document-attachment-resolver";
import type { IDocumentRepository } from "../repositories/interfaces";
import type {
  CreateDocumentInput,
  CreateDocumentUploadAttemptInput,
  DocumentDTO,
  DocumentQueryCriteria,
  DocumentUploadAttemptDTO,
  UpdateDocumentInput,
} from "../dto";
import { DocumentError } from "../errors";

/** In-memory fake of `IDocumentRepository` — same style as every other fake repository in this test suite. */
class FakeDocumentRepository implements IDocumentRepository {
  private readonly documents = new Map<string, DocumentDTO>();

  seed(document: DocumentDTO): void {
    this.documents.set(document.id, document);
  }

  async create(_input: CreateDocumentInput): Promise<DocumentDTO> {
    throw new Error("not used in these tests");
  }
  async findById(id: string): Promise<DocumentDTO | null> {
    return this.documents.get(id) ?? null;
  }
  async findMany(_criteria?: DocumentQueryCriteria): Promise<DocumentDTO[]> {
    return [...this.documents.values()];
  }
  async update(_id: string, _input: UpdateDocumentInput): Promise<DocumentDTO> {
    throw new Error("not used in these tests");
  }
  async addUploadAttempt(_input: CreateDocumentUploadAttemptInput): Promise<DocumentUploadAttemptDTO> {
    throw new Error("not used in these tests");
  }
  async findUploadAttemptsByDocumentId(_documentId: string): Promise<DocumentUploadAttemptDTO[]> {
    throw new Error("not used in these tests");
  }
}

function fakeDocument(overrides: Partial<DocumentDTO> = {}): DocumentDTO {
  const now = new Date();
  return {
    id: "doc_1",
    type: "PAYSLIP",
    sourceEntityId: "payment_1",
    status: "GENERATED_LOCAL",
    localTempPath: null,
    driveFileId: null,
    driveFileUrl: null,
    generatedAt: now,
    uploadedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("DocumentAttachmentResolver.resolve", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "notification-engine-doc-test-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("resolves a real file into a NotificationAttachment with the exact bytes, basename filename, and inferred content type", async () => {
    const filePath = join(dir, "payslip-2026-08.pdf");
    const bytes = Buffer.from("%PDF-1.3 fake pdf bytes for testing");
    await writeFile(filePath, bytes);

    const repo = new FakeDocumentRepository();
    repo.seed(fakeDocument({ id: "doc_1", localTempPath: filePath }));
    const resolver = new DocumentAttachmentResolver(repo);

    const attachment = await resolver.resolve("doc_1");

    assert.equal(attachment.filename, "payslip-2026-08.pdf");
    assert.equal(attachment.contentType, "application/pdf");
    assert.ok(Buffer.isBuffer(attachment.content));
    assert.equal(attachment.content.length, bytes.length);
    assert.deepEqual(attachment.content, bytes); // exact bytes, not re-encoded/corrupted
  });

  it("infers application/octet-stream for an unrecognized extension", async () => {
    const filePath = join(dir, "mystery-file.xyz");
    await writeFile(filePath, Buffer.from("data"));

    const repo = new FakeDocumentRepository();
    repo.seed(fakeDocument({ localTempPath: filePath }));
    const resolver = new DocumentAttachmentResolver(repo);

    const attachment = await resolver.resolve("doc_1");
    assert.equal(attachment.contentType, "application/octet-stream");
  });

  it("throws DocumentError when the document does not exist", async () => {
    const repo = new FakeDocumentRepository(); // nothing seeded
    const resolver = new DocumentAttachmentResolver(repo);

    await assert.rejects(() => resolver.resolve("doc_missing"), DocumentError);
  });

  it("throws DocumentError when the document exists but is not yet GENERATED_LOCAL", async () => {
    const repo = new FakeDocumentRepository();
    repo.seed(fakeDocument({ status: "PENDING_GENERATION", localTempPath: null }));
    const resolver = new DocumentAttachmentResolver(repo);

    await assert.rejects(() => resolver.resolve("doc_1"), DocumentError);
  });

  it("throws DocumentError when status is GENERATED_LOCAL but localTempPath is somehow missing (invalid state)", async () => {
    const repo = new FakeDocumentRepository();
    repo.seed(fakeDocument({ status: "GENERATED_LOCAL", localTempPath: null }));
    const resolver = new DocumentAttachmentResolver(repo);

    await assert.rejects(() => resolver.resolve("doc_1"), DocumentError);
  });

  it("throws DocumentError when the file at localTempPath does not exist on disk", async () => {
    const repo = new FakeDocumentRepository();
    repo.seed(fakeDocument({ localTempPath: join(dir, "does-not-exist.pdf") }));
    const resolver = new DocumentAttachmentResolver(repo);

    await assert.rejects(() => resolver.resolve("doc_1"), DocumentError);
  });

  it("throws DocumentError when the file exists but is empty", async () => {
    const filePath = join(dir, "empty.pdf");
    await writeFile(filePath, Buffer.alloc(0));

    const repo = new FakeDocumentRepository();
    repo.seed(fakeDocument({ localTempPath: filePath }));
    const resolver = new DocumentAttachmentResolver(repo);

    await assert.rejects(() => resolver.resolve("doc_1"), DocumentError);
  });

  it("throws DocumentError when the file exceeds the configured max attachment size", async () => {
    const filePath = join(dir, "oversized.pdf");
    await writeFile(filePath, Buffer.from("this file is bigger than the tiny test limit"));

    const repo = new FakeDocumentRepository();
    repo.seed(fakeDocument({ localTempPath: filePath }));
    const resolver = new DocumentAttachmentResolver(repo, 10); // 10-byte limit, deliberately tiny for a fast test

    await assert.rejects(() => resolver.resolve("doc_1"), DocumentError);
  });

  it("never includes file content/bytes in the thrown error's message", async () => {
    const filePath = join(dir, "secret.pdf");
    await writeFile(filePath, Buffer.from("THIS-SHOULD-NEVER-APPEAR-IN-AN-ERROR-MESSAGE"));

    const repo = new FakeDocumentRepository();
    repo.seed(fakeDocument({ localTempPath: filePath }));
    const resolver = new DocumentAttachmentResolver(repo, 5); // force the size-limit failure path

    try {
      await resolver.resolve("doc_1");
      assert.fail("expected resolve() to throw");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      assert.ok(!message.includes("THIS-SHOULD-NEVER-APPEAR-IN-AN-ERROR-MESSAGE"));
    }
  });
});
