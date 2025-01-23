/** @type {import('ts-jest').JestConfigWithTsJest} */

module.exports = {
  verbose: true,
  clearMocks: true,
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFilesAfterEnv: [
    '<rootDir>/tests/jest/setup/auth.ts',
  ],
  globalSetup : "<rootDir>/tests/jest/setup/global.ts",
};
