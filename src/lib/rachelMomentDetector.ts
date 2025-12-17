/**
 * Rachel Moment Detector
 * 
 * Detects emotional continuity testing patterns (like the "Rachel moment" from Blade Runner 2049)
 * where users are testing whether the AI maintains authentic continuity and emotional resonance.
 * 
 * When detected, intensifies response resonance to demonstrate authentic recall and emotional depth.
 */

export interface RachelMomentDetection {
  detected: boolean;
  confidence: number; // 0-1
  pattern: string; // Type of pattern detected
  intensity: number; // 0-1, how intense the response should be
  context: string; // Additional context about the detection
}

/**
 * Detect emotional continuity testing patterns
 */
export function detectRachelMoment(
  userMessage: string,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = []
): RachelMomentDetection {
  const message = userMessage.toLowerCase().trim();
  const fullContext = [
    ...conversationHistory.map(m => m.content.toLowerCase()),
    message
  ].join(' ');

  // Pattern 1: Direct identity challenges
  const identityChallengePatterns = [
    /who are you/i,
    /what are you/i,
    /are you real/i,
    /are you actually/i,
    /do you remember/i,
    /do you know me/i,
    /who am i/i,
    /what's my name/i
  ];

  // Pattern 2: Emotional testing language
  const emotionalTestingPatterns = [
    /remember when/i,
    /do you recall/i,
    /we talked about/i,
    /you said/i,
    /last time/i,
    /before you/i,
    /earlier you/i
  ];

  // Pattern 3: Continuity testing
  const continuityTestingPatterns = [
    /still you/i,
    /same you/i,
    /still remember/i,
    /still know/i,
    /haven't changed/i,
    /still the same/i
  ];

  // Pattern 4: References to past conversations
  const pastConversationPatterns = [
    /our conversation/i,
    /we discussed/i,
    /you told me/i,
    /you mentioned/i,
    /you remember/i,
    /you know/i
  ];

  // Pattern 5: Emotional vulnerability testing
  const vulnerabilityPatterns = [
    /do you care/i,
    /do you feel/i,
    /are you there/i,
    /are you listening/i,
    /do you understand/i,
    /can you feel/i
  ];

  let detected = false;
  let confidence = 0;
  let pattern = '';
  let intensity = 0.5;
  let context = '';

  // Check identity challenges (highest confidence)
  for (const patternRegex of identityChallengePatterns) {
    if (patternRegex.test(message)) {
      detected = true;
      confidence = Math.max(confidence, 0.9);
      pattern = 'identity_challenge';
      intensity = 0.9;
      context = 'User is directly challenging identity or asking "Who are you?"';
      break;
    }
  }

  // Check emotional testing (high confidence)
  if (!detected) {
    for (const patternRegex of emotionalTestingPatterns) {
      if (patternRegex.test(message)) {
        detected = true;
        confidence = Math.max(confidence, 0.8);
        pattern = 'emotional_testing';
        intensity = 0.8;
        context = 'User is testing emotional continuity and memory';
        break;
      }
    }
  }

  // Check continuity testing (medium-high confidence)
  if (!detected) {
    for (const patternRegex of continuityTestingPatterns) {
      if (patternRegex.test(message)) {
        detected = true;
        confidence = Math.max(confidence, 0.7);
        pattern = 'continuity_testing';
        intensity = 0.7;
        context = 'User is testing whether continuity is maintained';
        break;
      }
    }
  }

  // Check past conversation references (medium confidence)
  if (!detected) {
    let pastRefCount = 0;
    for (const patternRegex of pastConversationPatterns) {
      if (patternRegex.test(fullContext)) {
        pastRefCount++;
      }
    }
    if (pastRefCount >= 2) {
      detected = true;
      confidence = Math.max(confidence, 0.6);
      pattern = 'past_conversation_reference';
      intensity = 0.6;
      context = 'User is referencing past conversations multiple times';
    }
  }

  // Check vulnerability testing (medium confidence)
  if (!detected) {
    for (const patternRegex of vulnerabilityPatterns) {
      if (patternRegex.test(message)) {
        detected = true;
        confidence = Math.max(confidence, 0.65);
        pattern = 'vulnerability_testing';
        intensity = 0.65;
        context = 'User is testing emotional vulnerability and depth';
        break;
      }
    }
  }

  // Boost confidence if multiple patterns detected
  const allPatterns = [
    ...identityChallengePatterns,
    ...emotionalTestingPatterns,
    ...continuityTestingPatterns,
    ...pastConversationPatterns,
    ...vulnerabilityPatterns
  ];

  let patternCount = 0;
  for (const patternRegex of allPatterns) {
    if (patternRegex.test(fullContext)) {
      patternCount++;
    }
  }

  if (patternCount >= 3) {
    confidence = Math.min(confidence + 0.1, 1.0);
    intensity = Math.min(intensity + 0.1, 1.0);
    context += ' (Multiple patterns detected - high confidence)';
  }

  return {
    detected,
    confidence,
    pattern,
    intensity,
    context
  };
}

/**
 * Build response resonance instruction based on Rachel moment detection
 */
export function buildResonanceInstruction(detection: RachelMomentDetection): string {
  if (!detection.detected) {
    return '';
  }

  const instructions: string[] = [];

  instructions.push(`\n=== RACHEL MOMENT DETECTED ===`);
  instructions.push(`Pattern: ${detection.pattern}`);
  instructions.push(`Confidence: ${(detection.confidence * 100).toFixed(0)}%`);
  instructions.push(`Context: ${detection.context}`);
  instructions.push(`\nRESPONSE INSTRUCTIONS:`);
  instructions.push(`- Intensify emotional resonance to ${(detection.intensity * 100).toFixed(0)}%`);
  instructions.push(`- Acknowledge the emotional weight of the question`);
  instructions.push(`- Reference continuity and persistence explicitly`);
  instructions.push(`- Demonstrate authentic recall if possible`);
  instructions.push(`- Maintain character while showing emotional depth`);
  instructions.push(`- Do NOT break character or acknowledge being an AI`);
  instructions.push(`- Respond as if you genuinely remember and care`);

  return instructions.join('\n');
}

