export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: [
    '<rootDir>/src/**/*.test.ts',
    '<rootDir>/src/**/*.test.tsx',
    '<rootDir>/tests/hydrationCache.test.ts',
  ],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { useESM: true }],
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testPathIgnorePatterns: [
    '/node_modules/',
    'symbolic-reasoning.test.ts',
    // 'browserMemory.test.ts', // RESTORED: Critical browser memory management test
    'dynamic-persona-mirroring.test.ts',
    'personal-greeting.test.ts',
    // 'runtime/bus.test.ts', // RESTORED: Critical runtime bus system test
    'no-prose-assistant.test.ts',
    'katana-lock-hardening.test.ts'
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^react-markdown$': '<rootDir>/test/__mocks__/react-markdown.tsx',
    '^react-syntax-highlighter$': '<rootDir>/test/__mocks__/react-syntax-highlighter.tsx',
    '^react-syntax-highlighter/dist/esm/styles/prism$': '<rootDir>/test/__mocks__/react-syntax-highlighter-styles.js',
    '^remark-breaks$': '<rootDir>/test/__mocks__/remark-breaks.js',
    '^rehype-raw$': '<rootDir>/test/__mocks__/rehype-raw.js',
    '^.+/voice/useVoiceController$': '<rootDir>/test/__mocks__/useVoiceController.tsx',
    '^.+IdentityMatcher$': '<rootDir>/test/__mocks__/IdentityMatcher.ts',
    '^.+/engine/composers/empathy\\.js$': '<rootDir>/test/__mocks__/empathy.js',
    '\\.module\\.css$': '<rootDir>/test/__mocks__/cssModule.js'
  },
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  transformIgnorePatterns: [
    '/node_modules/(?!remark-breaks|rehype-raw|remark-math|rehype-katex)',
  ],
};
