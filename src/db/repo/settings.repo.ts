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

export interface EffortSettings {
  /** Per-source fallback minutes (e.g. { assignment: 180, email: 15 }). */
  effortDefaults: Record<string, number>;
  /** Per-course overrides, keyed by course name. */
  effortCourseOverrides: Record<string, number>;
}

export async function getEffortSettings(): Promise<EffortSettings> {
  const [defaults, overrides] = await Promise.all([
    getSetting("effortDefaults", DEFAULT_SETTINGS.effortDefaults),
    getSetting("effortCourseOverrides", DEFAULT_SETTINGS.effortCourseOverrides),
  ]);
  return {
    effortDefaults: defaults as Record<string, number>,
    effortCourseOverrides: overrides as Record<string, number>,
  };
}

export async function setEffortDefault(
  source: string,
  minutes: number,
): Promise<EffortSettings> {
  const current = await getEffortSettings();
  const next = { ...current.effortDefaults, [source]: minutes };
  await setSetting("effortDefaults", next);
  return { ...current, effortDefaults: next };
}

export async function setEffortCourseOverride(
  course: string,
  minutes: number,
): Promise<EffortSettings> {
  const current = await getEffortSettings();
  const next = { ...current.effortCourseOverrides, [course]: minutes };
  await setSetting("effortCourseOverrides", next);
  return { ...current, effortCourseOverrides: next };
}

export async function removeEffortCourseOverride(
  course: string,
): Promise<EffortSettings> {
  const current = await getEffortSettings();
  const next = { ...current.effortCourseOverrides };
  delete next[course];
  await setSetting("effortCourseOverrides", next);
  return { ...current, effortCourseOverrides: next };
}

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
