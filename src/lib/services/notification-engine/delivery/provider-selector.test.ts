import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ProviderSelector, PriorityHealthSelectionStrategy, type SelectionStrategy } from "./provider-selector";
import { createProviderDescriptor } from "./types/provider-descriptor";
import { ProviderPriority } from "./value-objects/provider-priority";
import { FakeDeliveryProvider } from "./test-fakes/fake-delivery-provider";
import { NotificationChannel } from "../types/enums";
import type { RegisteredProvider } from "./types";

function candidate(id: string, priority: number): RegisteredProvider {
  return {
    descriptor: createProviderDescriptor({ id, name: id, channel: NotificationChannel.EMAIL, priority: ProviderPriority.of(priority) }),
    provider: new FakeDeliveryProvider(),
  };
}

describe("PriorityHealthSelectionStrategy / ProviderSelector", () => {
  it("selects the first candidate not already excluded", () => {
    const selector = new ProviderSelector();
    const candidates = [candidate("a", 1), candidate("b", 2)];
    const selected = selector.selectNext(candidates, new Set());
    assert.equal(selected?.descriptor.id, "a");
  });

  it("skips excluded candidates in order", () => {
    const selector = new ProviderSelector();
    const candidates = [candidate("a", 1), candidate("b", 2), candidate("c", 3)];
    const selected = selector.selectNext(candidates, new Set(["a"]));
    assert.equal(selected?.descriptor.id, "b");
  });

  it("returns null once every candidate has been excluded", () => {
    const selector = new ProviderSelector();
    const candidates = [candidate("a", 1)];
    assert.equal(selector.selectNext(candidates, new Set(["a"])), null);
  });

  it("returns null for an empty candidate list", () => {
    const selector = new ProviderSelector();
    assert.equal(selector.selectNext([], new Set()), null);
  });

  it("is pluggable — a custom SelectionStrategy can be substituted (e.g. always pick the last candidate)", () => {
    const lastCandidateStrategy: SelectionStrategy = {
      selectNext: (candidates, excludeIds) => {
        const remaining = candidates.filter((c) => !excludeIds.has(c.descriptor.id));
        return remaining[remaining.length - 1] ?? null;
      },
    };
    const selector = new ProviderSelector(lastCandidateStrategy);
    const candidates = [candidate("a", 1), candidate("b", 2), candidate("c", 3)];
    assert.equal(selector.selectNext(candidates, new Set())?.descriptor.id, "c");
  });

  it("PriorityHealthSelectionStrategy is the default used when none is supplied", () => {
    const strategy = new PriorityHealthSelectionStrategy();
    const candidates = [candidate("a", 1), candidate("b", 2)];
    assert.equal(strategy.selectNext(candidates, new Set())?.descriptor.id, "a");
  });
});
