import { lexicon as lex } from "../data/lexicon";

type Dict = Record<number, string>;
export const STR: Dict = {
  [lex.tokens.hello]: "Hello",
  [lex.tokens.welcomeBack]: "Welcome back",
  [lex.tokens.file]: "File",
  [lex.tokens.uploaded]: "uploaded",
  [lex.tokens.askNext]: "What should I do next?",
  [lex.tokens.idlePing]: "You went idle. Continue?",
  [lex.tokens.qaReady]: "Ready for Q&A.",
  [lex.tokens.codeReady]: "Code mode armed.",
  [lex.tokens.summaryReady]: "Summary mode ready.",
  [lex.tokens.authOk]: "Signed in.",
  [lex.tokens.errGeneric]: "Something went wrong.",
  
  // New tokens for conversationAI - minimal lexicon
  [lex.tokens.greeting]: "Welcome back.",
  [lex.tokens.question]: "Ask your question.",
  [lex.tokens.fileUpload]: "You uploaded {count} file(s).",
  [lex.tokens.fileAnalysis]: "Analyzing: {names}.",
  [lex.tokens.fileError]: "Error processing file: {error}.",
  [lex.tokens.fileParsed]: "File parsed successfully: {name}.",
  [lex.tokens.fileParseFailed]: "Failed to parse file: {name}.",
  [lex.tokens.fileParseTimeout]: "File parsing timed out: {name}.",
  [lex.tokens.createGpt]: "Custom model design ready.",
  [lex.tokens.unknown]: "I didn't understand that.",
  [lex.tokens.developer]: "Developer mode acknowledged.",
  [lex.tokens.capabilities]: "Capabilities overview available.",
  [lex.tokens.aiTechnology]: "AI technology explanation ready.",
  [lex.tokens.personal]: "Acknowledged.",
  [lex.tokens.statement]: "Acknowledged.",
  [lex.tokens.request]: "I'm here to help.",
  [lex.tokens.clarification]: "Clarification needed.",
  [lex.tokens.general]: "Acknowledged.",

  [lex.names.devon]: "Devon",
  [lex.names.contractPdf]: "Contract.pdf",

  [lex.types.applicationPdf]: "PDF",
  [lex.types.imagePng]: "PNG",

  [lex.langs.typescript]: "TypeScript",
  [lex.langs.python]: "Python",

  [lex.tasks.writeFn]: "Write a function",
  [lex.tasks.fixBug]: "Fix a bug",

  [lex.urls.avatarDevon]: "https://…/avatar/devon.png"
};

export const DICT: Record<string, string | string[]> = {
  "greet.v1": [
    "Hey {userName}, what are we building today?",
    "Good to see you, {userName}. Where do you want to start?",
    "Welcome back, {userName}."
  ],
  "ask.clarify.v1": [
    "Got it. Do you want the short version on {topic}, or a deeper dive?",
    "I can cover {topic} quickly or go in-depth—your call."
  ],
  "answer.v1": [
    "{0}"
  ],
  "smalltalk.welcome.v1": [
    "I'm ready when you are.",
    "All set. Just say the word."
  ],
  "ack.file.v1": [
    "I see {count} file{count|s} attached."
  ],
  "fallback.v1": [
    "I didn’t catch that—can you rephrase?",
    "Say more about that and I’ll follow."
  ]
};
