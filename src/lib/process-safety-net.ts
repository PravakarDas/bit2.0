/**
 * Node-only — deliberately its own module, reached via a dynamic `import()` from
 * instrumentation.ts's `register()`, not a static top-level import. `instrumentation.ts` is
 * bundled by Next.js for BOTH the Node.js and Edge runtimes; a static `process.on` reference
 * there gets flagged by Turbopack's Edge-runtime trace ("A Node.js API is used ... not
 * supported in the Edge Runtime") even though it's only ever actually invoked from inside
 * `register()`'s `NEXT_RUNTIME === "nodejs"` guard — the guard is a runtime check, and
 * Turbopack's warning happens at build-time static analysis, which can't see that it makes
 * this safe. Same reasoning, same fix, as `production-worker.ts`'s own dynamic import a few
 * lines below this one's call site in instrumentation.ts — see that comment for the longer
 * version of this explanation.
 */
export function installProcessSafetyNet() {
  process.on("unhandledRejection", (reason) => {
    console.error("Unhandled promise rejection (process kept alive):", reason);
  });
  process.on("uncaughtException", (error) => {
    console.error("Uncaught exception (process kept alive):", error);
  });
}
