import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TemplateEngine } from "../../../template/template-engine";
import { TemplateRegistry } from "../../../template/template-registry";
import { FakeNotificationTemplateRepository } from "../../../template/test-fakes/fake-notification-template.repository";
import { SmtpDeliveryProvider } from "./smtp-delivery-provider";
import { SmtpConnectionManager } from "./smtp-connection-manager";
import { FakeTransporter } from "./test-fakes/fake-transporter";
import { DeliveryManager } from "../../delivery-manager";
import { ProviderRegistry } from "../../provider-registry";
import { ProviderResolver } from "../../provider-resolver";
import { ProviderHealthMonitor } from "../../provider-health-monitor";
import { ProviderMetricsCollector } from "../../provider-metrics";
import { createProviderDescriptor } from "../../types/provider-descriptor";
import { ProviderPriority } from "../../value-objects/provider-priority";
import { buildSmtpCapabilities } from "./smtp-capability-descriptor";
import { fakeJob } from "../../test-fakes/fake-job";
import { NotificationChannel } from "../../../types/enums";
import type { ResolvedEmailConfig } from "../../../../../smtp-shared";

const config: ResolvedEmailConfig = {
  smtpHost: "smtp.gmail.com",
  smtpPort: 587,
  secure: false,
  senderEmail: "notifications@example.com",
  appPassword: "app-password",
};

/**
 * Proves this phase's "Template Integration" requirement end to end:
 * `TemplateEngine.render()` (Phase 5, unmodified) produces a
 * `RenderedNotificationContent`, which flows — unmodified, no re-rendering
 * inside SMTP — into `DeliveryManager.deliver()` (Phase 6, unmodified) and
 * finally into `SmtpDeliveryProvider.deliver()` (this phase), whose only
 * job is to hand `content.subject`/`.bodyHtml`/`.bodyText` to nodemailer.
 * The mocked transporter captures exactly what was sent, so this test
 * verifies the rendered variable substitution (`{{employee.name}}` ->
 * "Jane Doe") reached the SMTP layer byte-for-byte.
 */
describe("Integration: TemplateEngine -> DeliveryManager -> SmtpDeliveryProvider", () => {
  it("delivers the exact content TemplateEngine rendered, with no template logic inside SMTP", async () => {
    const templateEngine = new TemplateEngine(new TemplateRegistry(new FakeNotificationTemplateRepository()));
    await templateEngine.register({
      key: "LOAN_APPROVED",
      channel: NotificationChannel.EMAIL,
      subjectTemplate: "Loan approved for {{employee.name}}",
      bodyTemplateHtml: "<p>Hi {{employee.name}}, your loan was approved.</p>",
      bodyTemplateText: "Hi {{employee.name}}, your loan was approved.",
    });

    const renderedContent = await templateEngine.render({
      key: "LOAN_APPROVED",
      channel: NotificationChannel.EMAIL,
      context: { employee: { name: "Jane Doe" } },
    });

    assert.equal(renderedContent.subject, "Loan approved for Jane Doe");

    const fake = new FakeTransporter("success");
    const providerRegistry = new ProviderRegistry();
    providerRegistry.register(
      createProviderDescriptor({
        id: "smtp-primary",
        name: "Primary SMTP",
        channel: NotificationChannel.EMAIL,
        priority: ProviderPriority.of(1),
        capabilities: buildSmtpCapabilities(),
      }),
      new SmtpDeliveryProvider(new SmtpConnectionManager(() => fake.asTransporter()), undefined, undefined, undefined, async () => config)
    );
    const health = new ProviderHealthMonitor();
    const deliveryManager = new DeliveryManager(new ProviderResolver(providerRegistry, health), health, new ProviderMetricsCollector());

    const job = fakeJob({ channel: "EMAIL", recipientAddress: "jane@example.com" });
    const outcome = await deliveryManager.deliver(job, renderedContent);

    assert.equal(outcome.kind, "SUCCESS");
    assert.equal(fake.sendMailCalls.length, 1);
    assert.deepEqual(fake.sendMailCalls[0], {
      from: "notifications@example.com",
      to: "jane@example.com",
      subject: "Loan approved for Jane Doe",
      html: "<p>Hi Jane Doe, your loan was approved.</p>",
      text: "Hi Jane Doe, your loan was approved.",
    });
  });
});
