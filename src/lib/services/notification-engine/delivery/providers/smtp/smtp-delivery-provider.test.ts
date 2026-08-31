import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SmtpDeliveryProvider } from "./smtp-delivery-provider";
import { SmtpConnectionManager } from "./smtp-connection-manager";
import { FakeTransporter } from "./test-fakes/fake-transporter";
import { fakeJob } from "../../test-fakes/fake-job";
import { ProviderContext } from "../../provider";
import { NotificationChannel } from "../../../types/enums";
import { ProviderCapabilities } from "../../value-objects/provider-capabilities";
import type { ResolvedEmailConfig } from "../../../../../smtp-shared";

const config: ResolvedEmailConfig = {
  smtpHost: "smtp.gmail.com",
  smtpPort: 587,
  secure: false,
  senderEmail: "sender@example.com",
  appPassword: "app-password",
};

function buildContext(): ProviderContext {
  return new ProviderContext({
    providerId: "smtp-primary",
    providerName: "Primary SMTP",
    channel: NotificationChannel.EMAIL,
    capabilities: ProviderCapabilities.of({ htmlEmail: true }),
    attemptNumber: 1,
    correlationId: "corr-1",
  });
}

function buildProvider(fake: FakeTransporter, resolveConfig: () => Promise<ResolvedEmailConfig | null> = async () => config) {
  const connectionManager = new SmtpConnectionManager(() => fake.asTransporter());
  return new SmtpDeliveryProvider(connectionManager, undefined, undefined, undefined, resolveConfig);
}

describe("SmtpDeliveryProvider.deliver", () => {
  it("sends via the transporter and returns SUCCESS", async () => {
    const fake = new FakeTransporter("success");
    const provider = buildProvider(fake);

    const result = await provider.deliver(fakeJob({ recipientAddress: "jane@example.com" }), { subject: "Hi", bodyHtml: "<p>hi</p>", bodyText: "hi" }, buildContext());

    assert.equal(result.status, "SUCCESS");
    assert.equal(fake.sendMailCalls.length, 1);
    assert.deepEqual(fake.sendMailCalls[0], {
      from: "sender@example.com",
      to: "jane@example.com",
      subject: "Hi",
      html: "<p>hi</p>",
      text: "hi",
    });
  });

  it("defaults subject to an empty string when the rendered content has none", async () => {
    const fake = new FakeTransporter("success");
    const provider = buildProvider(fake);
    await provider.deliver(fakeJob(), {}, buildContext());
    assert.equal((fake.sendMailCalls[0] as { subject: string }).subject, "");
  });

  it("returns a retryable TEMPORARY_FAILURE (not a crash) when SMTP is not configured", async () => {
    const fake = new FakeTransporter("success");
    const provider = buildProvider(fake, async () => null);

    const result = await provider.deliver(fakeJob(), {}, buildContext());
    assert.equal(result.status, "TEMPORARY_FAILURE");
    assert.equal(result.errorCode, "SMTP_NOT_CONFIGURED");
    assert.equal(fake.sendMailCalls.length, 0); // never attempted a send
  });

  it("returns TEMPORARY_FAILURE when the resolved config fails structural validation", async () => {
    const fake = new FakeTransporter("success");
    const provider = buildProvider(fake, async () => ({ ...config, smtpHost: "" }));

    const result = await provider.deliver(fakeJob(), {}, buildContext());
    assert.equal(result.status, "TEMPORARY_FAILURE");
    assert.equal(result.errorCode, "SMTP_NOT_CONFIGURED");
  });

  it("maps a permanent SMTP error (invalid envelope) to PERMANENT_FAILURE and invalidates the connection", async () => {
    class ThrowsEnvelopeTransporter extends FakeTransporter {
      async sendMail(): Promise<{ messageId: string }> {
        throw Object.assign(new Error("bad address"), { code: "EENVELOPE" });
      }
    }
    const fake = new ThrowsEnvelopeTransporter();
    const provider = buildProvider(fake);

    const result = await provider.deliver(fakeJob(), {}, buildContext());
    assert.equal(result.status, "PERMANENT_FAILURE");
    assert.equal(fake.closeCalls, 1); // connectionManager.invalidate() was called
  });

  it("maps a transient SMTP error (connection refused) to a retryable TEMPORARY_FAILURE", async () => {
    const fake = new FakeTransporter("throw-on-send");
    const provider = buildProvider(fake);

    const result = await provider.deliver(fakeJob(), {}, buildContext());
    assert.equal(result.status, "TEMPORARY_FAILURE");
    assert.equal(result.retryable, true);
  });
});

describe("SmtpDeliveryProvider.deliver — Phase 18b attachment forwarding", () => {
  it("omits the attachments key entirely when content has none — no-attachment call shape is byte-for-byte unchanged from before Phase 18b", async () => {
    const fake = new FakeTransporter("success");
    const provider = buildProvider(fake);

    await provider.deliver(fakeJob({ recipientAddress: "jane@example.com" }), { subject: "Hi", bodyHtml: "<p>hi</p>", bodyText: "hi" }, buildContext());

    assert.deepEqual(fake.sendMailCalls[0], {
      from: "sender@example.com",
      to: "jane@example.com",
      subject: "Hi",
      html: "<p>hi</p>",
      text: "hi",
    });
    assert.ok(!Object.prototype.hasOwnProperty.call(fake.sendMailCalls[0], "attachments"));
  });

  it("omits the attachments key when content.attachments is an empty array", async () => {
    const fake = new FakeTransporter("success");
    const provider = buildProvider(fake);

    await provider.deliver(fakeJob(), { subject: "Hi", attachments: [] }, buildContext());

    assert.ok(!Object.prototype.hasOwnProperty.call(fake.sendMailCalls[0], "attachments"));
  });

  it("forwards a single attachment through to the transporter with the exact filename, contentType, and bytes", async () => {
    const fake = new FakeTransporter("success");
    const provider = buildProvider(fake);
    const pdfBytes = Buffer.from("%PDF-1.3 fake payslip bytes");

    await provider.deliver(
      fakeJob({ recipientAddress: "jane@example.com" }),
      {
        subject: "Your payslip",
        bodyHtml: "<p>See attached</p>",
        bodyText: "See attached",
        attachments: [{ filename: "payslip-2026-08.pdf", contentType: "application/pdf", content: pdfBytes }],
      },
      buildContext()
    );

    assert.equal(fake.sendMailCalls.length, 1);
    const call = fake.sendMailCalls[0] as { attachments?: Array<{ filename: string; contentType: string; content: Buffer }> };
    assert.equal(call.attachments?.length, 1);
    assert.equal(call.attachments?.[0].filename, "payslip-2026-08.pdf");
    assert.equal(call.attachments?.[0].contentType, "application/pdf");
    assert.ok(Buffer.isBuffer(call.attachments?.[0].content));
    assert.deepEqual(call.attachments?.[0].content, pdfBytes); // the transporter receives the exact same bytes, not a re-encoded copy
  });

  it("delivery still reports SUCCESS when an attachment is present", async () => {
    const fake = new FakeTransporter("success");
    const provider = buildProvider(fake);

    const result = await provider.deliver(
      fakeJob(),
      { subject: "Hi", attachments: [{ filename: "a.pdf", contentType: "application/pdf", content: Buffer.from("x") }] },
      buildContext()
    );

    assert.equal(result.status, "SUCCESS");
  });
});

describe("SmtpDeliveryProvider lifecycle", () => {
  it("initialize() resolves without touching the network", async () => {
    const provider = buildProvider(new FakeTransporter());
    await assert.doesNotReject(() => provider.initialize());
  });

  it("shutdown() closes the underlying connection", async () => {
    const fake = new FakeTransporter("success");
    const provider = buildProvider(fake);
    await provider.deliver(fakeJob(), {}, buildContext()); // opens a connection
    await provider.shutdown();
    assert.equal(fake.closeCalls, 1);
  });

  it("healthCheck() reflects the connection probe result", async () => {
    const provider = buildProvider(new FakeTransporter("success"));
    assert.equal(await provider.healthCheck(), "HEALTHY");
  });

  it("healthCheck() reports MAINTENANCE when unconfigured", async () => {
    const provider = buildProvider(new FakeTransporter("success"), async () => null);
    assert.equal(await provider.healthCheck(), "MAINTENANCE");
  });

  it("validateConfiguration() reflects the resolved config's structural validity", async () => {
    const provider = buildProvider(new FakeTransporter(), async () => null);
    const result = await provider.validateConfiguration();
    assert.equal(result.valid, false);
  });
});
