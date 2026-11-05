/**
 * SM-2, as described by P. Wozniak.
 * Quality is an integer from 0 to 5.
 * Again = 1, Hard = 3, Good = 4, Easy = 5.
 * A quality below 3 resets the repetition count and sets the interval to 1 day.
 * The ease factor is updated with the published formula and is never below 1.3.
 */

export type SrsGrade = "again" | "hard" | "good" | "easy";

export interface SrsState {
  easiness: number;
  intervalDays: number;
  repetitions: number;
  lapses: number;
  dueAt: string;
  lastReviewedAt?: string;
  lastGrade?: SrsGrade;
}

export function qualityForGrade(grade: SrsGrade): number {
  if (grade === "again") {
    return 1;
  }
  if (grade === "hard") {
    return 3;
  }
  if (grade === "good") {
    return 4;
  }
  return 5;
}

export function initialSrsState(nowIso: string): SrsState {
  return {
    easiness: 2.5,
    intervalDays: 0,
    repetitions: 0,
    lapses: 0,
    dueAt: nowIso,
  };
}

function addDays(iso: string, days: number): string {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) {
    throw new Error("The review time is not a valid timestamp.");
  }
  return new Date(parsed + days * 24 * 60 * 60 * 1000).toISOString();
}

export function reviewCard(state: SrsState, grade: SrsGrade, reviewedAt: string): SrsState {
  const quality = qualityForGrade(grade);
  let easiness = state.easiness + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  if (easiness < 1.3) {
    easiness = 1.3;
  }
  let repetitions = state.repetitions;
  let intervalDays = state.intervalDays;
  let lapses = state.lapses;
  if (quality < 3) {
    repetitions = 0;
    intervalDays = 1;
    lapses += 1;
  } else {
    if (repetitions === 0) {
      intervalDays = 1;
    } else if (repetitions === 1) {
      intervalDays = 6;
    } else {
      intervalDays = Math.max(1, Math.round(intervalDays * easiness));
    }
    repetitions += 1;
  }
  return {
    easiness,
    intervalDays,
    repetitions,
    lapses,
    dueAt: addDays(reviewedAt, intervalDays),
    lastReviewedAt: reviewedAt,
    lastGrade: grade,
  };
}

export function isDue(state: Pick<SrsState, "dueAt">, nowIso: string): boolean {
  return Date.parse(state.dueAt) <= Date.parse(nowIso);
}
