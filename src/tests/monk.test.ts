import { describe, expect, it } from 'vitest';
import {
  createMonkModeSession,
  evaluateMonkModeReport,
  isCommitmentLocked,
  type PlannerCommitment,
} from '@/modules/monk/monkEngine';

describe('Monk Mode Compounding Engine', () => {
  const vocal: PlannerCommitment = {
    id: 'c-vocal',
    title: '30m Vocal',
    category: 'VOCAL',
    tier: 'NON_NEGOTIABLE',
    targetMinutes: 30,
    createdAt: '2026-11-16',
  };

  const drums: PlannerCommitment = {
    id: 'c-drums',
    title: 'Drums 3x/wk',
    category: 'DRUMMING',
    tier: 'NEGOTIABLE',
    targetMinutes: 45,
    targetPerWeek: 3,
    intendedDays: [1, 3, 5], // Intended Mon, Wed, Fri
    createdAt: '2026-11-16',
  };

  it('locks both non-negotiables and chosen negotiables while Monk Mode is active', () => {
    const session = createMonkModeSession({
      title: '14-Day Monk Mode',
      startDate: '2026-11-16',
      plannedDays: 14,
      nonNegotiables: [vocal],
      negotiables: [drums],
    });
    expect(isCommitmentLocked(vocal, session)).toBe(true);
    expect(isCommitmentLocked(drums, session)).toBe(true);
    expect(isCommitmentLocked(drums, null)).toBe(false);
  });

  it('passes flexible weekly negotiables when intended days are skipped but weekly count is met', () => {
    // Full Mon-Sun week: 2026-11-16 (Mon) to 2026-11-22 (Sun)
    const session = createMonkModeSession({
      title: '7-Day Monk Mode',
      startDate: '2026-11-16',
      plannedDays: 7,
      nonNegotiables: [vocal],
      negotiables: [drums],
    });

    // User skipped Mon/Wed/Fri for drums, did Tue/Thu/Sun instead -> still 3/3 PASS!
    const completions: Record<string, string[]> = {
      '2026-11-16': ['c-vocal'],
      '2026-11-17': ['c-vocal', 'c-drums'],
      '2026-11-18': ['c-vocal'],
      '2026-11-19': ['c-vocal', 'c-drums'],
      '2026-11-20': ['c-vocal'],
      '2026-11-21': ['c-vocal'],
      '2026-11-22': ['c-vocal', 'c-drums'],
    };

    const report = evaluateMonkModeReport(session, completions, '2026-11-22');

    expect(report.compliantDays).toBe(7);
    expect(report.brokenDays).toBe(0);
    expect(report.weeklyQuotasPassed).toBe(1);
    expect(report.weeklyQuotasMissed).toBe(0);
    expect(report.compliancePct).toBe(100);
    expect(report.finalScore).toBeGreaterThan(1.08);
  });

  it('applies a proportional penalty and records the reason when ended early', () => {
    const session = {
      ...createMonkModeSession({
        title: '10-Day Monk Mode',
        startDate: '2026-11-20',
        plannedDays: 10,
        nonNegotiables: [vocal],
      }),
      status: 'ENDED_EARLY' as const,
      endedAtDate: '2026-11-21',
      earlyExitReason: 'Travel and exam week',
    };

    const report = evaluateMonkModeReport(
      session,
      {
        '2026-11-20': ['c-vocal'],
        '2026-11-21': ['c-vocal'],
      },
      '2026-11-22'
    );

    expect(report.remainingDays).toBe(8);
    expect(report.earlyExitPenalty).toBeGreaterThan(0.25);
    expect(report.finalScore).toBeLessThan(report.rawScore);
    expect(report.earlyExitReason).toBe('Travel and exam week');
  });
});
