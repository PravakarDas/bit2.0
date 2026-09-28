import { describe, it } from "node:test";
import assert from "node:assert/strict";
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

function buildManager(fake: FakeTransporter = new FakeTransporter()) {
  let createCalls = 0;
  const manager = new SmtpConnectionManager(() => {
    createCalls += 1;
    return fake.asTransporter();
  });
  return { manager, fake, getCreateCalls: () => createCalls };
}

describe("SmtpConnectionManager", () => {
  it("creates a transporter on first use", () => {
    const { manager, getCreateCalls } = buildManager();
    manager.getTransporter(config);
    assert.equal(getCreateCalls(), 1);
  });

  it("reuses the cached transporter for the same config (connection reuse)", () => {
    const { manager, getCreateCalls } = buildManager();
    manager.getTransporter(config);
    manager.getTransporter(config);
    manager.getTransporter(config);
    assert.equal(getCreateCalls(), 1);
  });

  it("creates a new transporter when the config changes", () => {
    const { manager, getCreateCalls } = buildManager();
    manager.getTransporter(config);
    manager.getTransporter({ ...config, smtpHost: "smtp.other.com" });
    assert.equal(getCreateCalls(), 2);
  });

  it("invalidate() closes the current transporter and forces a fresh one on next use", () => {
    const { manager, fake, getCreateCalls } = buildManager();
    manager.getTransporter(config);
    manager.invalidate();
    assert.equal(fake.closeCalls, 1);
    manager.getTransporter(config);
    assert.equal(getCreateCalls(), 2);
  });

  it("close() is graceful shutdown — safe to call even when nothing is connected", async () => {
    const { manager } = buildManager();
    await assert.doesNotReject(() => manager.close());
  });

  describe("verify()", () => {
    it("returns true when the transporter's verify() resolves", async () => {
      const { manager } = buildManager(new FakeTransporter("success"));
      assert.equal(await manager.verify(config), true);
    });

    it("returns false (never throws) when the transporter's verify() rejects", async () => {
      const { manager } = buildManager(new FakeTransporter("throw-on-verify"));
      assert.equal(await manager.verify(config), false);
    });
  });
});
