---
name: orchestrate-dsh
description: Use DeepSeek Harness as an implementation agent over its local protocol when Codex should plan, create a project or conversation, delegate execution, review DSH approval requests, verify changes, and provide a retrospective. Do not use browser UI automation for this workflow.
---

# Orchestrate DSH

Codex is lead engineer; DSH is the implementation agent. Use only the `dsh_*` protocol tools from this plugin, never browser clicking.

1. Inspect the target repository and decide architecture, file scope, risks, tests, and acceptance criteria locally.
2. Use `dsh_create_project` for a new directory or `dsh_create_session` for an existing project. Give DSH the narrowest project root and use one session per bounded goal.
3. Send a self-contained brief with `dsh_send`: goal, exact workspace, decided interfaces, allowed and forbidden files, edge cases, tests, and stopping condition. Do not send secrets or unrelated private context.
4. Use `dsh_wait` to observe completion or an approval request. Use `dsh_history` to inspect actual tool calls, results, and assistant output. DSH claims are proposals, not proof.
5. Before `dsh_decide_approval`, inspect the request plus its matching call in history. Allow once only when the exact action is necessary, scoped to the user's project, concrete, reversible or ordinary implementation work, and verifiable. Reject overbroad, destructive, credential-seeking, unrelated, or externally consequential actions. The user's request for Codex supervision is not blanket authorization where current policy requires fresh confirmation.
6. When the turn becomes idle, inspect the filesystem diff and changed files locally and run proportionate checks. Send one precise repair turn when the architecture remains valid; otherwise stop and re-plan.
7. Report the DSH session, plan, approval decisions, changes, verification, outcome, and remaining uncertainty.

Do not run overlapping DSH sessions against the same files. Preserve user changes. Never accept persistent/global permissions when one-time approval is sufficient.
