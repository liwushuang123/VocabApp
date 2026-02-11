// SM-2 spaced repetition algorithm adapted for 3-button review
// Buttons: Hard (quality=1), Neutral (quality=3), Easy (quality=5)

export interface SM2State {
  repetitions: number;
  easeFactor: number;
  intervalDays: number;
  nextReviewAt: string; // ISO date string
}

export function sm2(
  quality: number, // 1 = Hard, 3 = Neutral, 5 = Easy
  state: SM2State
): SM2State {
  let { repetitions, easeFactor, intervalDays } = state;

  if (quality >= 3) {
    // Correct response (Neutral or Easy)
    if (repetitions === 0) intervalDays = 1;
    else if (repetitions === 1) intervalDays = 6;
    else intervalDays = Math.ceil(intervalDays * easeFactor);
    repetitions += 1;
  } else {
    // Hard — reset
    repetitions = 0;
    intervalDays = 1;
  }

  // Update ease factor
  easeFactor =
    easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  if (easeFactor < 1.3) easeFactor = 1.3;

  const nextDate = new Date();
  nextDate.setDate(nextDate.getDate() + intervalDays);

  return {
    repetitions,
    easeFactor: Math.round(easeFactor * 100) / 100,
    intervalDays,
    nextReviewAt: nextDate.toISOString(),
  };
}
