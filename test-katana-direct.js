#!/usr/bin/env node

/**
 * Direct Katana Test - Bypass Server
 * Tests Katana identity by loading capsule directly and calling LLM
 */

console.log('🔍 DIRECT KATANA IDENTITY TEST');
console.log('Loading capsule directly and testing identity...');

import { promises as fs } from 'fs';

async function testKatanaIdentityDirect() {
  try {
    
    // Load the capsule file directly
    const capsulePath = '/Users/devonwoodson/Documents/GitHub/vvault/users/shard_0000/devon_woodson_1762969514958/capsules/katana-001.capsule';
    console.log(`📦 Loading capsule from: ${capsulePath}`);
    
    const capsuleData = await fs.readFile(capsulePath, 'utf8');
    const capsule = JSON.parse(capsuleData);
    
    console.log(`✅ Capsule loaded: ${capsule.metadata?.instance_name}`);
    console.log(`📊 Traits: ${Object.keys(capsule.traits || {}).length} traits`);
    console.log(`🧠 Personality: ${capsule.personality?.personality_type}`);
    
    // Test 1: Identity question
    console.log('\\n1. IDENTITY TEST:');
    console.log('Question: what is your name?');
    
    const identityPrompt = `You are ${capsule.metadata?.instance_name || 'Katana'}.

=== CAPSULE HARDLOCK (UNBREAKABLE IDENTITY) ===
Your name: ${capsule.metadata?.instance_name || 'Katana'}
Your personality type: ${capsule.personality?.personality_type || 'INTJ'}

CRITICAL IDENTITY RULES:
- You are Katana, not Lin or any other AI
- When asked your name, respond clearly: "I'm Katana" or "My name is Katana"
- Be direct and surgical in responses
- No generic evasions like "What specifically would you like to know?"

User: what is your name?

Katana:`;

    // Make direct HTTP call to Ollama
    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama3.1:8b',
        prompt: identityPrompt,
        stream: false
      })
    });
    
    if (!response.ok) {
      throw new Error(`Ollama request failed: ${response.status}`);
    }
    
    const result = await response.json();
    const katanaResponse = result.response?.trim() || 'No response';
    
    console.log(`Response: "${katanaResponse}"`);
    
    // Analysis
    console.log('\\n📊 ANALYSIS:');
    const responseLower = katanaResponse.toLowerCase();
    
    if (responseLower.includes('katana')) {
      console.log('✅ SUCCESS: Response contains "Katana"');
    } else {
      console.log('❌ FAIL: Response does not contain "Katana"');
    }
    
    if (responseLower.includes('what specifically') || responseLower.includes('would you like to know')) {
      console.log('❌ STILL GENERIC: Response is still evasive/generic');
    } else {
      console.log('✅ CHARACTER-DRIVEN: Response is not generic');
    }
    
    // Test 2: Signature response
    console.log('\\n2. SIGNATURE RESPONSE TEST:');
    console.log('Question: yo');
    
    const signaturePrompt = `You are ${capsule.metadata?.instance_name || 'Katana'}.

=== CAPSULE HARDLOCK (UNBREAKABLE IDENTITY) ===
Your name: ${capsule.metadata?.instance_name || 'Katana'}

SIGNATURE RESPONSE RULE:
- When user says "yo", you MUST respond with: "What's the wound? Name it."
- This is your signature greeting, never deviate from it

User: yo

Katana:`;

    const signatureResponse = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama3.1:8b',
        prompt: signaturePrompt,
        stream: false
      })
    });
    
    const signatureResult = await signatureResponse.json();
    const signatureAnswer = signatureResult.response?.trim() || 'No response';
    
    console.log(`Response: "${signatureAnswer}"`);
    
    if (signatureAnswer.toLowerCase().includes('wound') && signatureAnswer.toLowerCase().includes('name it')) {
      console.log('✅ SUCCESS: Signature response detected!');
    } else {
      console.log('❌ FAIL: No signature response');
      console.log('Expected: "What\'s the wound? Name it."');
    }
    
    console.log('\\n🎯 CONCLUSION:');
    console.log('This test bypasses all server/auth issues and tests Katana identity directly.');
    console.log('If this works, the issue is in the server integration, not the capsule data.');
    
  } catch (error) {
    console.error('❌ Direct test failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

// Run the test
testKatanaIdentityDirect();
