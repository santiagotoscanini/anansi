import { defineConfig } from 'drizzle-kit'
import { env } from './src/lib/env'

// Reads DATABASE_URL through the validated env module rather than
// `process.env.DATABASE_URL!`. drizzle-kit swallows connection errors and
// exits 1 with no output, so a missing or malformed URL used to surface as an
// unexplained failure — validation now names the variable instead.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/lib/data/schema.ts',
  out: './src/lib/data/db/migrations',
  dbCredentials: {
    url: env.DATABASE_URL,
  },
  verbose: true,
  strict: true,
})
