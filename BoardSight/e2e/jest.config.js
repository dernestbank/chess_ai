module.exports = {
  maxWorkers: 1,
  testEnvironment: 'detox/runners/jest/testEnvironment',
  testMatch: ['<rootDir>/**/*.test.ts'],
  transform: { '^.+\\.tsx?$': ['ts-jest', { tsconfig: { esModuleInterop: true } }] },
  globalSetup: 'detox/runners/jest/globalSetup',
  globalTeardown: 'detox/runners/jest/globalTeardown',
  reporters: ['detox/runners/jest/reporter'],
  testTimeout: 120000,
  verbose: true,
};
