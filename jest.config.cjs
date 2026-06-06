/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^#prisma$': '<rootDir>/tests/mocks/prisma-enums.ts',
    '^#utils/(.*)\\.js$': '<rootDir>/src/utils/$1.ts',
    '^#utils/(.*)$': '<rootDir>/src/utils/$1',
    '^#config/(.*)\\.js$': '<rootDir>/src/config/$1.ts',
    '^#config/(.*)$': '<rootDir>/src/config/$1',
    '^#constants/(.*)\\.js$': '<rootDir>/src/constants/$1.ts',
    '^#constants/(.*)$': '<rootDir>/src/constants/$1',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: {
          module: 'ESNext',
          moduleResolution: 'node',
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
        },
      },
    ],
  },
  testMatch: ['**/tests/**/*.test.ts'],
  setupFiles: ['<rootDir>/tests/setup-env.cjs'],
  forceExit: true,
};
