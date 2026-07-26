import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SmtpHealthChecker } from "./smtp-health-checker";
import { SmtpConnectionManager } from "./smtp-connection-manager";
import { FakeTransporter } from "./test-fakes/fake-transporter";
import type { ResolvedEmailConfig } from "../../../../../smtp-shared";

const config: ResolvedEmailConfig = {
  smtpHost: "smtp.gmail.com",
  smtpPort: 587,
  secure: false,
  senderEmail: "sender@example.com",
  appPassword: "app-password",
};

function buildManager(fake: FakeTransporter) {
  return new SmtpConnectionManager(() => fake.asTransporter());
}

describe("SmtpHealthChecker", () => {
  it("reports MAINTENANCE when unconfigured — not ready for traffic by design, not a probe failure", async () => {
    const checker = new SmtpHealthChecker();
    const manager = buildManager(new FakeTransporter("success"));
    assert.equal(await checker.check(manager, null), "MAINTENANCE");
  });

  it("reports HEALTHY when the connection probe succeeds", async () => {
    const checker = new SmtpHealthChecker();
    const manager = buildManager(new FakeTransporter("success"));
    assert.equal(await checker.check(manager, config), "HEALTHY");
  });

  it("reports OFFLINE when the connection probe fails", async () => {
    const checker = new SmtpHealthChecker();
    const manager = buildManager(new FakeTransporter("throw-on-verify"));
    assert.equal(await checker.check(manager, config), "OFFLINE");
  });
});
