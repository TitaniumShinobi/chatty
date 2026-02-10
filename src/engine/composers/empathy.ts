import { ToneAdapter, AffectVector } from './ToneAdapter.js';

export function composeEmpatheticReply(tone: string, _text: string, affect?: AffectVector): string {
  // Map affect to style directives (optional)
  const style = affect ? ToneAdapter.fromAffect(affect) : { polarity: 'neutral', energy: 'normal', formality: 'neutral' };

  const politePrefix = style.formality === 'formal' ? 'I understand. ' : '';

  if (tone === "frustrated") {
    if (style.energy === 'calm' && style.polarity === 'negative')
      return politePrefix + "I understand; let’s take it step-by-step.";
    if (style.energy === 'excited' && style.polarity === 'positive')
      return politePrefix + "Got it! Let’s tackle this head-on together.";
    return politePrefix + "I hear you. That sounds exhausting. Want to walk through it together?";
  }
  if (tone === "venting") {
    if (style.energy === 'calm')
      return politePrefix + "You're totally valid. Feel free to share more. I'm here for you.";
    return politePrefix + "I get where you're coming from. Let it out—I'm listening.";
  }
  // Generic mapping examples
  if (style.energy === 'excited' && style.polarity === 'positive') {
    return politePrefix + "Awesome! Let’s jump right in!";
  }
  return politePrefix + "I'm here if you need to talk more.";
}
