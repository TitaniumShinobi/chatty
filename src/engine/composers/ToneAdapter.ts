// ToneAdapter.ts
// Maps affect vectors (valence, arousal) into style directives
// that other composers (Empathy, SmallTalk) can use to adjust wording.

export interface AffectVector {
  valence: number; // -1 (negative) .. +1 (positive)
  arousal: number; // -1 (calm) .. +1 (energetic)
}

export interface StyleDirective {
  polarity: 'positive' | 'neutral' | 'negative';
  energy: 'calm' | 'normal' | 'excited';
  formality: 'casual' | 'neutral' | 'formal';
}

export class ToneAdapter {
  static fromAffect(affect: AffectVector): StyleDirective {
    // Determine polarity
    let polarity: StyleDirective['polarity'];
    if (affect.valence > 0.3) polarity = 'positive';
    else if (affect.valence < -0.3) polarity = 'negative';
    else polarity = 'neutral';

    // Determine energy
    let energy: StyleDirective['energy'];
    if (affect.arousal > 0.4) energy = 'excited';
    else if (affect.arousal < -0.4) energy = 'calm';
    else energy = 'normal';

    // Simple formality heuristic (negative valence tends to warrant more formal reassurance)
    let formality: StyleDirective['formality'];
    if (polarity === 'negative' && energy !== 'excited') formality = 'formal';
    else if (energy === 'excited') formality = 'casual';
    else formality = 'neutral';

    return { polarity, energy, formality };
  }

  static applyStyle(content: string, style: StyleDirective): string {
    let result = content;

    // Apply polarity
    if (style.polarity === 'positive') {
      result = "😊 " + result;
    } else if (style.polarity === 'negative') {
      result = "🔹 " + result;
    }

    // Apply energy
    if (style.energy === 'excited') {
      result = result.toUpperCase();
    } else if (style.energy === 'calm') {
      result = result.replace(/!/g, '.');
    }

    // Apply formality (rudimentary)
    if (style.formality === 'formal') {
      result = "Allow me to elaborate. " + result;
    } else if (style.formality === 'casual') {
      result = result + " 😎";
    }

    return result;
  }
}
