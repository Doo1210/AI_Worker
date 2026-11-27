import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
const root = fileURLToPath(new URL('..', import.meta.url))
const result = await build({ entryPoints: [resolve(root, 'tests/admin-regression.ts')], bundle: true, write: false, platform: 'node', format: 'esm', alias: { '@': resolve(root, 'src') }, define: { 'process.env.NODE_ENV': '"test"' } })
await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'))
