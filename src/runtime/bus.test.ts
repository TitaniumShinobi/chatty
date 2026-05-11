import { OP } from "../proto/opcodes";
import { lexicon as lex } from "../data/lexicon";

// Mock render so bus.test does not load full render.tsx (React, markdown, etc.)
const tokenToString: Record<number, string> = {
  [lex.tokens.hello]: "Hello",
  [lex.names.devon]: "Devon",
  [lex.tokens.file]: "File",
  [lex.names.contractPdf]: "Contract.pdf",
  [lex.tokens.uploaded]: "uploaded",
  [lex.tokens.askNext]: "",
  [lex.tokens.codeReady]: "Code mode armed.",
  [lex.langs.typescript]: "TypeScript",
  [lex.tasks.writeFn]: "Write a function",
  [lex.tokens.authOk]: "Signed in.",
  [lex.tokens.errGeneric]: "Something went wrong.",
  [lex.tokens.idlePing]: "Idle ping",
  [lex.tokens.qaReady]: "QA ready",
  [lex.tokens.summaryReady]: "Summary ready",
};
function mockR(arg: any, _opts?: any, _extra?: any): string {
  if (arg && Array.isArray(arg.join)) {
    return arg.join.map((id: number) => tokenToString[id] ?? String(id)).filter(Boolean).join(" ");
  }
  if (typeof arg === "number") return tokenToString[arg] ?? String(arg);
  return "[empty]";
}
jest.mock("./render", () => ({ R: mockR, __esModule: true }));

import { dispatch } from "./bus";
import { pkt } from "../lib/emit";

describe("Event Bus - Integer-Driven Text Rendering", () => {
  test("HELLO opcode returns greeting with user name", async () => {
    const response = await dispatch(pkt(OP.HELLO, { userNameId: lex.names.devon }));
    expect(response).toBe("Hello Devon");
    expect(response).not.toContain("⟂"); // No missing tokens
  });

  test("FILE_UPLOADED opcode returns file acknowledgment", async () => {
    const response = await dispatch(pkt(OP.FILE_UPLOADED, {
      nameId: lex.names.contractPdf,
      typeId: lex.types.applicationPdf,
      bytes: 352188
    }));
    expect(response).toBe("File Contract.pdf uploaded");
    expect(response).not.toContain("⟂");
  });

  test("INTENT_CODE opcode returns code mode ready", async () => {
    const response = await dispatch(pkt(OP.INTENT_CODE, {
      langId: lex.langs.typescript,
      taskId: lex.tasks.writeFn
    }));
    expect(response).toBe("Code mode armed. TypeScript Write a function");
    expect(response).not.toContain("⟂");
  });

  test("AUTH_SUCCESS opcode returns authentication confirmation", async () => {
    const response = await dispatch(pkt(OP.AUTH_SUCCESS, {
      displayNameId: lex.names.devon,
      avatarUrlId: lex.urls.avatarDevon
    }));
    expect(response).toBe("Signed in. Devon");
    expect(response).not.toContain("⟂");
  });

  test("ERROR opcode returns generic error message", async () => {
    const response = await dispatch(pkt(OP.ERROR, { code: 500 }));
    expect(response).toBe("Something went wrong.");
    expect(response).not.toContain("⟂");
  });

  test("All opcodes return non-empty strings", async () => {
    const opcodes = [OP.HELLO, OP.FILE_UPLOADED, OP.IDLE_TIMEOUT, OP.INTENT_QA, OP.INTENT_CODE, OP.INTENT_SUMMARY, OP.AUTH_SUCCESS, OP.ERROR];
    
    for (const op of opcodes) {
      // Provide minimal valid payload for each opcode
      let payload = {};
      if (op === OP.HELLO) payload = { userNameId: lex.names.devon };
      else if (op === OP.FILE_UPLOADED) payload = { nameId: lex.names.contractPdf, typeId: lex.types.applicationPdf, bytes: 1000 };
      else if (op === OP.INTENT_CODE) payload = { langId: lex.langs.typescript, taskId: lex.tasks.writeFn };
      else if (op === OP.AUTH_SUCCESS) payload = { displayNameId: lex.names.devon, avatarUrlId: lex.urls.avatarDevon };
      else if (op === OP.ERROR) payload = { code: 500 };
      else if (op === OP.IDLE_TIMEOUT) payload = { minutes: 5 };
      else if (op === OP.INTENT_QA) payload = { topicId: 1 };
      else if (op === OP.INTENT_SUMMARY) payload = { docNameId: lex.names.contractPdf };
      
      const response = await dispatch(pkt(op, payload));
      expect(response).toBeTruthy();
      expect(response.length).toBeGreaterThan(0);
      expect(response).not.toContain("⟂");
    }
  });
});
