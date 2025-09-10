import lex from "../data/lexicon.json";

type Dict = Record<number, string>;
export const STR: Dict = {
	// Core tokens
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

	// Batty-specific tokens
	[lex.tokens.memoryCreated]: "Memory created",
	[lex.tokens.memoryRetrieved]: "Memory retrieved",
	[lex.tokens.reasoningStarted]: "Reasoning started",
	[lex.tokens.reasoningCompleted]: "Reasoning completed",
	[lex.tokens.fileProcessingStarted]: "File processing started",
	[lex.tokens.fileProcessingCompleted]: "File processing completed",
	[lex.tokens.narrativeSynthesisStarted]: "Narrative synthesis started",
	[lex.tokens.narrativeSynthesisCompleted]: "Narrative synthesis completed",
	[lex.tokens.largeFileAnalysisStarted]: "Large file analysis started",
	[lex.tokens.largeFileAnalysisCompleted]: "Large file analysis completed",

	// Names
	[lex.names.devon]: "Devon",
	[lex.names.contractPdf]: "Contract.pdf",
	[lex.names.batty]: "Batty",
	[lex.names.nova]: "Nova",

	// File types
	[lex.types.applicationPdf]: "PDF",
	[lex.types.imagePng]: "PNG",
	[lex.types.textPlain]: "Text",
	[lex.types.applicationJson]: "JSON",

	// Languages
	[lex.langs.typescript]: "TypeScript",
	[lex.langs.python]: "Python",
	[lex.langs.javascript]: "JavaScript",
	[lex.langs.markdown]: "Markdown",

	// Tasks
	[lex.tasks.writeFn]: "Write a function",
	[lex.tasks.fixBug]: "Fix a bug",
	[lex.tasks.analyzeData]: "Analyze data",
	[lex.tasks.generateReport]: "Generate report",

	// URLs
	[lex.urls.avatarDevon]: "https://…/avatar/devon.png",
	[lex.urls.avatarBatty]: "https://…/avatar/batty.png",
};