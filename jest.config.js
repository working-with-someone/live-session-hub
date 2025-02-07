/** @type {import('ts-jest').JestConfigWithTsJest} */

module.exports = {
  verbose: true,
  clearMocks: true,
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/tests/jest/setup/mock.ts'],
  globalSetup: '<rootDir>/tests/jest/setup/global.ts',
};
