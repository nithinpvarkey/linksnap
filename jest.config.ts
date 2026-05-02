import type { Config } from 'jest'

const config: Config = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        // Override module settings for Jest's Node.js runtime only.
        // The main tsconfig uses "esnext" + "bundler" which Node cannot run directly.
        // All strict settings (noUncheckedIndexedAccess etc.) are inherited from tsconfig.json.
        tsconfig: {
          module: 'CommonJS',
          moduleResolution: 'node',
          isolatedModules: false,
        },
      },
    ],
  },
  testPathIgnorePatterns: ['/node_modules/', '/.next/'],
}

export default config
