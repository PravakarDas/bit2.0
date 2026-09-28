import type { DeliveryProvider } from "../provider/delivery-provider.interface";
import type { ProviderDescriptor } from "./provider-descriptor";

/** What `ProviderRegistry` actually stores: routing metadata paired with the callable that does the work. */
export interface RegisteredProvider {
  readonly descriptor: ProviderDescriptor;
  readonly provider: DeliveryProvider;
}
