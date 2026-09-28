/**
 * The data a template's placeholders resolve against — a plain, arbitrarily
 * nested object (e.g. `{ employee: { name: "Jane" } }` for `{{employee.name}}`).
 * Intentionally untyped beyond this (`unknown` values) — this phase has no
 * knowledge of any specific business domain's shape (Design's own event
 * payloads are `Json` — see NotificationEngineDesign.md §6), and validating
 * that a *specific* domain object was passed correctly is out of scope here.
 */
export type RenderContext = Record<string, unknown>;
