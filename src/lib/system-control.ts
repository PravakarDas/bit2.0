import { prisma } from "@/lib/prisma";

function getEnvDefaults() {
  return {
    appTimezone: "Asia/Dhaka",
    timelineCronEnabled: true,
    timelineCronHour: 1,
    timelineCronMinute: 24,
    zktecoCronEnabled: true,
    zktecoCronMode: "DAILY",
    zktecoIntervalMinutes: 15,
    zktecoCronHour: 11,
    zktecoCronMinute: 0,
    leaveAutomationCronEnabled: true,
    leaveAutomationCronHour: 23,
    leaveAutomationCronMinute: 43,
    zktecoBaseUrl: "",
    zktecoUsername: "",
    zktecoPassword: "",
  };
}

export async function getOrCreateSystemControlSettings() {
  return (prisma as any).systemControlSettings.upsert({
    where: { id: "global" },
    update: {},
    create: {
      id: "global",
      ...getEnvDefaults(),
    },
  });
}

export async function getRuntimeSystemControlConfig() {
  return getOrCreateSystemControlSettings();
}

export function normalizeCronPart(value: number, min: number, max: number, fallback: number) {
  if (!Number.isInteger(value) || value < min || value > max) {
    return fallback;
  }
  return value;
}
