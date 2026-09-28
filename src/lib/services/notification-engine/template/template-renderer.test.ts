import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TemplateCompiler } from "./template-compiler";
import { TemplateRenderer } from "./template-renderer";
import { TemplateVariableResolver } from "./template-variable-resolver";

describe("TemplateRenderer.render", () => {
  const compiler = new TemplateCompiler();

  it("substitutes variables into subject/bodyHtml/bodyText", () => {
    const renderer = new TemplateRenderer();
    const compiled = compiler.compile({
      subjectTemplate: "Welcome {{employee.name}}",
      bodyTemplateHtml: "<p>Hi {{employee.name}}</p>",
      bodyTemplateText: "Hi {{employee.name}}",
    });

    const rendered = renderer.render(compiled, { employee: { name: "Jane" } });

    assert.equal(rendered.subject, "Welcome Jane");
    assert.equal(rendered.bodyHtml, "<p>Hi Jane</p>");
    assert.equal(rendered.bodyText, "Hi Jane");
  });

  it("leaves absent parts undefined in the output", () => {
    const renderer = new TemplateRenderer();
    const compiled = compiler.compile({ subjectTemplate: "Hi {{name}}" });
    const rendered = renderer.render(compiled, { name: "Jane" });
    assert.equal(rendered.bodyHtml, undefined);
    assert.equal(rendered.bodyText, undefined);
  });

  it("renders a missing variable as an empty string by default", () => {
    const renderer = new TemplateRenderer();
    const compiled = compiler.compile({ subjectTemplate: "Hi {{unknown.thing}}!" });
    const rendered = renderer.render(compiled, {});
    assert.equal(rendered.subject, "Hi !");
  });

  it("keeps the literal placeholder text when onMissingVariable is 'keep-placeholder'", () => {
    const renderer = new TemplateRenderer();
    const compiled = compiler.compile({ subjectTemplate: "Hi {{unknown.thing}}!" });
    const rendered = renderer.render(compiled, {}, { onMissingVariable: "keep-placeholder" });
    assert.equal(rendered.subject, "Hi {{unknown.thing}}!");
  });

  it("stringifies numbers and booleans", () => {
    const renderer = new TemplateRenderer();
    const compiled = compiler.compile({ subjectTemplate: "{{count}} items, active={{active}}" });
    const rendered = renderer.render(compiled, { count: 3, active: true });
    assert.equal(rendered.subject, "3 items, active=true");
  });

  it("stringifies Dates as ISO strings", () => {
    const renderer = new TemplateRenderer();
    const compiled = compiler.compile({ subjectTemplate: "{{when}}" });
    const rendered = renderer.render(compiled, { when: new Date("2026-01-01T00:00:00.000Z") });
    assert.equal(rendered.subject, "2026-01-01T00:00:00.000Z");
  });

  describe("HTML escaping (security)", () => {
    it("escapes a variable value containing markup in bodyHtml", () => {
      const renderer = new TemplateRenderer();
      const compiled = compiler.compile({ bodyTemplateHtml: "<p>Hi {{employee.name}}</p>" });
      const rendered = renderer.render(compiled, { employee: { name: '<script>alert("x")</script>' } });
      assert.equal(rendered.bodyHtml, "<p>Hi &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;</p>");
    });

    it("does NOT escape the surrounding admin-authored literal HTML, only the substituted value", () => {
      const renderer = new TemplateRenderer();
      const compiled = compiler.compile({ bodyTemplateHtml: "<p><strong>{{name}}</strong></p>" });
      const rendered = renderer.render(compiled, { name: "Jane" });
      assert.equal(rendered.bodyHtml, "<p><strong>Jane</strong></p>");
    });

    it("does NOT escape plain-text output (bodyText is not HTML)", () => {
      const renderer = new TemplateRenderer();
      const compiled = compiler.compile({ bodyTemplateText: "Hi {{name}}" });
      const rendered = renderer.render(compiled, { name: "<b>Jane</b>" });
      assert.equal(rendered.bodyText, "Hi <b>Jane</b>");
    });

    it("escapes ampersands and quotes, not just angle brackets", () => {
      const renderer = new TemplateRenderer();
      const compiled = compiler.compile({ bodyTemplateHtml: "{{value}}" });
      const rendered = renderer.render(compiled, { value: `Tom & Jerry's "great" day` });
      assert.equal(rendered.bodyHtml, "Tom &amp; Jerry&#39;s &quot;great&quot; day");
    });
  });

  it("uses a custom variable resolver when one is injected", () => {
    const customResolver = new TemplateVariableResolver([
      { name: "custom", canResolve: () => true, resolve: () => ({ found: true, value: "CUSTOM" }) },
    ]);
    const renderer = new TemplateRenderer(customResolver);
    const compiled = compiler.compile({ subjectTemplate: "{{anything}}" });
    const rendered = renderer.render(compiled, {});
    assert.equal(rendered.subject, "CUSTOM");
  });
});
