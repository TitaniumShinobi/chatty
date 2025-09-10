// Example: How to integrate the integer-driven protocol with Chatty
import { dispatch } from "../runtime/bus";
import { pkt } from "../lib/emit";
import { OP } from "../proto/opcodes";
import { lexicon as lex } from "../data/lexicon";

// Example 1: User logs in
export async function handleUserLogin(userName: string) {
  // Map userName to lexicon ID (in real app, this would be dynamic)
  const userNameId = lex.names.devon; // or lookup in dynamic lexicon
  
  const response = await dispatch(pkt(OP.HELLO, { userNameId }));
  console.log(response); // "Hello Devon"
  return response;
}

// Example 2: File upload
export async function handleFileUpload(fileName: string, fileType: string, fileSize: number) {
  // Map to lexicon IDs
  const nameId = lex.names.contractPdf; // or dynamic lookup
  const typeId = lex.types.applicationPdf; // or dynamic lookup
  
  const response = await dispatch(pkt(OP.FILE_UPLOADED, {
    nameId,
    typeId,
    bytes: fileSize
  }));
  console.log(response); // "File Contract.pdf uploaded\nWhat should I do next?"
  return response;
}

// Example 3: Code intent detection
export async function handleCodeIntent(language: string, task: string) {
  // Map to lexicon IDs
  const langId = lex.langs.typescript; // or dynamic lookup
  const taskId = lex.tasks.writeFn; // or dynamic lookup
  
  const response = await dispatch(pkt(OP.INTENT_CODE, { langId, taskId }));
  console.log(response); // "Code mode armed. TypeScript Write a function"
  return response;
}

// Example 4: Authentication success
export async function handleAuthSuccess(displayName: string, avatarUrl: string) {
  const displayNameId = lex.names.devon; // or dynamic lookup
  const avatarUrlId = lex.urls.avatarDevon; // or dynamic lookup
  
  const response = await dispatch(pkt(OP.AUTH_SUCCESS, {
    displayNameId,
    avatarUrlId
  }));
  console.log(response); // "Signed in. Devon"
  return response;
}

// Example 5: Error handling
export async function handleError(errorCode: number) {
  const response = await dispatch(pkt(OP.ERROR, { code: errorCode }));
  console.log(response); // "Something went wrong."
  return response;
}

// Integration with Chatty's AI service
export class ProtocolAIService {
  async processMessage(userMessage: string, files?: File[]): Promise<string> {
    // Instead of generating text directly, emit opcodes
    if (files && files.length > 0) {
      return await handleFileUpload(files[0].name, files[0].type, files[0].size);
    }
    
    // Detect intent and emit appropriate opcode
    if (userMessage.toLowerCase().includes('code')) {
      return await handleCodeIntent('typescript', 'write function');
    }
    
    // Default to hello
    return await handleUserLogin('Devon');
  }
}
