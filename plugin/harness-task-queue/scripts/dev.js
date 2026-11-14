import { mkdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const path = relative => fileURLToPath(new URL(relative, import.meta.url))
const home = path('../.local/development')
mkdirSync(home, { recursive: true, mode: 0o700 })

const result = spawnSync(process.execPath, [
  path('../node_modules/@deepseek-ai/dsh/lib/bin.js'),
  'web', '--patch', path('../environments/development/cordis.patch.yml'),
  ...process.argv.slice(2),
], {
  stdio: 'inherit',
  env: { ...process.env, DSH_HOME: home, DSH_AGENTS_HOME: path('../.local/development/agents') },
})
if (result.error) throw result.error
process.exitCode = result.status ?? 1
