import { lexicon as lex } from "../data/lexicon";

const TOKEN_TEXT: Record<number, string> = {
  [lex.tokens.hello]: "Hello",
  [lex.names.devon]: "Devon",
  [lex.tokens.file]: "File",
  [lex.names.contractPdf]: "Contract.pdf",
  [lex.tokens.uploaded]: "uploaded",
  [lex.tokens.askNext]: "",
  [lex.tokens.idlePing]: "Idle ping",
  [lex.tokens.qaReady]: "QA ready",
  [lex.tokens.codeReady]: "Code mode armed.",
  [lex.langs.typescript]: "TypeScript",
  [lex.tasks.writeFn]: "Write a function",
  [lex.tokens.summaryReady]: "Summary ready",
  [lex.tokens.authOk]: "Signed in.",
  [lex.tokens.errGeneric]: "Something went wrong.",
};

type LexFragment = number | string | { join: Array<number | string> };

function renderToken(token: number | string): string {
  if (typeof token === "number") return TOKEN_TEXT[token] ?? String(token);
  return token;
}

export function renderLex(...fragments: LexFragment[]): string {
  return fragments
    .map((fragment) => {
      if (typeof fragment === "object" && "join" in fragment) {
        return fragment.join.map(renderToken).filter(Boolean).join(" ");
      }
      return renderToken(fragment);
    })
    .filter(Boolean)
    .join(" ");
}
