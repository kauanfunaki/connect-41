import { formatCalendarDate } from "@/lib/format";
export function calendarDays(from: string, to: string): (string | null)[] {
  const start = new Date(`${from}T12:00:00Z`), end = new Date(`${to}T12:00:00Z`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end < start || end.getTime() - start.getTime() > 366 * 86400000) return [];
  const days: (string | null)[] = Array((start.getUTCDay() + 6) % 7).fill(null);
  for (let time = start.getTime(); time <= end.getTime(); time += 86400000) days.push(new Date(time).toISOString().slice(0, 10));
  while (days.length % 7) days.push(null);
  return days;
}
export function calendarLevel(count: number) { return count === 0 ? 0 : count < 3 ? 1 : count < 6 ? 2 : count < 10 ? 3 : 4; }
export function dateLabel(day: string) { return formatCalendarDate(new Date(`${day}T12:00:00Z`), { day: "2-digit", month: "short", year: "numeric" }); }
