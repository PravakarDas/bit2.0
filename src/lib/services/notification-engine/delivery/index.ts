// Barrel export for the Notification Delivery Framework (Phase 6). See
// DeliveryFrameworkReport.md for the full folder structure and dependency
// graph this barrel reflects. No SMTP/SMS/WhatsApp/Push/real provider code
// exists anywhere under this folder — everything here is abstraction only.

export * from "./types";
export * from "./value-objects";
export * from "./provider";
export * from "./errors";
export { ProviderRegistry } from "./provider-registry";
export { ProviderHealthMonitor, type ProviderHealthSnapshot } from "./provider-health-monitor";
export { ProviderMetricsCollector, type ProviderMetricsSnapshot } from "./provider-metrics";
export { ProviderResolver } from "./provider-resolver";
export { ProviderSelector, PriorityHealthSelectionStrategy, type SelectionStrategy } from "./provider-selector";
export { DeliveryPolicy, type DeliveryPolicyInput, type RateLimitPolicy } from "./delivery-policy";
export { DeliveryAttemptContext, type DeliveryAttemptContextInput } from "./delivery-attempt-context";
export { DeliveryExceptionMapper } from "./delivery-exception-mapper";
export { FailoverDeliveryStrategy, type DeliveryStrategy, type ProviderInvoker } from "./delivery-strategy";
export { DeliveryManager } from "./delivery-manager";
