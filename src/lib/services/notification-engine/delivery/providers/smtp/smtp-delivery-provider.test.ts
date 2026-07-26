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
