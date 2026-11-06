import { defineConfig } from 'vite'

// ONE-OFF, deleted with the script it builds: bundles
// scripts/migrate-bytea-to-s3.ts and everything it imports (postgres, the S3
// SDK through the canonical src/server/object-store) into .output/scripts/,
// because .output is what the runtime image holds (railpack.json's
// deploy.inputs) and a package left in node_modules is missing there at run
// time, after a green build. One self-contained file, so it also runs in a
// container built before it existed. Runs after the app's build (package.json
// `build`): Nitro rewrites .output first.
//
// `.mjs`, because the image has no package.json above .output to say
// "type": "module".
export default defineConfig({
  publicDir: false,
  ssr: { noExternal: true, target: 'node' },
  build: {
    ssr: true,
    outDir: '.output/scripts',
    emptyOutDir: true,
    minify: false,
    target: 'node24',
    rolldownOptions: {
      input: { 'migrate-bytea-to-s3': 'scripts/migrate-bytea-to-s3.ts' },
      output: { format: 'es', entryFileNames: '[name].mjs', codeSplitting: false },
    },
  },
})
