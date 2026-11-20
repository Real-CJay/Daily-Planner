import { describe, expect, it } from 'vitest';
import { formatDurationSeconds, getMondayWeekStart } from '@/lib/datetime';
import { NAV_ITEMS } from '@/components/layout/AppShell';

describe('Stage 1 Foundation Utilities', () => {
  it('computes Monday as the start of the week for any day of the week', () => {
    expect(getMondayWeekStart('2026-08-13')).toBe('2026-08-10'); // Thursday -> Monday
    expect(getMondayWeekStart('2026-08-16')).toBe('2026-08-10'); // Sunday -> Monday
    expect(getMondayWeekStart('2026-08-17')).toBe('2026-08-17'); // Monday -> Monday
    expect(getMondayWeekStart('2026-08-18')).toBe('2026-08-17'); // Tuesday -> Monday
  });

  it('formats durations deterministically without rounding errors', () => {
    expect(formatDurationSeconds(1690)).toBe('28:10');
    expect(formatDurationSeconds(1858)).toBe('30:58');
    expect(formatDurationSeconds(1200)).toBe('20:00');
    expect(formatDurationSeconds(1050)).toBe('17:30');
    expect(formatDurationSeconds(3665)).toBe('1:01:05');
  });

  it('exposes all 9 required top-level navigation routes', () => {
    expect(NAV_ITEMS).toHaveLength(9);
    const paths = NAV_ITEMS.map((i) => i.to);
    expect(paths).toEqual([
      '/',
      '/runs',
      '/plan',
      '/calendar',
      '/analytics',
      '/coach',
      '/personal-bests',
      '/weekly-review',
      '/settings',
    ]);
  });
});