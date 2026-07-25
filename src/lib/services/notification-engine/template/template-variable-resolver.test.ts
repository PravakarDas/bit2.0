import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TemplateVariableResolver } from "./template-variable-resolver";
import { DateVariableResolverPlugin } from "./variable-resolvers";

describe("TemplateVariableResolver — default dot-path resolution", () => {
  it("resolves a nested path", () => {
    const resolver = new TemplateVariableResolver([]);
    const result = resolver.resolve("employee.name", { employee: { name: "Jane" } });
    assert.deepEqual(result, { found: true, value: "Jane" });
  });

  it("resolves a deeply nested path", () => {
    const resolver = new TemplateVariableResolver([]);
    const result = resolver.resolve("a.b.c", { a: { b: { c: 42 } } });
    assert.deepEqual(result, { found: true, value: 42 });
  });

  it("reports not found for a path missing from the context", () => {
    const resolver = new TemplateVariableResolver([]);
    const result = resolver.resolve("employee.middleName", { employee: { name: "Jane" } });
    assert.equal(result.found, false);
  });

  it("reports not found when an intermediate segment is not an object", () => {
    const resolver = new TemplateVariableResolver([]);
    const result = resolver.resolve("employee.name.first", { employee: { name: "Jane" } });
    assert.equal(result.found, false);
  });

  it("reports not found when the root namespace is entirely absent", () => {
    const resolver = new TemplateVariableResolver([]);
    const result = resolver.resolve("company.name", { employee: { name: "Jane" } });
    assert.equal(result.found, false);
  });

  it("treats an explicit null value as found (not missing)", () => {
    const resolver = new TemplateVariableResolver([]);
    const result = resolver.resolve("employee.nickname", { employee: { nickname: null } });
    assert.equal(result.found, true);
    assert.equal(result.value, null);
  });

  describe("security — prototype-chain traversal", () => {
    it("does not resolve __proto__ even though it's a syntactically valid identifier", () => {
      const resolver = new TemplateVariableResolver([]);
      const result = resolver.resolve("__proto__.polluted", { employee: { name: "Jane" } });
      assert.equal(result.found, false);
    });

    it("does not resolve constructor", () => {
      const resolver = new TemplateVariableResolver([]);
      const result = resolver.resolve("constructor.name", {});
      assert.equal(result.found, false);
    });

    it("does not resolve inherited methods like toString/hasOwnProperty", () => {
      const resolver = new TemplateVariableResolver([]);
      assert.equal(resolver.resolve("toString", {}).found, false);
      assert.equal(resolver.resolve("hasOwnProperty", {}).found, false);
    });

    it("still resolves a genuine own property named similarly to a risky one, e.g. a real 'constructor' field the caller explicitly put there", () => {
      const resolver = new TemplateVariableResolver([]);
      const result = resolver.resolve("employee.constructor", { employee: { constructor: "Acme Corp" } });
      assert.equal(result.found, true);
      assert.equal(result.value, "Acme Corp");
    });
  });
});

describe("TemplateVariableResolver — date plugin (default)", () => {
  it("resolves {{today}} and {{now}} without needing them in the context", () => {
    const fixedClock = { now: () => new Date("2026-03-15T12:30:00.000Z") };
    const resolver = new TemplateVariableResolver([new DateVariableResolverPlugin(fixedClock)]);

    const today = resolver.resolve("today", {});
    const now = resolver.resolve("now", {});

    assert.deepEqual(today, { found: true, value: "2026-03-15" });
    assert.deepEqual(now, { found: true, value: "2026-03-15T12:30:00.000Z" });
  });

  it("is included by default when no plugins are given explicitly", () => {
    const resolver = new TemplateVariableResolver();
    const result = resolver.resolve("today", {});
    assert.equal(result.found, true);
    assert.match(result.value as string, /^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("TemplateVariableResolver — extensibility (register)", () => {
  it("lets a custom plugin take priority over the default dot-path fallback", () => {
    const resolver = new TemplateVariableResolver([]);
    resolver.register({
      name: "custom-company",
      canResolve: (path) => path === "company.name",
      resolve: () => ({ found: true, value: "Overridden Co." }),
    });

    const result = resolver.resolve("company.name", { company: { name: "Real Co." } });
    assert.deepEqual(result, { found: true, value: "Overridden Co." });
  });

  it("a later-registered plugin takes priority over an earlier-registered one", () => {
    const resolver = new TemplateVariableResolver([]);
    resolver.register({ name: "first", canResolve: (p) => p === "x", resolve: () => ({ found: true, value: "first" }) });
    resolver.register({ name: "second", canResolve: (p) => p === "x", resolve: () => ({ found: true, value: "second" }) });

    const result = resolver.resolve("x", {});
    assert.equal(result.value, "second");
  });

  it("falls back to dot-path resolution for paths no custom plugin handles", () => {
    const resolver = new TemplateVariableResolver([]);
    resolver.register({ name: "narrow", canResolve: (p) => p === "only.this", resolve: () => ({ found: true, value: "x" }) });

    const result = resolver.resolve("employee.name", { employee: { name: "Jane" } });
    assert.deepEqual(result, { found: true, value: "Jane" });
  });
});
