import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SmtpTransportFactory } from "./smtp-transport-factory";
import type { ResolvedEmailConfig } from "../../../../../smtp-shared";

const config: ResolvedEmailConfig = {
  smtpHost: "smtp.gmail.com",
  smtpPort: 587,
  secure: false,
  senderEmail: "sender@example.com",
  appPassword: "app-password",
};

describe("SmtpTransportFactory", () => {
  it("creates a real nodemailer Transporter without touching the network (createTransport is lazy — no connection opens until sendMail/verify)", () => {
    const transporter = new SmtpTransportFactory().create(config);
    assert.equal(typeof transporter.sendMail, "function");
    assert.equal(typeof transporter.verify, "function");
    assert.equal(typeof transporter.close, "function");
  });

  it("applies the resolved config's host/port/secure onto the transporter options", () => {
    const transporter = new SmtpTransportFactory().create(config) as unknown as { options: { host: string; port: number; secure: boolean } };
    assert.equal(transporter.options.host, "smtp.gmail.com");
    assert.equal(transporter.options.port, 587);
    assert.equal(transporter.options.secure, false);
  });
});
