export type Difficulty = "beginner" | "intermediate" | "advanced";

const ORDER: readonly Difficulty[] = ["beginner", "intermediate", "advanced"];

export interface TopicPerformance {
  topic: string;
  correct: number;
  incorrect: number;
  streakCorrect: number;
  streakIncorrect: number;
  difficulty: Difficulty;
  updatedAt: string;
}

export function isDifficulty(value: string): value is Difficulty {
  return value === "beginner" || value === "intermediate" || value === "advanced";
}

/**
 * Two correct answers in a row move up one level.
 * Two incorrect answers in a row move down one level.
 * A single answer does not change the level. Nothing here is random.
 */
export function applyOutcome(
  current: Pick<TopicPerformance, "difficulty" | "streakCorrect" | "streakIncorrect" | "correct" | "incorrect">,
  correct: boolean,
): Pick<TopicPerformance, "difficulty" | "streakCorrect" | "streakIncorrect" | "correct" | "incorrect"> {
  const index = ORDER.indexOf(current.difficulty);
  if (correct) {
    const streakCorrect = current.streakCorrect + 1;
    if (streakCorrect >= 2 && index < ORDER.length - 1) {
      return {
        difficulty: ORDER[index + 1] ?? current.difficulty,
        streakCorrect: 0,
        streakIncorrect: 0,
        correct: current.correct + 1,
        incorrect: current.incorrect,
      };
    }
    return {
      difficulty: current.difficulty,
      streakCorrect,
      streakIncorrect: 0,
      correct: current.correct + 1,
      incorrect: current.incorrect,
    };
  }
  const streakIncorrect = current.streakIncorrect + 1;
  if (streakIncorrect >= 2 && index > 0) {
    return {
      difficulty: ORDER[index - 1] ?? current.difficulty,
      streakCorrect: 0,
      streakIncorrect: 0,
      correct: current.correct,
      incorrect: current.incorrect + 1,
    };
  }
  return {
    difficulty: current.difficulty,
    streakCorrect: 0,
    streakIncorrect,
    correct: current.correct,
    incorrect: current.incorrect + 1,
  };
}

export function emptyTopic(topic: string, updatedAt: string): TopicPerformance {
  return {
    topic,
    correct: 0,
    incorrect: 0,
    streakCorrect: 0,
    streakIncorrect: 0,
    difficulty: "beginner",
    updatedAt,
  };
}
