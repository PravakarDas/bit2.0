import { resolveEmailConfig } from "@/lib/email-config";
import { NotificationChannel } from "../../../types/enums";
import { ProviderRegistry } from "../../provider-registry";
import { createProviderDescriptor } from "../../types/provider-descriptor";
import { ProviderPriority } from "../../value-objects/provider-priority";
import { SmtpDeliveryProvider } from "./smtp-delivery-provider";
import { buildSmtpCapabilities } from "./smtp-capability-descriptor";

export interface RegisterSmtpProviderOptions {
  id?: string;
  name?: string;
  priority?: number;
}

/**
 * "SMTP Provider Registration" (item 10) — the production wiring glue,
 * analogous to Phase 4's `createWorkerRuntime()`: imports the real,
 * Prisma-backed `resolveEmailConfig` (the one and only place in this
 * phase's own code that does), so — matching `create-worker-runtime.ts`'s
 * own precedent — this file has no dedicated unit test of its own (importing
 * it at all pulls in `@/lib/prisma`, which plain `node --test` cannot
 * resolve; see SmtpProviderReport.md's "Testing" section). Every class it
 * wires (`SmtpDeliveryProvider` and everything it composes) is already
 * fully unit-tested in isolation via injected fakes.
 */
export function registerSmtpProvider(registry: ProviderRegistry, options: RegisterSmtpProviderOptions = {}): void {
  const descriptor = createProviderDescriptor({
    id: options.id ?? "smtp-primary",
    name: options.name ?? "Primary SMTP",
    channel: NotificationChannel.EMAIL,
    priority: ProviderPriority.of(options.priority ?? 1),
    capabilities: buildSmtpCapabilities(),
  });

  registry.register(descriptor, new SmtpDeliveryProvider(undefined, undefined, undefined, undefined, resolveEmailConfig));
}
