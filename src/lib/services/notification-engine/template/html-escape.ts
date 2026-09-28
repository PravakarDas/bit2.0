const HTML_ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/**
 * Security measure: escapes a resolved variable's *value* before splicing
 * it into `bodyHtml` — a `{{employee.name}}` whose actual name happens to
 * contain `<`/`&`/etc. (or a deliberately malicious value, since render
 * contexts can originate from user-editable profile fields) must never be
 * interpreted as markup. Only variable VALUES are escaped — the
 * admin-authored literal template text around them is trusted content and
 * is passed through unchanged, exactly as written.
 */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPE_MAP[char]);
}
