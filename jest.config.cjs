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
    '^#middlewares/(.*)\\.js$': '<rootDir>/src/middlewares/$1.ts',
    '^#middlewares/(.*)$': '<rootDir>/src/middlewares/$1',
    '^#types/(.*)\\.js$': '<rootDir>/src/types/$1.ts',
    '^#types/(.*)$': '<rootDir>/src/types/$1',
    '^#validations/(.*)\\.js$': '<rootDir>/src/validations/$1.ts',
    '^#validations/(.*)$': '<rootDir>/src/validations/$1',
    '^#xendit/payment_request/models$': '<rootDir>/src/xendit/payment_request/models.ts',
    '^#xendit/refund/models$': '<rootDir>/src/xendit/refund/models.ts',
    '^#xendit/payout/models$': '<rootDir>/src/xendit/payout/models.ts',
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
