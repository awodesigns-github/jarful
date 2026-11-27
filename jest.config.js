module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/tests/app/**/*.test.{ts,tsx}'],
  moduleNameMapper: { '\\.riv$': '<rootDir>/tests/app/__stubs__/riv.js', '^@/(.*)$': '<rootDir>/$1' },
  setupFilesAfterEnv: ['<rootDir>/tests/app/setup.ts'],
};
