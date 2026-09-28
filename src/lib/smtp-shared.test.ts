import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildSmtpTransportOptions, classifySmtpErrorCategory, looksLikeSenderEmailMistake, mapSmtpError } from "./smtp-shared";
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

  it("uses the resolved config's senderEmail as the SMTP auth user (never a different field)", () => {
    const options = buildSmtpTransportOptions(config) as { auth: { user: string; pass: string } };
    assert.equal(options.auth.user, config.senderEmail);
    assert.equal(options.auth.pass, config.appPassword);
  });

  it("produces a port-587-with-STARTTLS-ready config for secure:false (no forced implicit TLS)", () => {
    const port587Config: ResolvedEmailConfig = { ...config, smtpPort: 587, secure: false };
    const options = buildSmtpTransportOptions(port587Config) as Record<string, unknown>;
    assert.equal(options.port, 587);
    assert.equal(options.secure, false); // nodemailer upgrades via STARTTLS itself on 587 when secure:false — never forced here
    assert.ok(!("requireTLS" in options)); // no override that could break Gmail's expected STARTTLS negotiation
  });

  it("forces the connection over IPv4 (family: 4), regardless of host/port/secure", () => {
    const options = buildSmtpTransportOptions(config) as Record<string, unknown>;
    assert.equal(options.family, 4);
  });
});

describe("looksLikeSenderEmailMistake", () => {
  it("detects the exact real-world bug this guards against: the sender email pasted into the password field", () => {
    assert.equal(looksLikeSenderEmailMistake("officepravakar@gmail.com", "officepravakar@gmail.com"), true);
  });

  it("is case-insensitive (email addresses are matched case-insensitively)", () => {
    assert.equal(looksLikeSenderEmailMistake("Office@Example.com", "office@example.com"), true);
  });

  it("ignores leading/trailing whitespace on either side", () => {
    assert.equal(looksLikeSenderEmailMistake("  office@example.com  ", "office@example.com"), true);
  });

  it("returns false for a real, distinct password/app password", () => {
    assert.equal(looksLikeSenderEmailMistake("abcd efgh ijkl mnop", "office@example.com"), false);
    assert.equal(looksLikeSenderEmailMistake("s3cr3t-api-key", "office@example.com"), false);
  });

  it("returns false when either input is empty", () => {
    assert.equal(looksLikeSenderEmailMistake("", "office@example.com"), false);
    assert.equal(looksLikeSenderEmailMistake("some-password", ""), false);
    assert.equal(looksLikeSenderEmailMistake("", ""), false);
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

  describe("ESOCKET disambiguation (TIMEOUT vs. TLS_MISMATCH)", () => {
    it("classifies a plain ESOCKET failure (no TLS-mismatch signature) as TIMEOUT — a real dead/unreachable connection", () => {
      assert.equal(classifySmtpErrorCategory({ code: "ESOCKET", message: "connect ETIMEDOUT 1.2.3.4:587" }), "TIMEOUT");
      assert.equal(classifySmtpErrorCategory({ code: "ESOCKET" }), "TIMEOUT"); // no message at all
    });

    it("classifies an ESOCKET failure carrying OpenSSL's 'wrong version number' as TLS_MISMATCH — a secure/port config mismatch, not a timeout", () => {
      assert.equal(
        classifySmtpErrorCategory({
          code: "ESOCKET",
          message: "804CF14C267D0000:error:0A00010B:SSL routines:ssl3_get_record:wrong version number:...",
        }),
        "TLS_MISMATCH"
      );
    });

    it("matches the TLS-mismatch signature case-insensitively", () => {
      assert.equal(classifySmtpErrorCategory({ code: "ESOCKET", message: "WRONG VERSION NUMBER" }), "TLS_MISMATCH");
    });
  });
});

describe("mapSmtpError", () => {
  it("produces the exact historical message for every category (unchanged from email.service.ts's original switch)", () => {
    assert.equal(mapSmtpError({ code: "EAUTH" }), "Authentication failed. Check the sender email and app password.");
    assert.equal(mapSmtpError({ code: "ENOTFOUND" }), "Invalid SMTP host. Please check the host address.");
    assert.equal(mapSmtpError({ code: "ECONNREFUSED" }), "Could not connect to the SMTP server. Check the host and port.");
    assert.equal(mapSmtpError({ code: "ETIMEDOUT" }), "Connection to the SMTP server timed out.");
    assert.equal(
      mapSmtpError({ code: "ESOCKET", message: "SSL routines:ssl3_get_record:wrong version number" }),
      'SSL/TLS handshake failed. The "Secure (SSL/TLS)" setting likely doesn\'t match the port — turn it OFF for port 587 (STARTTLS) or ON for port 465 (implicit TLS).'
    );
    assert.equal(mapSmtpError({ code: "EENVELOPE" }), "Invalid sender or recipient email address.");
    assert.equal(mapSmtpError({ code: "EMESSAGE" }), "SMTP server rejected the message.");
    assert.equal(mapSmtpError({ responseCode: 550 }), "SMTP server rejected the request.");
    assert.equal(mapSmtpError({}), "Failed to send email. Please verify your SMTP configuration.");
  });
});
