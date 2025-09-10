// Demo: Integer-Driven Protocol in Action
import { dispatch } from "../runtime/bus";
import { pkt } from "../lib/emit";
import { OP } from "../proto/opcodes";
import { lexicon as lex } from "../data/lexicon";

async function demo() {
  console.log("🎯 Integer-Driven Protocol Demo");
  console.log("================================\n");

  // Demo 1: User login
  console.log("1. User Login:");
  const loginResponse = await dispatch(pkt(OP.HELLO, { userNameId: lex.names.devon }));
  console.log(`   Response: "${loginResponse}"`);
  console.log(`   Opcode: ${OP.HELLO}, Payload: { userNameId: ${lex.names.devon} }`);
  console.log();

  // Demo 2: File upload
  console.log("2. File Upload:");
  const fileResponse = await dispatch(pkt(OP.FILE_UPLOADED, {
    nameId: lex.names.contractPdf,
    typeId: lex.types.applicationPdf,
    bytes: 352188
  }));
  console.log(`   Response: "${fileResponse}"`);
  console.log(`   Opcode: ${OP.FILE_UPLOADED}, Payload: { nameId: ${lex.names.contractPdf}, typeId: ${lex.types.applicationPdf}, bytes: 352188 }`);
  console.log();

  // Demo 3: Code intent
  console.log("3. Code Intent:");
  const codeResponse = await dispatch(pkt(OP.INTENT_CODE, {
    langId: lex.langs.typescript,
    taskId: lex.tasks.writeFn
  }));
  console.log(`   Response: "${codeResponse}"`);
  console.log(`   Opcode: ${OP.INTENT_CODE}, Payload: { langId: ${lex.langs.typescript}, taskId: ${lex.tasks.writeFn} }`);
  console.log();

  // Demo 4: Authentication
  console.log("4. Authentication:");
  const authResponse = await dispatch(pkt(OP.AUTH_SUCCESS, {
    displayNameId: lex.names.devon,
    avatarUrlId: lex.urls.avatarDevon
  }));
  console.log(`   Response: "${authResponse}"`);
  console.log(`   Opcode: ${OP.AUTH_SUCCESS}, Payload: { displayNameId: ${lex.names.devon}, avatarUrlId: ${lex.urls.avatarDevon} }`);
  console.log();

  // Demo 5: Error handling
  console.log("5. Error Handling:");
  const errorResponse = await dispatch(pkt(OP.ERROR, { code: 500 }));
  console.log(`   Response: "${errorResponse}"`);
  console.log(`   Opcode: ${OP.ERROR}, Payload: { code: 500 }`);
  console.log();

  console.log("✅ All demos completed successfully!");
  console.log("\n🎯 Key Benefits:");
  console.log("   • Zero helper text in code paths");
  console.log("   • All text from lexicon.json via integer IDs");
  console.log("   • Deterministic, testable outputs");
  console.log("   • Swappable language packs");
  console.log("   • Pure signal-driven architecture");
}

// Run the demo
demo().catch(console.error);
