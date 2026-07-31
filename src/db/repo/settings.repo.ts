import { desc, eq } from "drizzle-orm";
import { db } from "../client";
import { capacityProfile, settings } from "../schema";

export const DEFAULT_SETTINGS = {
  pksBaseUrl: "http://localhost:8001/api/v1",
  dataMode: "fixture", // "fixture" | "live"
  effortDefaults: { assignment: 180, email: 15 },
  effortCourseOverrides: {},
  notificationsEnabled: true,
} as const;

export type DataMode = "fixture" | "live";

export const DEFAULT_CAPACITY: Record<string, number> = {
  mon: 4,
  tue: 4,
  wed: 4,
  thu: 4,
  fri: 4,
  sat: 0,
  sun: 0,
};

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.query.settings.findFirst({
    where: eq(settings.key, key),
  });
  return row ? (row.value as T) : fallback;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await db
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value },
    });
}

export async function getBaseUrl(): Promise<string> {
  return getSetting("pksBaseUrl", DEFAULT_SETTINGS.pksBaseUrl);
}

export async function setBaseUrl(url: string): Promise<void> {
  await setSetting("pksBaseUrl", url.trim().replace(/\/+$/, ""));
}

export async function getDataMode(): Promise<DataMode> {
  return getSetting<DataMode>("dataMode", DEFAULT_SETTINGS.dataMode);
}

export async function setDataMode(mode: DataMode): Promise<void> {
  await setSetting("dataMode", mode);
}

export async function listCapacity(): Promise<Record<string, number>> {
  const rows = await db.query.capacityProfile.findMany({
    orderBy: [desc(capacityProfile.id)],
  });
  if (rows.length === 0) {
    const values = Object.entries(DEFAULT_CAPACITY).map(([id, hours]) => ({
      id,
      hours,
    }));
    await db.insert(capacityProfile).values(values);
    return { ...DEFAULT_CAPACITY };
  }
  return Object.fromEntries(rows.map((r) => [r.id, r.hours]));
}

export async function setCapacityHours(
  id: string,
  hours: number,
): Promise<void> {
  await db
    .insert(capacityProfile)
    .values({ id, hours })
    .onConflictDoUpdate({ target: capacityProfile.id, set: { hours } });
}

/** Seeded on first run so the app is usable before any sync happens. */
export async function ensureSeedData(): Promise<void> {
  await listCapacity();
}
