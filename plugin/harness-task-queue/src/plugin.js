import { homedir } from 'node:os'
import { join } from 'node:path'
import { defineTool, ToolArgsError } from '@deepseek-ai/dsh-tools'
import { openQueue, statuses } from './queue.js'

export const name = 'local-task-queue'
export const inject = ['tools']

const taskId = { type: 'string', required: true, description: 'Task ID returned by create or list.' }
const status = { type: 'string', enum: statuses }

export function apply(ctx) {
  const dshHome = process.env.DSH_HOME || join(homedir(), '.dsh')
  const queue = openQueue(join(dshHome, 'local-task-queue', 'tasks.sqlite'))
  ctx.effect(() => () => queue.close(), 'local-task-queue.close')

  function register(name, description, parameters, action) {
    ctx.tools.register(defineTool({
      name,
      description,
      parameters,
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      async execute(args) {
        try {
          return JSON.stringify(action(args))
        } catch (error) {
          if (error instanceof RangeError) throw new ToolArgsError([error.message])
          throw error
        }
      },
    }))
  }

  register('local_task_create', 'Save a task for later execution. Include measurable acceptance criteria.', {
    title: { type: 'string', required: true },
    instructions: { type: 'string', required: true },
    acceptance: { type: 'string', required: true },
  }, ({ title, instructions, acceptance }) => {
    const { id, status } = queue.create({ title, instructions, acceptance })
    return { id, title: title.trim(), status }
  })

  register('local_task_list', 'List recent local task summaries, optionally filtered by status.', {
    status,
    limit: { type: 'integer', description: '1 to 50. Default 10.' },
    offset: { type: 'integer', description: 'Number of matching tasks to skip. Default 0.' },
  }, args => queue.list(args))

  register('local_task_get', 'Read a task, its instructions, acceptance criteria and latest status note.', {
    id: taskId,
  }, ({ id }) => queue.get(id) ?? { error: 'Task not found', id })

  register('local_task_update', 'Update a task status. When completed, record the verification result. When blocked, record what is blocking it.', {
    id: taskId,
    status: { ...status, required: true },
    note: { type: 'string', description: 'Verification result or blocker. Required for completed and blocked.' },
  }, args => queue.update(args) ?? { error: 'Task not found', id: args.id })
}
