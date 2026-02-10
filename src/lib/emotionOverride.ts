export type Emotion = 'neutral' | 'calm' | 'warm' | 'alert';

export function applyEmotionOverride(options: {
  emotion?: Emotion;
  baseInstructions: string;
}): { combined: string } {
  const prefix = options.emotion
    ? `/* Emotion override: ${options.emotion} */\n`
    : '';

  return {
    combined: `${prefix}${options.baseInstructions}`
  };
}
