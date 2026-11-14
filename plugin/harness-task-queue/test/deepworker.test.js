import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { delimiter, dirname, join, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import test from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { promisify } from 'node:util'

const exec = promisify(execFile)
const checkout = process.env.DEEPWORKER_CHECKOUT

async function freePort() {
  const server = createServer()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const { port } = server.address()
  server.close()
  await once(server, 'close')
  return port
}

function shellQuote(str) {
  return "'" + str.replaceAll("'", "'\\''") + "'"
}

async function client(t, cwd, env) {
  const child = spawn(process.execPath, [resolve(checkout, 'bin/deepworker.js'), 'serve'], {
    cwd, env, stdio: ['pipe', 'pipe', 'pipe'],
  })
  const closed = once(child, 'close')
  const lines = createInterface({ input: child.stdout })
  const waiting = new Map()
  let diagnostics = ''
  let nextId = 0
  child.stderr.on('data', chunk => { diagnostics = (diagnostics + chunk).slice(-2000) })
  lines.on('line', line => {
    const reply = JSON.parse(line)
    waiting.get(reply.id)?.resolve(reply)
  })
  child.on('close', () => {
    for (const { reject } of waiting.values()) reject(new Error('DeepWorker exited: ' + diagnostics))
  })
  t.after(async () => {
    child.stdin.end()
    await closed
  })

  return async (name, args = {}) => {
    const id = ++nextId
    let timer
    try {
      const reply = await new Promise((resolve, reject) => {
        waiting.set(id, { resolve, reject })
        timer = setTimeout(() => reject(new Error(name + ' timed out')), 30000)
        child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } }) + '\n')
      })
      assert.ok(reply.result, JSON.stringify(reply.error))
      assert.equal(reply.result.isError, false, reply.result.content[0].text)
      return JSON.parse(reply.result.content[0].text)
    } finally {
      clearTimeout(timer)
      waiting.delete(id)
    }
  }
}

test('DeepWorker manages a real Harness across tasks, approvals, cancellation and restart', {
  skip: !checkout && 'Set DEEPWORKER_CHECKOUT to the DeepWorker checkout',
  timeout: 90000,
}, async t => {
  const testHome = resolve('.local/test')
  await mkdir(testHome, { recursive: true, mode: 0o700 })
  const root = await mkdtemp(join(testHome, 'deepworker-'))
  const bin = join(root, 'bin')
  await mkdir(bin)
  const launch = [
    process.execPath, resolve('node_modules/@deepseek-ai/dsh/lib/bin.js'), 'web',
    '--patch', resolve('environments/development/cordis.patch.yml'),
    '--patch', resolve('environments/test/cordis.patch.yml'),
    '--patch', resolve('environments/test/web.patch.yml'),
  ]
  // The launcher pins test patches even when DeepWorker calls dsh itself.
  await writeFile(join(bin, 'dsh'), '#!/bin/sh\nshift\nexec ' + launch.map(shellQuote).join(' ') + ' "$@"\n', { mode: 0o700 })
  const env = {
    ...Object.fromEntries(Object.entries(process.env).filter(([name]) => !/(KEY|SECRET|TOKEN|PASSWORD)/i.test(name))),
    PATH: [bin, dirname(process.execPath), process.env.PATH].join(delimiter),
    DSH_HOME: join(root, 'home'),
    DSH_AGENTS_HOME: join(root, 'agents'),
    DSH_TELEMETRY_DISABLED: '1',
    DEEPWORKER_HOST: '127.0.0.1',
    DEEPWORKER_PORT: String(await freePort()),
    DEEPWORKER_STATE_DIR: join(root, 'controller'),
    SSH_CONNECTION: '',
    SSH_TTY: '',
  }
  const call = await client(t, root, env)
  let passed = false
  try {
    let started = await call('dsh_start')
    assert.equal(started.started, true, started.apiError ?? started.error)
    const { stdout } = await exec(process.execPath, [resolve(checkout, 'bin/deepworker.js'), 'doctor', '--json'], { env })
    assert.equal(JSON.parse(stdout).ok, true)
    const created = await call('dsh_create_project', { parent: root, name: 'project', title: 'Queue verification' })
    const session_id = created.session.sessionId
    const listed = await call('dsh_list_sessions')
    assert.equal(listed.sessions.some(item => item.sessionId === session_id), true)
    assert.equal(listed.workspaces.some(item => item.path === created.projectPath), true)
    await call('dsh_send', { session_id, message: 'Run the local task queue integration test.' })
    const finished = await call('dsh_wait', { session_id, timeout_sec: 10 })
    assert.equal(finished.state, 'idle')
    assert.match(JSON.stringify(finished.history), /LOCAL_TASK_QUEUE_TEST_OK/)

    for (const outcome of ['allowed-once', 'rejected', 'cancelled']) {
      const { session } = await call('dsh_create_session', { workspace: created.projectPath, title: outcome })
      const session_id = session.sessionId
      await call('dsh_send', { session_id, message: 'Exercise approval' })
      const waiting = await call('dsh_wait', { session_id, timeout_sec: 5 })
      assert.equal(waiting.state, 'approval-required')
      const approval_id = waiting.pendingApprovals[0].payload.approvalId
      const pending = await call('dsh_pending_approvals', { session_id })
      assert.equal(pending.items[0].payload.approvalId, approval_id)
      if (outcome === 'cancelled') await call('dsh_cancel', { session_id })
      else await call('dsh_decide_approval', { approval_id, outcome })
      let history
      for (let attempt = 0; attempt < 30; attempt++) {
        history = await call('dsh_history', { session_id })
        if (history.events.some(event => event.type === 'turn/end')) break
        await delay(100)
      }
      assert.equal(history.events.find(event => event.type === 'approval/decided')?.data.outcome, outcome)
      assert.ok(history.events.some(event => event.type === 'turn/end'))
      assert.deepEqual((await call('dsh_pending_approvals', { session_id })).items, [])
    }

    assert.equal((await call('dsh_stop')).stopped, true)
    const previousPid = started.pid
    started = await call('dsh_start')
    assert.equal(started.started, true, started.apiError ?? started.error)
    assert.notEqual(started.pid, previousPid)
    const restored = await call('dsh_history', { session_id })
    assert.match(JSON.stringify(restored), /LOCAL_TASK_QUEUE_TEST_OK/)
    passed = true
  } finally {
    try { await call('dsh_stop') } finally {
      if (passed) await rm(root, { recursive: true, force: true })
      else console.error('Test evidence retained in ' + root)
    }
  }
})
