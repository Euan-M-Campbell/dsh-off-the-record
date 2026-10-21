import { defineConfig } from 'vitest/config'
import { lowerDecorators } from './scripts/lower-decorators.ts'

export default defineConfig({
  // The Off the Record service's @Remote decorators, lowered as the build lowers them.
  plugins: [{ ...lowerDecorators(), enforce: 'pre' as const }],
  test: {
    include: ['tests/**/*.spec.ts'],
    globalSetup: ['tests/global-setup.ts'],
  },
})
