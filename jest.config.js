export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
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
    '^react-markdown$': '<rootDir>/test/__mocks__/react-markdown.tsx',
    '^react-syntax-highlighter$': '<rootDir>/test/__mocks__/react-syntax-highlighter.tsx',
    '^.+IdentityMatcher$': '<rootDir>/test/__mocks__/IdentityMatcher.ts',
    '^.+/engine/composers/empathy\\.js$': '<rootDir>/test/__mocks__/empathy.js'
  },
  extensionsToTreatAsEsm: ['.ts'],
};
