import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'test-approval'
export const inject = ['tools', 'approval']

export function apply(ctx) {
  ctx.tools.register(defineTool({
    name: 'test_approval',
    description: 'Request approval for a harmless test operation.',
    parameters: {},
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    execute(_args, execution) {
      return ctx.approval.request({
        agent: execution.agent,
        toolName: 'test_approval',
        reason: 'Integration test',
        signal: execution.signal,
      })
    },
  }))
}
