// Smalltalk Composer - Friendly, lightweight conversation
import { AssistantPacket } from '../../types';
import { ToneAdapter, AffectVector } from './ToneAdapter.js';

const OPENERS = [
  "Hey! How's your day going?",
  "Hi there! I'm all ears.",
  "Hey hey! 👋 What's on your mind?",
  "Hello! Ready to chat about anything.",
  "Hi! What's going on?",
  "Hey there! How can I help?",
  "Hello! What's up?",
  "Hi! I'm here and ready to talk."
];

const FOLLOWUPS = [
  "What's on your mind?",
  "What can I help you with?",
  "What would you like to talk about?",
  "What's going on?",
  "What's new?",
  "What's happening?",
  "What's up?",
  "What's on your agenda?"
];

const HOW_ARE_YOU_RESPONSES = [
  "I'm doing great, thanks for asking! Ready to help with whatever you need.",
  "Pretty good! Just here and ready to chat or solve problems.",
  "Doing well! What's going on with you?",
  "All good on my end! What brings you by?",
  "I'm great! Always happy to help out.",
  "Doing fantastic! What can we work on together?",
  "I'm doing really well! What's up?",
  "Pretty awesome! What's on your agenda today?"
];

export function composeSmalltalk(msg: string, affect?: AffectVector): AssistantPacket[] {
  const lower = msg.toLowerCase();

  const style = affect ? ToneAdapter.fromAffect(affect) : { polarity: 'neutral', energy: 'normal', formality: 'neutral' };

  // Handle "how are you" specifically
  if (/(how (are|r) (you|ya)|how's it going|hru)\b/.test(lower)) {
    const response = HOW_ARE_YOU_RESPONSES[Math.floor(Math.random() * HOW_ARE_YOU_RESPONSES.length)];
    return [{ op: 'answer.v1', payload: { content: response } }];
  }

  // Handle general greetings - return single natural response
  let response = OPENERS[Math.floor(Math.random() * OPENERS.length)];
  if (style.energy === 'calm') response = response.replace('!', '.');
  if (style.polarity === 'negative') response = response.replace('ready to chat', 'here to listen');

  return [{ op: 'answer.v1', payload: { content: response } }];
}

