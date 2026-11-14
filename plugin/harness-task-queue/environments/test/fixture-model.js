import assert from 'node:assert/strict'
import { LlmAdapter } from '@deepseek-ai/dsh-llm'

export const name = 'local-task-test-model'
export const inject = ['llm']

const title = 'Verify the local queue'
const instructions = 'Exercise the installed plugin via the agent loop.'
const acceptance = 'Read back a completed task with the verification note.'
const note = 'Read back the task through the installed plugin.'

function* toolCall(step, name, args) {
  const id = `local-task-fixture-${step}`
  const argumentsJson = JSON.stringify(args)
  yield { type: 'block-start', index: 0, blockType: 'tool-call' }
  yield { type: 'tool-call-delta', index: 0, id, name, argumentsDelta: argumentsJson }
  yield { type: 'block-end', index: 0, block: { type: 'tool-call', id, name, arguments: argumentsJson } }
  yield { type: 'finish', reason: { kind: 'tool-calls' } }
}

function* finish(text) {
  yield { type: 'block-start', index: 0, blockType: 'text' }
  yield { type: 'text-delta', index: 0, text }
  yield { type: 'block-end', index: 0, block: { type: 'text', text } }
  yield { type: 'finish', reason: { kind: 'stop' } }
}

class FixtureModel extends LlmAdapter {
  async *stream({ messages, tools }) {
    const userMessage = messages.findLast(message => message.role === 'user' && message.source?.kind === 'user')
    if (userMessage?.content[0]?.text === 'Exercise approval') {
      const last = messages.findLast(message => message.role === 'tool')
      if (last) yield* finish(last.content[0].text)
      else yield* toolCall(0, 'test_approval', {})
      return
    }
    const results = messages.filter(message => message.role === 'tool')
      .map(message => JSON.parse(message.content.find(block => block.type === 'text').text))
    const [created, updated, fetched, listed] = results
    for (const suffix of ['create', 'update', 'get', 'list']) {
      assert.ok(tools.some(tool => tool.name === `local_task_${suffix}`), `Missing ${suffix} tool`)
    }
    switch (results.length) {
      case 0:
        yield* toolCall(0, 'local_task_create', { title, instructions, acceptance })
        return
      case 1:
        assert.match(created.id, /^[a-f0-9-]{36}$/)
        assert.equal(created.status, 'pending')
        yield* toolCall(1, 'local_task_update', { id: created.id, status: 'completed', note })
        return
      case 2:
        assert.equal(updated.status, 'completed')
        yield* toolCall(2, 'local_task_get', { id: created.id })
        return
      case 3:
        assert.equal(fetched.instructions, instructions)
        assert.equal(fetched.acceptance, acceptance)
        assert.equal(fetched.note, note)
        yield* toolCall(3, 'local_task_list', { status: 'completed' })
        return
      case 4: {
        assert.deepEqual(listed, [{ id: created.id, title, status: 'completed' }])
        yield* finish('LOCAL_TASK_QUEUE_TEST_OK')
        return
      }
      default:
        throw new Error('Unexpected extra tool calls')
    }
  }
}

export function apply(ctx) {
  ctx.llm.registerAdapter(['local-task-test'], new FixtureModel())
}
