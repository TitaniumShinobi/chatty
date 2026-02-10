export const lexicon = {
  tokens: {
    hello: 101,
    welcomeBack: 102,
    file: 201,
    uploaded: 202,
    askNext: 203,
    idlePing: 301,
    qaReady: 401,
    codeReady: 501,
    summaryReady: 601,
    authOk: 701,
    errGeneric: 900,
    // New tokens for conversationAI
    greeting: 100,
    question: 120,
    fileUpload: 200,
    fileAnalysis: 210,
    fileError: 220,
    fileParsed: 230,
    fileParseFailed: 255,
    fileParseTimeout: 254,
    // Large File Intelligence Layer
    fileChunkingStart: 240,
    fileChunkingProgress: 241,
    fileChunkingComplete: 242,
    fileIndexingStart: 243,
    fileIndexingProgress: 244,
    fileIndexingComplete: 245,
    contextQueryStart: 246,
    contextQueryProgress: 247,
    contextQueryComplete: 248,
    semanticSearchStart: 249,
    semanticSearchProgress: 250,
    semanticSearchComplete: 251,
    vectorStoreReady: 252,
    // Memory and Continuity System
    memoryCreated: 253,
    memoryUpdated: 254,
    memoryDeleted: 255,
    memoryRetrieved: 256,
    memoryInjected: 257,
    continuityHookCreated: 258,
    continuityHookTriggered: 259,
    sessionMemoryLoaded: 260,
    userMemorySynced: 261,
                memoryRitualCompleted: 262,
            // Symbolic Reasoning System
            symbolicPatternDetected: 263,
            motifSynthesized: 264,
            themeInferred: 265,
            symbolicQueryExecuted: 266,
            anchorPatternFound: 267,
            recursiveMotifTracked: 268,
            symbolicReasoningCompleted: 269,
            thematicAnalysisFinished: 270,
            patternCorrelationDiscovered: 271,
            symbolicInsightGenerated: 272,
            // Narrative Synthesis System
            narrativeSynthesized: 273,
            storylineGenerated: 274,
            narrativeQueryExecuted: 275,
            multiDocumentSynthesisCompleted: 276,
            narrativeScaffoldingCreated: 277,
            symbolicFramingApplied: 278,
            narrativeContinuityEstablished: 279,
            storyArcDetected: 280,
            narrativeInsightGenerated: 281,
            narrativeSynthesisCompleted: 282,
            createGpt: 300,
            unknown: 283,
    developer: 110,
    capabilities: 130,
    aiTechnology: 140,
    personal: 150,
    statement: 160,
    request: 170,
    clarification: 180,
    general: 190
  },
  names: {
    devon: 10001,
    contractPdf: 10002
  },
  types: {
    applicationPdf: 20001,
    imagePng: 20002
  },
  langs: {
    typescript: 30001,
    python: 30002
  },
  tasks: {
    writeFn: 40001,
    fixBug: 40002
  },
  urls: {
    avatarDevon: 50001
  }
} as const;
