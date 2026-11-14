import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { openQueue } from '../src/queue.js'

const task = { title: 'Check the docs', instructions: 'Review the example.', acceptance: 'The example runs.' }

test('persists tasks across connections and filters / paginates results', t => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-queue-'))
  const path = join(dir, 'tasks.sqlite')
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const first = openQueue(path)
  const saved = first.create(task)
  assert.equal(saved.status, 'pending')
  first.close()

  const second = openQueue(path)
  try {
    const next = second.create({ ...task, title: 'Check the examples' })
    assert.equal(second.list({ limit: 1 })[0].id, next.id)
    assert.equal(second.list({ limit: 1, offset: 1 })[0].id, saved.id)
    second.update({ id: saved.id, status: 'completed', note: 'Example passed.' })
    assert.equal(second.get(saved.id).acceptance, task.acceptance)
    assert.equal(second.get(saved.id).note, 'Example passed.')
    assert.deepEqual(second.list({ status: 'completed' }).map(row => row.id), [saved.id])
  } finally {
    second.close()
  }
})

test('validates input and reports missing tasks', () => {
  const queue = openQueue(':memory:')
  try {
    assert.throws(() => queue.create({ ...task, title: ' ' }), /title/)
    const { id } = queue.create(task)
    assert.throws(() => queue.update({ id, status: 'completed' }), /note/)
    assert.throws(() => queue.update({ id, status: 'blocked', note: ' ' }), /note/)
    assert.throws(() => queue.list({ status: 'missing' }), /status/)
    assert.throws(() => queue.list({ limit: 51 }), /limit/)
    assert.equal(queue.get(id).status, 'pending')
    assert.equal(queue.get('missing'), null)
    assert.equal(queue.update({ id: 'missing', status: 'pending' }), null)
  } finally {
    queue.close()
  }
})
