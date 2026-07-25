import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ProviderCapabilities } from "./provider-capabilities";

describe("ProviderCapabilities", () => {
  it("none() has every flag false", () => {
    const caps = ProviderCapabilities.none();
    assert.equal(caps.htmlEmail, false);
    assert.equal(caps.attachments, false);
    assert.equal(caps.bulkSend, false);
  });

  it("full() has every flag true", () => {
    const caps = ProviderCapabilities.full();
    assert.equal(caps.htmlEmail, true);
    assert.equal(caps.tracking, true);
  });

  it("of() defaults unspecified flags to false", () => {
    const caps = ProviderCapabilities.of({ htmlEmail: true });
    assert.equal(caps.htmlEmail, true);
    assert.equal(caps.attachments, false);
  });

  describe("supports()", () => {
    it("returns true when every required=true flag is satisfied", () => {
      const caps = ProviderCapabilities.of({ htmlEmail: true, attachments: true });
      assert.equal(caps.supports({ htmlEmail: true }), true);
      assert.equal(caps.supports({ htmlEmail: true, attachments: true }), true);
    });

    it("returns false when a required=true flag is missing", () => {
      const caps = ProviderCapabilities.of({ htmlEmail: true });
      assert.equal(caps.supports({ attachments: true }), false);
    });

    it("ignores flags not marked true in the requirement (required=false or unset is not checked)", () => {
      const caps = ProviderCapabilities.none();
      assert.equal(caps.supports({}), true);
      assert.equal(caps.supports({ htmlEmail: false }), true);
    });

    it("an empty requirement is satisfied by any provider", () => {
      assert.equal(ProviderCapabilities.none().supports({}), true);
    });
  });
});
