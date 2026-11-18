module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/tests/app/**/*.test.{ts,tsx}'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/$1' },
  setupFilesAfterEnv: ['<rootDir>/tests/app/setup.ts'],
};
