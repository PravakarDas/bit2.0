// Barrel for the SMTP provider submodule. Deliberately NOT re-exported from
// `delivery/index.ts` — this barrel is "tainted" by `registerSmtpProvider`'s
// import of the real, Prisma-backed `resolveEmailConfig` (same as
// `notification-engine/index.ts`'s own `export * from "./repositories"`),
// so anything requiring it transitively requires `@/lib/prisma`, which
// plain `node --test` cannot resolve. Test files in this module must always
// import the specific unit they need directly from its own file, never
// through this barrel — see SmtpProviderReport.md's "Testing" section.
export { SmtpConfigValidator } from "./smtp-config-validator";
export { SmtpTransportFactory } from "./smtp-transport-factory";
export { SmtpConnectionManager } from "./smtp-connection-manager";
export { buildSmtpCapabilities } from "./smtp-capability-descriptor";
export { isPermanentSmtpError } from "./smtp-retry-classification";
export { SmtpResultMapper } from "./smtp-result-mapper";
export { SmtpHealthChecker } from "./smtp-health-checker";
export { SmtpDeliveryProvider, type ResolveSmtpConfig } from "./smtp-delivery-provider";
export { registerSmtpProvider, type RegisterSmtpProviderOptions } from "./register-smtp-provider";
