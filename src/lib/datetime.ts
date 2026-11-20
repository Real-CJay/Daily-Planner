export const DEFAULT_TIMEZONE = 'Asia/Colombo';

export function getLocalDateString(
  date: Date = new Date(),
  timeZone: string = DEFAULT_TIMEZONE
): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date);
}

export function getMondayWeekStart(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  const dayOfWeek = utcDate.getUTCDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  utcDate.setUTCDate(utcDate.getUTCDate() + diffToMonday);

  const y = utcDate.getUTCFullYear();
  const m = String(utcDate.getUTCMonth() + 1).padStart(2, '0');
  const d = String(utcDate.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatDurationSeconds(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '—';
  const rounded = Math.round(totalSeconds);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const seconds = rounded % 60;

  const pad = (n: number) => String(n).padStart(2, '0');
  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${minutes}:${pad(seconds)}`;
}