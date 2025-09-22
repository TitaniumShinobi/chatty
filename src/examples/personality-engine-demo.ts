// src/examples/personality-engine-demo.ts
// Demonstration of the Personality Engine with Empathy Adapter

import { ConversationCore } from '../engine/ConversationCore';

async function demonstratePersonalityEngine() {
  console.log('🎭 Personality Engine Demo\n');
  
  const core = new ConversationCore();
  
  // Test messages to demonstrate different responses
  const testMessages = [
    { message: "Hi there! I'm so excited to start this project!", expected: "enthusiastic" },
    { message: "I'm feeling really down today... nothing seems to be working", expected: "emotional" },
    { message: "Can you explain how this works? I'm not sure I understand", expected: "uncertain" },
    { message: "I need you to complete this task immediately.", expected: "professional" },
    { message: "Hey, what's up? Just chillin here", expected: "laid_back" }
  ];

  console.log('Testing Automatic Tone Adaptation:\n');
  
  for (const test of testMessages) {
    console.log(`User: "${test.message}"`);
    const response = await core.processMessage(test.message, {
      enableEmpathy: true,
      enableToneAdaptation: true
    });
    console.log(`Assistant: ${response[0].payload.content}`);
    console.log(`Expected tone: ${test.expected}, Actual: ${core.debugInfo().state.personality.currentTone}\n`);
  }

  console.log('\n🎭 Testing Different Personas:\n');

  // Test each persona
  const personas = ['helpful_assistant', 'creative_companion', 'wise_mentor'];
  const testMessage = "What should I do with my life?";

  for (const persona of personas) {
    core.activatePersona(persona);
    console.log(`\nPersona: ${persona}`);
    console.log(`User: "${testMessage}"`);
    const response = await core.processMessage(testMessage, {
      enableEmpathy: true,
      enableToneAdaptation: false, // Disable tone to see pure persona
      usePersona: persona
    });
    console.log(`Assistant: ${response[0].payload.content}`);
  }

  console.log('\n🌈 Testing Composite Persona:\n');

  // Create a composite persona
  core.createCompositePersona(
    'empathetic_creative',
    'Empathetic Creative Guide',
    ['creative_companion', 'wise_mentor'],
    [0.6, 0.4]
  );

  core.activatePersona('empathetic_creative');
  const creativeTest = "I want to write a story but I don't know where to start";
  console.log(`User: "${creativeTest}"`);
  const creativeResponse = await core.processMessage(creativeTest, {
    usePersona: 'empathetic_creative'
  });
  console.log(`Assistant: ${creativeResponse[0].payload.content}`);

  console.log('\n💬 Testing Fallback Responses:\n');

  const confusingMessages = [
    "Flibberty gibbet wonky donkey",
    "Can you xyzabc the qwerty?",
    "I need you to [incomprehensible request]"
  ];

  for (const msg of confusingMessages) {
    console.log(`User: "${msg}"`);
    const response = await core.processMessage(msg, {
      enableFallback: true
    });
    console.log(`Assistant: ${response[0].payload.content}\n`);
  }

  console.log('\n📊 Final Debug State:');
  console.log(JSON.stringify(core.debugInfo(), null, 2));
}

// Run the demo
if (require.main === module) {
  demonstratePersonalityEngine().catch(console.error);
}

export { demonstratePersonalityEngine };