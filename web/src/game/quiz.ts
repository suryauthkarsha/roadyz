import { SIGNS } from "./signs";

/** One quiz-revive question: identify the meaning of a road sign. */
export interface QuizQuestion {
  signId: string;
  signName: string;
  prompt: string;
  options: string[];
  correctIndex: number;
}

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Builds a 3-option "what does this sign mean?" question. Distractors are
 * real meanings of OTHER signs, so wrong answers still teach something.
 */
export function makeSignQuiz(): QuizQuestion {
  const sign = SIGNS[Math.floor(Math.random() * SIGNS.length)];
  const distractors = shuffle(SIGNS.filter((s) => s.id !== sign.id))
    .slice(0, 2)
    .map((s) => s.option);
  const options = shuffle([sign.option, ...distractors]);
  return {
    signId: sign.id,
    signName: sign.name,
    prompt: "What does this sign mean?",
    options,
    correctIndex: options.indexOf(sign.option),
  };
}
