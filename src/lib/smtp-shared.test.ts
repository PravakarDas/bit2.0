import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildSmtpTransportOptions, classifySmtpErrorCategory, mapSmtpError } from "./smtp-shared";
import type { ResolvedEmailConfig } from "./smtp-shared";

const config: ResolvedEmailConfig = {
  smtpHost: "smtp.gmail.com",
  smtpPort: 587,
  secure: false,
  senderEmail: "sender@example.com",
  appPassword: "app-password",
};

describe("buildSmtpTransportOptions", () => {
  it("maps every field from the resolved config", () => {
    const options = buildSmtpTransportOptions(config) as Record<string, unknown>;
    assert.equal(options.host, "smtp.gmail.com");
    assert.equal(options.port, 587);
    assert.equal(options.secure, false);
    assert.deepEqual(options.auth, { user: "sender@example.com", pass: "app-password" });
  });

  it("sets 15 second timeouts for connection/greeting/socket", () => {
    const options = buildSmtpTransportOptions(config) as Record<string, unknown>;
    assert.equal(options.connectionTimeout, 15_000);
    assert.equal(options.greetingTimeout, 15_000);
    assert.equal(options.socketTimeout, 15_000);
  });
});

describe("classifySmtpErrorCategory", () => {
  it("categorizes each known nodemailer error code", () => {
    assert.equal(classifySmtpErrorCategory({ code: "EAUTH" }), "AUTH");
    assert.equal(classifySmtpErrorCategory({ code: "ENOTFOUND" }), "DNS");
    assert.equal(classifySmtpErrorCategory({ code: "EDNS" }), "DNS");
    assert.equal(classifySmtpErrorCategory({ code: "ECONNECTION" }), "CONNECTION");
    assert.equal(classifySmtpErrorCategory({ code: "ECONNREFUSED" }), "CONNECTION");
    assert.equal(classifySmtpErrorCategory({ code: "ETIMEDOUT" }), "TIMEOUT");
    assert.equal(classifySmtpErrorCategory({ code: "ESOCKET" }), "TIMEOUT");
    assert.equal(classifySmtpErrorCategory({ code: "EENVELOPE" }), "ENVELOPE");
    assert.equal(classifySmtpErrorCategory({ code: "EMESSAGE" }), "MESSAGE");
  });

  it("falls back to SERVER_REJECTED for an unrecognized code with a 5xx responseCode", () => {
    assert.equal(classifySmtpErrorCategory({ code: "SOMETHING_ELSE", responseCode: 550 }), "SERVER_REJECTED");
  });

  it("falls back to UNKNOWN for anything else, including a 4xx responseCode", () => {
    assert.equal(classifySmtpErrorCategory({ code: "SOMETHING_ELSE", responseCode: 421 }), "UNKNOWN");
    assert.equal(classifySmtpErrorCategory({}), "UNKNOWN");
    assert.equal(classifySmtpErrorCategory(null), "UNKNOWN");
    assert.equal(classifySmtpErrorCategory("a string"), "UNKNOWN");
  });
});

describe("mapSmtpError", () => {
  it("produces the exact historical message for every category (unchanged from email.service.ts's original switch)", () => {
    assert.equal(mapSmtpError({ code: "EAUTH" }), "Authentication failed. Check the sender email and app password.");
    assert.equal(mapSmtpError({ code: "ENOTFOUND" }), "Invalid SMTP host. Please check the host address.");
    assert.equal(mapSmtpError({ code: "ECONNREFUSED" }), "Could not connect to the SMTP server. Check the host and port.");
    assert.equal(mapSmtpError({ code: "ETIMEDOUT" }), "Connection to the SMTP server timed out.");
    assert.equal(mapSmtpError({ code: "EENVELOPE" }), "Invalid sender or recipient email address.");
    assert.equal(mapSmtpError({ code: "EMESSAGE" }), "SMTP server rejected the message.");
    assert.equal(mapSmtpError({ responseCode: 550 }), "SMTP server rejected the request.");
    assert.equal(mapSmtpError({}), "Failed to send email. Please verify your SMTP configuration.");
  });
});
