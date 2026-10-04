const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;
export const NEW_DOCUMENT_WINDOW_DAYS = 14;

export function documentDateOnly(value: unknown): string | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }

  return undefined;
}

function parseDateOnly(value: string): number | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;

  const [year, month, day] = value.split("-").map(Number);
  const timestamp = Date.UTC(year, month - 1, day);
  const date = new Date(timestamp);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return undefined;
  }

  return timestamp;
}

function bangkokToday(now: Date): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day));
}

export function isRecentlyUpdated(value: unknown, now = new Date()): boolean {
  const date = documentDateOnly(value);
  if (!date) return false;

  const updatedAt = parseDateOnly(date);
  if (updatedAt === undefined) return false;

  const ageInDays = (bangkokToday(now) - updatedAt) / DAY_IN_MILLISECONDS;
  return ageInDays >= 0 && ageInDays <= NEW_DOCUMENT_WINDOW_DAYS;
}

export function sidebarPathForDocumentId(id: string): string {
  const slug = id.replace(/(^|\/)index$/, "");
  return slug ? `/${slug}/` : "/";
}
