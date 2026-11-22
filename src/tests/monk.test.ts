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
    createdAt: '2026-11-20',
  };

  it('locks non-negotiables while Monk Mode is active', () => {
    const session = createMonkModeSession({
      title: '14-Day Monk Mode',
      startDate: '2026-11-20',
      plannedDays: 14,
      nonNegotiables: [vocal],
    });
    expect(isCommitmentLocked(vocal, session)).toBe(true);
    expect(isCommitmentLocked(vocal, null)).toBe(false);
  });

  it('compounds score by 1.01 on compliant days and decays by 0.99 on broken days', () => {
    const session = createMonkModeSession({
      title: '3-Day Sprint',
      startDate: '2026-11-20',
      plannedDays: 3,
      nonNegotiables: [vocal],
    });

    const report = evaluateMonkModeReport(
      session,
      {
        '2026-11-20': ['c-vocal'], // 1.01
        '2026-11-21': [], // 1.01 * 0.99 = 0.9999
        '2026-11-22': ['c-vocal'], // 0.9999 * 1.01 = 1.0099
      },
      '2026-11-22'
    );

    expect(report.compliantDays).toBe(2);
    expect(report.brokenDays).toBe(1);
    expect(report.rawScore).toBeCloseTo(1.0099, 3);
    expect(report.earlyExitPenalty).toBe(0);
    expect(report.finalScore).toBeCloseTo(1.0099, 3);
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
      endedAtDate: '2026-11-21', // 2 days elapsed, 8 days remaining
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
