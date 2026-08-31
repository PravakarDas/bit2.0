import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  GOOGLE_OAUTH_SCOPES,
  OAUTH_STATE_COOKIE_NAME,
  OAUTH_STATE_MAX_AGE_SECONDS,
  generateOAuthState,
  isValidOAuthState,
  buildGoogleDriveOAuthRedirectUri,
  buildGoogleAuthorizationUrl,
} from "./google-drive-oauth";

describe("generateOAuthState", () => {
  it("returns a non-empty hex string", () => {
    const state = generateOAuthState();
    assert.ok(state.length > 0);
    assert.match(state, /^[0-9a-f]+$/);
  });

  it("is derived from 32 random bytes (64 hex characters) — cryptographically strong, not guessable", () => {
    const state = generateOAuthState();
    assert.equal(state.length, 64);
  });

  it("generates a different value on every call", () => {
    const values = new Set(Array.from({ length: 20 }, () => generateOAuthState()));
    assert.equal(values.size, 20);
  });
});

describe("isValidOAuthState", () => {
  it("accepts a state that exactly matches the cookie", () => {
    const state = generateOAuthState();
    assert.equal(isValidOAuthState(state, state), true);
  });

  it("rejects a mismatched state (forged/tampered)", () => {
    assert.equal(isValidOAuthState(generateOAuthState(), generateOAuthState()), false);
  });

  it("rejects when the cookie is missing (undefined)", () => {
    assert.equal(isValidOAuthState(undefined, generateOAuthState()), false);
  });

  it("rejects when the cookie is missing (null)", () => {
    assert.equal(isValidOAuthState(null, generateOAuthState()), false);
  });

  it("rejects when the cookie is an empty string (expired/cleared cookie reads as empty in some environments)", () => {
    assert.equal(isValidOAuthState("", generateOAuthState()), false);
  });

  it("rejects when the received state (query param) is missing", () => {
    assert.equal(isValidOAuthState(generateOAuthState(), undefined), false);
  });

  it("rejects when the received state is null", () => {
    assert.equal(isValidOAuthState(generateOAuthState(), null), false);
  });

  it("rejects when both are missing", () => {
    assert.equal(isValidOAuthState(undefined, undefined), false);
  });

  it("rejects a same-prefix value of a different length (no length-only false positive)", () => {
    const state = generateOAuthState();
    assert.equal(isValidOAuthState(state, state.slice(0, -2)), false);
  });
});

describe("OAuth state cookie constants", () => {
  it("uses a short-lived max age (10 minutes) — an unused authorization attempt naturally expires once the cookie is gone", () => {
    assert.equal(OAUTH_STATE_MAX_AGE_SECONDS, 600);
  });

  it("has a stable, non-empty cookie name", () => {
    assert.ok(OAUTH_STATE_COOKIE_NAME.length > 0);
  });
});

describe("buildGoogleDriveOAuthRedirectUri", () => {
  it("appends the callback path to the app origin", () => {
    assert.equal(buildGoogleDriveOAuthRedirectUri("https://hrm.example.com"), "https://hrm.example.com/api/google-drive/oauth/callback");
  });

  it("strips a trailing slash from the configured origin before appending the path", () => {
    assert.equal(buildGoogleDriveOAuthRedirectUri("https://hrm.example.com/"), "https://hrm.example.com/api/google-drive/oauth/callback");
  });

  it("works for a local development origin with a port", () => {
    assert.equal(buildGoogleDriveOAuthRedirectUri("http://localhost:3000"), "http://localhost:3000/api/google-drive/oauth/callback");
  });
});

describe("buildGoogleAuthorizationUrl", () => {
  const input = { clientId: "123-abc.apps.googleusercontent.com", redirectUri: "https://hrm.example.com/api/google-drive/oauth/callback", state: "test-state-value" };

  it("points at Google's OAuth 2.0 authorization endpoint", () => {
    const url = new URL(buildGoogleAuthorizationUrl(input));
    assert.equal(url.origin + url.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  });

  it("includes access_type=offline and prompt=consent — required for Google to reliably return a refresh_token on every connect/reconnect", () => {
    const url = new URL(buildGoogleAuthorizationUrl(input));
    assert.equal(url.searchParams.get("access_type"), "offline");
    assert.equal(url.searchParams.get("prompt"), "consent");
  });

  it("includes response_type=code (Authorization Code flow, never implicit)", () => {
    const url = new URL(buildGoogleAuthorizationUrl(input));
    assert.equal(url.searchParams.get("response_type"), "code");
  });

  it("includes the exact client_id, redirect_uri, and state passed in", () => {
    const url = new URL(buildGoogleAuthorizationUrl(input));
    assert.equal(url.searchParams.get("client_id"), input.clientId);
    assert.equal(url.searchParams.get("redirect_uri"), input.redirectUri);
    assert.equal(url.searchParams.get("state"), input.state);
  });

  it("includes the Drive scope plus only the minimal account-email scopes — no Gmail API scope", () => {
    const url = new URL(buildGoogleAuthorizationUrl(input));
    const scopes = (url.searchParams.get("scope") || "").split(" ");
    assert.deepEqual(scopes.sort(), [...GOOGLE_OAUTH_SCOPES].sort());
    assert.ok(scopes.includes("https://www.googleapis.com/auth/drive"));
    assert.equal(
      scopes.some((s) => s.toLowerCase().includes("gmail")),
      false,
    );
  });

  it("never includes a client secret — this function has no such parameter, so it structurally cannot leak one", () => {
    const url = buildGoogleAuthorizationUrl(input);
    assert.equal(url.toLowerCase().includes("secret"), false);
  });
});
