import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildSmtpCapabilities } from "./smtp-capability-descriptor";

describe("buildSmtpCapabilities", () => {
  it("claims htmlEmail — genuinely implemented", () => {
    assert.equal(buildSmtpCapabilities().htmlEmail, true);
  });

  it("does not claim attachments/inlineImages/bulkSend/scheduling/tracking — not actually deliverable yet", () => {
    const caps = buildSmtpCapabilities();
    assert.equal(caps.attachments, false);
    assert.equal(caps.inlineImages, false);
    assert.equal(caps.bulkSend, false);
    assert.equal(caps.scheduling, false);
    assert.equal(caps.tracking, false);
  });

  it("supports a requirement of { htmlEmail: true } but not { attachments: true }", () => {
    const caps = buildSmtpCapabilities();
    assert.equal(caps.supports({ htmlEmail: true }), true);
    assert.equal(caps.supports({ attachments: true }), false);
  });
});
