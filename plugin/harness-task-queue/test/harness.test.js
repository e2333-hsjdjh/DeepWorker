import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { dirname, delimiter, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { openQueue } from '../src/queue.js'

const root = fileURLToPath(new URL('../', import.meta.url))
const testRoot = join(root, '.local', 'test')
const dshBin = join(root, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
const patch = join(root, 'environments', 'test', 'cordis.patch.yml')

test('packs and installs the npm bundle, then exercises its tools in real Harness', () => {
  mkdirSync(testRoot, { recursive: true, mode: 0o700 })
  const run = mkdtempSync(join(testRoot, 'run-'))
  let success = false
  try {
    const work = join(run, 'workspace')
    mkdirSync(work)
    const home = join(run, 'harness')
    const env = {
      ...process.env,
      PATH: [dirname(process.execPath), join(root, 'node_modules', '.bin'), process.env.PATH].join(delimiter),
      DSH_HOME: home,
      DSH_AGENTS_HOME: join(run, 'agents'),
      DSH_TELEMETRY_DISABLED: '1',
      DEEPSEEK_API_KEY: '',
      DSH_PERMISSION_MODE: 'workspace-write',
    }
    const options = { cwd: work, env, encoding: 'utf8', timeout: 90_000 }
    const dsh = (...args) => execFileSync(process.execPath, [dshBin, ...args], options)
    const [pack] = JSON.parse(execFileSync('npm', ['pack', '--json', '--pack-destination', run], {
      ...options, cwd: root,
    }))
    assert.ok(pack.files.some(file => file.path === 'src/plugin.js'))
    assert.ok(pack.files.every(file => /^(?:src\/|cordis\.patch\.yml$|README\.md$|package\.json$|LICENSE$)/.test(file.path)))
    dsh('--profile', 'queue-test', '--from-default-profile', 'headless', '--dump-config')
    dsh('plugin', '--profile', 'queue-test', 'add', join(run, pack.filename),
      '--offline', '--ignore-scripts', '--config.auto-install-peers=false')
    const result = dsh('--profile', 'queue-test', '--patch', patch, 'Run the local task queue integration test.')
    assert.match(result, /LOCAL_TASK_QUEUE_TEST_OK/)
    const queue = openQueue(join(home, 'local-task-queue', 'tasks.sqlite'))
    try {
      const [task] = queue.list({ status: 'completed' })
      assert.equal(task?.title, 'Verify the local queue')
      assert.equal(queue.get(task.id).note, 'Read back the task through the installed plugin.')
    } finally {
      queue.close()
    }
    success = true
  } finally {
    if (success) rmSync(run, { recursive: true, force: true })
    else console.error(`Harness test files retained in ${run}`)
  }
})
