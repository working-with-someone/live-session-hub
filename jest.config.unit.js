/** @type {import('ts-jest').JestConfigWithTsJest} */

module.exports = {
  verbose: true,
  clearMocks: true,
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFiles: [
    // mocking prisma client
    '<rootDir>/tests/jest/setup/singleton.ts',
  ],
  roots: ['<rootDir>/tests'],
};
