import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { NotificationPreferenceService } from "./notification-preference.service";
import type { INotificationPreferenceRepository } from "../repositories/interfaces";
import type { NotificationPreferenceDTO, UpsertNotificationPreferenceInput } from "../dto";
import type { NotificationChannel } from "../types/enums";
import { ValidationError } from "../errors";

/** In-memory fake of `INotificationPreferenceRepository` — same contract as the real Prisma-backed one: a missing row means "no explicit preference." */
class FakePreferenceRepository implements INotificationPreferenceRepository {
  private readonly rows = new Map<string, NotificationPreferenceDTO>();
  private nextId = 1;
  upsertCalls: UpsertNotificationPreferenceInput[] = [];

  seed(userId: string, notificationType: string, channel: NotificationChannel, isEnabled: boolean): void {
    const key = this.key(userId, notificationType, channel);
    const existing = this.rows.get(key);
    this.rows.set(key, {
      id: existing?.id ?? `pref_${this.nextId++}`,
      userId,
      notificationType,
      channel,
      isEnabled,
      createdAt: existing?.createdAt ?? new Date(),
      updatedAt: new Date(),
    });
  }

  async findOne(userId: string, notificationType: string, channel: NotificationChannel): Promise<NotificationPreferenceDTO | null> {
    return this.rows.get(this.key(userId, notificationType, channel)) ?? null;
  }

  async findByUser(userId: string): Promise<NotificationPreferenceDTO[]> {
    return Array.from(this.rows.values()).filter((row) => row.userId === userId);
  }

  async upsert(input: UpsertNotificationPreferenceInput): Promise<NotificationPreferenceDTO> {
    this.upsertCalls.push(input);
    this.seed(input.userId, input.notificationType, input.channel, input.isEnabled);
    return (await this.findOne(input.userId, input.notificationType, input.channel))!;
  }

  private key(userId: string, notificationType: string, channel: string): string {
    return `${userId}:${notificationType}:${channel}`;
  }
}

function buildService() {
  const preferenceRepository = new FakePreferenceRepository();
  const service = new NotificationPreferenceService(preferenceRepository);
  return { service, preferenceRepository };
}

describe("NotificationPreferenceService.listForUser", () => {
  it("returns every manageable (notificationType, channel) pair, defaulting isEnabled=true and isExplicit=false when no row exists", async () => {
    const { service } = buildService();

    const result = await service.listForUser("u1");

    assert.ok(result.length > 0);
    for (const item of result) {
      assert.equal(item.isEnabled, true);
      assert.equal(item.isExplicit, false);
    }
    assert.ok(result.some((item) => item.notificationType === "LOAN_APPROVED" && item.channel === "EMAIL"));
  });

  it("reflects an explicit disabled row as isEnabled=false, isExplicit=true", async () => {
    const { service, preferenceRepository } = buildService();
    preferenceRepository.seed("u1", "LOAN_APPROVED", "EMAIL", false);

    const result = await service.listForUser("u1");

    const loanApproved = result.find((item) => item.notificationType === "LOAN_APPROVED" && item.channel === "EMAIL");
    assert.ok(loanApproved);
    assert.equal(loanApproved!.isEnabled, false);
    assert.equal(loanApproved!.isExplicit, true);
  });

  it("scopes reads to the given user only", async () => {
    const { service, preferenceRepository } = buildService();
    preferenceRepository.seed("someone-else", "LOAN_APPROVED", "EMAIL", false);

    const result = await service.listForUser("u1");

    const loanApproved = result.find((item) => item.notificationType === "LOAN_APPROVED" && item.channel === "EMAIL");
    assert.equal(loanApproved!.isEnabled, true);
    assert.equal(loanApproved!.isExplicit, false);
  });
});

describe("NotificationPreferenceService.setForUser", () => {
  it("upserts a valid, manageable preference", async () => {
    const { service, preferenceRepository } = buildService();

    const result = await service.setForUser("u1", "LOAN_APPROVED", "EMAIL", false);

    assert.equal(result.isEnabled, false);
    assert.equal(preferenceRepository.upsertCalls.length, 1);
    assert.deepEqual(preferenceRepository.upsertCalls[0], {
      userId: "u1",
      notificationType: "LOAN_APPROVED",
      channel: "EMAIL",
      isEnabled: false,
    });
  });

  it("rejects a (notificationType, channel) pair that is not in the manageable catalog", async () => {
    const { service, preferenceRepository } = buildService();

    await assert.rejects(() => service.setForUser("u1", "LOAN_APPROVED", "SMS", false), ValidationError);
    assert.equal(preferenceRepository.upsertCalls.length, 0);
  });

  it("rejects an unrecognized notificationType entirely", async () => {
    const { service, preferenceRepository } = buildService();

    await assert.rejects(() => service.setForUser("u1", "SOMETHING_MADE_UP", "EMAIL", false), ValidationError);
    assert.equal(preferenceRepository.upsertCalls.length, 0);
  });

  it("round-trips through listForUser after a set", async () => {
    const { service } = buildService();

    await service.setForUser("u1", "LOAN_APPROVED", "EMAIL", false);
    const list = await service.listForUser("u1");

    const loanApproved = list.find((item) => item.notificationType === "LOAN_APPROVED" && item.channel === "EMAIL");
    assert.equal(loanApproved!.isEnabled, false);
    assert.equal(loanApproved!.isExplicit, true);
  });
});
