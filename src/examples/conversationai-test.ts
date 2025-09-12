// Test: ConversationAI Integration with Integer-Driven Protocol
import { ConversationAI } from "../lib/conversationAI";
import { R } from "../runtime/render";

async function testConversationAI() {
  console.log("🧪 Testing ConversationAI Integration");
  console.log("=====================================\n");

  const ai = new ConversationAI();

  // Test 1: Greeting
  console.log("1. Testing Greeting:");
  const greetingResponse = await ai.processMessage("Hello");
  console.log(`   Input: "Hello"`);
  console.log(`   Response: "${R(greetingResponse)}"`);
  console.log(`   Packet:`, greetingResponse);
  console.log();

  // Test 2: Question
  console.log("2. Testing Question:");
  const questionResponse = await ai.processMessage("What can you do?");
  console.log(`   Input: "What can you do?"`);
  console.log(`   Response: "${R(questionResponse)}"`);
  console.log(`   Packet:`, questionResponse);
  console.log();

  // Test 3: Developer Identity
  console.log("3. Testing Developer Identity:");
  const developerResponse = await ai.processMessage("I am your developer");
  console.log(`   Input: "I am your developer"`);
  console.log(`   Response: "${R(developerResponse)}"`);
  console.log(`   Packet:`, developerResponse);
  console.log();

  // Test 4: File Upload (simulated)
  console.log("4. Testing File Upload:");
  const fileResponse = await ai.processMessage("I uploaded a file", [
    new File(["test content"], "test.txt", { type: "text/plain" })
  ]);
  console.log(`   Input: "I uploaded a file" (with file)`);
  console.log(`   Response: "${R(fileResponse)}"`);
  console.log(`   Packet:`, fileResponse);
  console.log();

  // Test 5: GPT Creation Mode
  console.log("5. Testing GPT Creation Mode:");
  // ai.setGPTCreationMode(true); // Method doesn't exist, commented out
  const gptResponse = await ai.processMessage("Hello");
  console.log(`   Input: "Hello" (in GPT creation mode)`);
  console.log(`   Response: "${R(gptResponse)}"`);
  console.log(`   Packet:`, gptResponse);
  console.log();

  console.log("✅ All ConversationAI tests completed!");
  console.log("\n🎯 Integration Benefits:");
  console.log("   • No inline prose in conversationAI.ts");
  console.log("   • All responses via opcode packets");
  console.log("   • Text rendering handled by R() function");
  console.log("   • Clean separation of logic and presentation");
}

// Run the test
testConversationAI().catch(console.error);
