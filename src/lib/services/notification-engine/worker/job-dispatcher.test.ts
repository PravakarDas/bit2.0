import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ChannelAdapterFactory, type ChannelDeliveryOutcome, type NotificationChannelAdapter, type RenderedNotificationContent } from "../factories";
import type { NotificationJobDTO, NotificationEventDTO, CreateNotificationEventInput, NotificationEventQueryCriteria } from "../dto";
import type { INotificationRepository } from "../repositories/interfaces";
import type { ITemplateEngine } from "../template/template-engine.interface";
import type { RenderParams, PreviewParams } from "../template/render-params";
import type { CompiledTemplate, TemplateSource, TemplateValidationResult } from "../template/types";
import type { RegisterTemplateInput } from "../template/register-template-input";
import type { TemplateValidationOptions } from "../template/template-validator";
import type { NotificationTemplateDTO } from "../dto";
import type { NotificationChannel } from "../types/enums";
import { JobDispatcher } from "./job-dispatcher";
import { ExecutionContext } from "./execution-context";
import { ProviderNotImplementedError } from "./errors";
import { registerStubChannelAdapters } from "./channel-adapters";
import { TemplateNotFoundError } from "../template/errors";
import type { IDocumentAttachmentResolver } from "./document-attachment-resolver";
import type { NotificationAttachment } from "../factories";
import { DocumentError } from "../errors";

function fakeJob(overrides: Partial<NotificationJobDTO> = {}): NotificationJobDTO {
  const now = new Date();
  return {
    id: "job_1",
    eventId: "evt_1",
    channel: "EMAIL",
    recipientUserId: null,
    recipientAddress: "jane@example.com",
    idempotencyKey: "key_1",
    status: "PROCESSING",
    attemptCount: 0,
    maxAttempts: 5,
    nextAttemptAt: now,
    lockedAt: now,
    lockedBy: "worker-1",
    documentId: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/** Mock Provider Adapter — controllable success/failure/hang, per this phase's explicit testing instruction. */
class MockAdapter implements NotificationChannelAdapter {
  readonly channel = "EMAIL" as const;
  /** Records whatever content JobDispatcher actually handed to send() — used by Phase 8's rendering tests. */
  receivedContent: RenderedNotificationContent | null = null;

  constructor(
    private readonly behavior:
      | { kind: "succeed"; result: ChannelDeliveryOutcome }
      | { kind: "throw"; error: unknown }
      | { kind: "hang" }
  ) {}

  async send(_job: NotificationJobDTO, content: RenderedNotificationContent): Promise<ChannelDeliveryOutcome> {
    this.receivedContent = content;
    if (this.behavior.kind === "succeed") return this.behavior.result;
    if (this.behavior.kind === "throw") throw this.behavior.error;
    return new Promise(() => {}); // never resolves — for cancellation tests
  }
}

/** In-memory fake of `INotificationRepository` — used only to test JobDispatcher's Phase 8 render step in isolation. */
class FakeEventRepository implements INotificationRepository {
  private readonly events = new Map<string, NotificationEventDTO>();

  seed(event: NotificationEventDTO): void {
    this.events.set(event.id, event);
  }

  async create(): Promise<NotificationEventDTO> {
    throw new Error("not used in these tests");
  }
  async findById(id: string): Promise<NotificationEventDTO | null> {
    return this.events.get(id) ?? null;
  }
  async findByDedupeKey(): Promise<NotificationEventDTO | null> {
    throw new Error("not used in these tests");
  }
  async findMany(): Promise<NotificationEventDTO[]> {
    return [];
  }
}

function fakeEvent(overrides: Partial<NotificationEventDTO> = {}): NotificationEventDTO {
  const now = new Date();
  return {
    id: "evt_1",
    eventType: "LOAN_APPROVED",
    dedupeKey: "LOAN_APPROVED:loan_1",
    payload: { employee: { name: "Jane Doe" } },
    sourceDomain: "loan",
    triggeredByUserId: null,
    createdAt: now,
    ...overrides,
  };
}

/** Minimal fake of `ITemplateEngine` — only `render()` is exercised by JobDispatcher; every other method is unused here. */
class FakeTemplateEngine implements ITemplateEngine {
  renderCalls: RenderParams[] = [];

  constructor(private readonly behavior: { kind: "render"; content: RenderedNotificationContent } | { kind: "throw"; error: unknown }) {}

  async render(params: RenderParams): Promise<RenderedNotificationContent> {
    this.renderCalls.push(params);
    if (this.behavior.kind === "throw") throw this.behavior.error;
    return this.behavior.content;
  }
  async preview(_params: PreviewParams): Promise<RenderedNotificationContent> {
    throw new Error("not used in these tests");
  }
  validate(_source: TemplateSource, _options?: TemplateValidationOptions): TemplateValidationResult {
    throw new Error("not used in these tests");
  }
  compile(_source: TemplateSource, _templateKey?: string): CompiledTemplate {
    throw new Error("not used in these tests");
  }
  async register(_input: RegisterTemplateInput): Promise<NotificationTemplateDTO> {
    throw new Error("not used in these tests");
  }
  async unregister(_key: string, _channel: NotificationChannel, _locale?: string): Promise<void> {
    throw new Error("not used in these tests");
  }
  async list(_filter?: { key?: string; channel?: NotificationChannel }): Promise<NotificationTemplateDTO[]> {
    throw new Error("not used in these tests");
  }
  async exists(_key: string, _channel: NotificationChannel, _locale?: string): Promise<boolean> {
    throw new Error("not used in these tests");
  }
}

describe("JobDispatcher.dispatch", () => {
  it("returns SUCCESS when the adapter resolves", async () => {
    const factory = new ChannelAdapterFactory();
    factory.register(new MockAdapter({ kind: "succeed", result: { outcome: "SUCCESS" } }));
    const dispatcher = new JobDispatcher(factory);
    const job = fakeJob();
    const context = new ExecutionContext(job, "worker-1");

    const outcome = await dispatcher.dispatch(job, context);
    assert.equal(outcome.kind, "SUCCESS");
  });

  it("returns PROVIDER_NOT_IMPLEMENTED when no real adapter is registered (empty factory)", async () => {
    const factory = new ChannelAdapterFactory(); // nothing registered
    const dispatcher = new JobDispatcher(factory);
    const job = fakeJob();
    const context = new ExecutionContext(job, "worker-1");

    const outcome = await dispatcher.dispatch(job, context);
    assert.equal(outcome.kind, "PROVIDER_NOT_IMPLEMENTED");
  });

  it("returns PROVIDER_NOT_IMPLEMENTED for every channel once stub adapters are registered (registerStubChannelAdapters)", async () => {
    const factory = new ChannelAdapterFactory();
    registerStubChannelAdapters(factory);
    const dispatcher = new JobDispatcher(factory);
    const job = fakeJob({ channel: "SMS" });
    const context = new ExecutionContext(job, "worker-1");

    const outcome = await dispatcher.dispatch(job, context);
    assert.equal(outcome.kind, "PROVIDER_NOT_IMPLEMENTED");
    if (outcome.kind === "PROVIDER_NOT_IMPLEMENTED") {
      assert.ok(outcome.error instanceof ProviderNotImplementedError);
      assert.equal(outcome.error.channel, "SMS");
    }
  });

  it("returns FAILURE when the adapter throws a generic error", async () => {
    const factory = new ChannelAdapterFactory();
    factory.register(new MockAdapter({ kind: "throw", error: new Error("network blip") }));
    const dispatcher = new JobDispatcher(factory);
    const job = fakeJob();
    const context = new ExecutionContext(job, "worker-1");

    const outcome = await dispatcher.dispatch(job, context);
    assert.equal(outcome.kind, "FAILURE");
  });

  it("returns CANCELLED when the execution context is cancelled before dispatch begins", async () => {
    const factory = new ChannelAdapterFactory();
    factory.register(new MockAdapter({ kind: "hang" }));
    const dispatcher = new JobDispatcher(factory);
    const job = fakeJob();
    const context = new ExecutionContext(job, "worker-1");
    context.cancel("test cancellation");

    const outcome = await dispatcher.dispatch(job, context);
    assert.equal(outcome.kind, "CANCELLED");
  });

  it("returns CANCELLED when the context is cancelled while the adapter call is in flight", async () => {
    const factory = new ChannelAdapterFactory();
    factory.register(new MockAdapter({ kind: "hang" }));
    const dispatcher = new JobDispatcher(factory);
    const job = fakeJob();
    const context = new ExecutionContext(job, "worker-1");

    const dispatchPromise = dispatcher.dispatch(job, context);
    context.cancel("mid-flight cancellation");
    const outcome = await dispatchPromise;
    assert.equal(outcome.kind, "CANCELLED");
  });
});

describe("JobDispatcher — Phase 8 template rendering", () => {
  it("passes {} content when eventRepository/templateEngine are not supplied (pre-Phase-8 backward compatibility)", async () => {
    const factory = new ChannelAdapterFactory();
    const adapter = new MockAdapter({ kind: "succeed", result: { outcome: "SUCCESS" } });
    factory.register(adapter);
    const dispatcher = new JobDispatcher(factory);
    const job = fakeJob();

    await dispatcher.dispatch(job, new ExecutionContext(job, "worker-1"));
    assert.deepEqual(adapter.receivedContent, {});
  });

  it("renders using the job's event (eventType as template key, payload as context, job.channel as channel) before calling the adapter", async () => {
    const factory = new ChannelAdapterFactory();
    const adapter = new MockAdapter({ kind: "succeed", result: { outcome: "SUCCESS" } });
    factory.register(adapter);

    const eventRepository = new FakeEventRepository();
    eventRepository.seed(fakeEvent({ id: "evt_1", eventType: "LOAN_APPROVED", payload: { employee: { name: "Jane Doe" } } }));
    const rendered: RenderedNotificationContent = { subject: "Loan approved for Jane Doe", bodyHtml: "<p>Hi Jane Doe</p>", bodyText: "Hi Jane Doe" };
    const templateEngine = new FakeTemplateEngine({ kind: "render", content: rendered });

    const dispatcher = new JobDispatcher(factory, undefined, eventRepository, templateEngine);
    const job = fakeJob({ eventId: "evt_1", channel: "EMAIL" });

    await dispatcher.dispatch(job, new ExecutionContext(job, "worker-1"));

    assert.equal(templateEngine.renderCalls.length, 1);
    assert.deepEqual(templateEngine.renderCalls[0], {
      key: "LOAN_APPROVED",
      channel: "EMAIL",
      context: { employee: { name: "Jane Doe" } },
    });
    assert.deepEqual(adapter.receivedContent, rendered);
  });

  it("falls back to {} render context when the event's payload isn't a plain object (e.g. an array or a primitive)", async () => {
    const factory = new ChannelAdapterFactory();
    const adapter = new MockAdapter({ kind: "succeed", result: { outcome: "SUCCESS" } });
    factory.register(adapter);

    const eventRepository = new FakeEventRepository();
    eventRepository.seed(fakeEvent({ id: "evt_1", payload: ["not", "an", "object"] }));
    const templateEngine = new FakeTemplateEngine({ kind: "render", content: {} });

    const dispatcher = new JobDispatcher(factory, undefined, eventRepository, templateEngine);
    const job = fakeJob({ eventId: "evt_1" });

    await dispatcher.dispatch(job, new ExecutionContext(job, "worker-1"));
    assert.deepEqual(templateEngine.renderCalls[0].context, {});
  });

  it("passes {} content (no render attempted) when the job's event cannot be found", async () => {
    const factory = new ChannelAdapterFactory();
    const adapter = new MockAdapter({ kind: "succeed", result: { outcome: "SUCCESS" } });
    factory.register(adapter);

    const eventRepository = new FakeEventRepository(); // nothing seeded
    const templateEngine = new FakeTemplateEngine({ kind: "render", content: { subject: "should never be used" } });

    const dispatcher = new JobDispatcher(factory, undefined, eventRepository, templateEngine);
    const job = fakeJob({ eventId: "evt_missing" });

    await dispatcher.dispatch(job, new ExecutionContext(job, "worker-1"));
    assert.deepEqual(adapter.receivedContent, {});
    assert.equal(templateEngine.renderCalls.length, 0);
  });

  it("a template rendering failure (e.g. TemplateNotFoundError) is caught like any other dispatch error and returns FAILURE — the job still retries, no new DispatchOutcome kind", async () => {
    const factory = new ChannelAdapterFactory();
    factory.register(new MockAdapter({ kind: "succeed", result: { outcome: "SUCCESS" } }));

    const eventRepository = new FakeEventRepository();
    eventRepository.seed(fakeEvent({ id: "evt_1" }));
    const templateEngine = new FakeTemplateEngine({ kind: "throw", error: new TemplateNotFoundError("LOAN_APPROVED", "EMAIL") });

    const dispatcher = new JobDispatcher(factory, undefined, eventRepository, templateEngine);
    const job = fakeJob({ eventId: "evt_1" });

    const outcome = await dispatcher.dispatch(job, new ExecutionContext(job, "worker-1"));
    assert.equal(outcome.kind, "FAILURE");
  });

  it("SMTP must never render templates, and DeliveryManager must never render templates — rendering happens exactly once, in JobDispatcher, before the adapter is ever called", async () => {
    const factory = new ChannelAdapterFactory();
    const adapter = new MockAdapter({ kind: "succeed", result: { outcome: "SUCCESS" } });
    factory.register(adapter);

    const eventRepository = new FakeEventRepository();
    eventRepository.seed(fakeEvent({ id: "evt_1" }));
    const templateEngine = new FakeTemplateEngine({ kind: "render", content: { subject: "rendered once" } });

    const dispatcher = new JobDispatcher(factory, undefined, eventRepository, templateEngine);
    const job = fakeJob({ eventId: "evt_1" });

    await dispatcher.dispatch(job, new ExecutionContext(job, "worker-1"));
    assert.equal(templateEngine.renderCalls.length, 1); // rendered exactly once, upstream of the adapter
    assert.deepEqual(adapter.receivedContent, { subject: "rendered once" });
  });
});

/** Minimal fake of `IDocumentAttachmentResolver` — only `resolve()` is exercised by JobDispatcher. */
class FakeDocumentAttachmentResolver implements IDocumentAttachmentResolver {
  resolveCalls: string[] = [];

  constructor(private readonly behavior: { kind: "resolve"; attachment: NotificationAttachment } | { kind: "throw"; error: unknown }) {}

  async resolve(documentId: string): Promise<NotificationAttachment> {
    this.resolveCalls.push(documentId);
    if (this.behavior.kind === "throw") throw this.behavior.error;
    return this.behavior.attachment;
  }
}

function fakeAttachment(overrides: Partial<NotificationAttachment> = {}): NotificationAttachment {
  return { filename: "payslip.pdf", contentType: "application/pdf", content: Buffer.from("%PDF-1.3"), ...overrides };
}

describe("JobDispatcher — Phase 18b document attachment resolution", () => {
  it("does not attempt attachment resolution when the job has no documentId, even if a resolver is supplied", async () => {
    const factory = new ChannelAdapterFactory();
    const adapter = new MockAdapter({ kind: "succeed", result: { outcome: "SUCCESS" } });
    factory.register(adapter);

    const resolver = new FakeDocumentAttachmentResolver({ kind: "resolve", attachment: fakeAttachment() });
    const dispatcher = new JobDispatcher(factory, undefined, undefined, undefined, resolver);
    const job = fakeJob({ documentId: null });

    await dispatcher.dispatch(job, new ExecutionContext(job, "worker-1"));
    assert.equal(resolver.resolveCalls.length, 0);
    assert.deepEqual(adapter.receivedContent, {});
  });

  it("does not attempt attachment resolution when the job has a documentId but no resolver is supplied (pre-Phase-18b backward compatibility)", async () => {
    const factory = new ChannelAdapterFactory();
    const adapter = new MockAdapter({ kind: "succeed", result: { outcome: "SUCCESS" } });
    factory.register(adapter);

    const dispatcher = new JobDispatcher(factory); // no resolver at all
    const job = fakeJob({ documentId: "doc_1" });

    const outcome = await dispatcher.dispatch(job, new ExecutionContext(job, "worker-1"));
    assert.equal(outcome.kind, "SUCCESS");
    assert.deepEqual(adapter.receivedContent, {});
  });

  it("resolves the document and merges it onto the rendered content as a single-element attachments array", async () => {
    const factory = new ChannelAdapterFactory();
    const adapter = new MockAdapter({ kind: "succeed", result: { outcome: "SUCCESS" } });
    factory.register(adapter);

    const attachment = fakeAttachment({ filename: "payslip-2026-08.pdf" });
    const resolver = new FakeDocumentAttachmentResolver({ kind: "resolve", attachment });
    const dispatcher = new JobDispatcher(factory, undefined, undefined, undefined, resolver);
    const job = fakeJob({ documentId: "doc_1" });

    await dispatcher.dispatch(job, new ExecutionContext(job, "worker-1"));

    assert.deepEqual(resolver.resolveCalls, ["doc_1"]);
    assert.deepEqual(adapter.receivedContent, { attachments: [attachment] });
  });

  it("merges the attachment onto template-rendered content, not in place of it", async () => {
    const factory = new ChannelAdapterFactory();
    const adapter = new MockAdapter({ kind: "succeed", result: { outcome: "SUCCESS" } });
    factory.register(adapter);

    const eventRepository = new FakeEventRepository();
    eventRepository.seed(fakeEvent({ id: "evt_1" }));
    const rendered: RenderedNotificationContent = { subject: "Payroll processed", bodyHtml: "<p>hi</p>", bodyText: "hi" };
    const templateEngine = new FakeTemplateEngine({ kind: "render", content: rendered });

    const attachment = fakeAttachment();
    const resolver = new FakeDocumentAttachmentResolver({ kind: "resolve", attachment });
    const dispatcher = new JobDispatcher(factory, undefined, eventRepository, templateEngine, resolver);
    const job = fakeJob({ eventId: "evt_1", documentId: "doc_1" });

    await dispatcher.dispatch(job, new ExecutionContext(job, "worker-1"));

    assert.deepEqual(adapter.receivedContent, { ...rendered, attachments: [attachment] });
  });

  it("a document that fails to resolve (e.g. DocumentError) is a controlled FAILURE, not a silent send without the attachment", async () => {
    const factory = new ChannelAdapterFactory();
    const adapter = new MockAdapter({ kind: "succeed", result: { outcome: "SUCCESS" } });
    factory.register(adapter);

    const resolver = new FakeDocumentAttachmentResolver({ kind: "throw", error: new DocumentError("Document not found: doc_missing", "doc_missing") });
    const dispatcher = new JobDispatcher(factory, undefined, undefined, undefined, resolver);
    const job = fakeJob({ documentId: "doc_missing" });

    const outcome = await dispatcher.dispatch(job, new ExecutionContext(job, "worker-1"));

    assert.equal(outcome.kind, "FAILURE");
    assert.equal(adapter.receivedContent, null); // the adapter (and therefore SMTP) was never called
  });
});
