// The 12 dsh_* MCP tool definitions, mirroring the reference Python
// implementation's tool set and JSON schemas.

export const TOOLS = [
  {
    name: "dsh_status",
    description: "Read DSH process, API, and bidirectional event-stream status.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
  {
    name: "dsh_start",
    description: "Start DSH Web as a protocol host without opening a browser.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "dsh_stop",
    description: "Stop only a DSH process started by this plugin.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { destructiveHint: true },
  },
  {
    name: "dsh_create_project",
    description:
      "Create one project directory through DSH Host, register it as a workspace, and create a new DSH session.",
    inputSchema: {
      type: "object",
      required: ["parent", "name"],
      properties: {
        parent: { type: "string" },
        name: { type: "string" },
        agent_preset: { type: "string", default: "standard" },
        title: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "dsh_create_session",
    description: "Register an existing project path as a DSH workspace and create a fresh conversation.",
    inputSchema: {
      type: "object",
      required: ["workspace"],
      properties: {
        workspace: { type: "string" },
        agent_preset: { type: "string", default: "standard" },
        title: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "dsh_list_sessions",
    description: "List DSH workspaces and durable sessions with running state.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
  {
    name: "dsh_send",
    description:
      "Send a planning-approved implementation brief or follow-up to a DSH session over the local API.",
    inputSchema: {
      type: "object",
      required: ["session_id", "message"],
      properties: {
        session_id: { type: "string" },
        message: { type: "string" },
        mode: { type: "string", enum: ["queue", "steer"], default: "queue" },
      },
      additionalProperties: false,
    },
    annotations: { openWorldHint: true },
  },
  {
    name: "dsh_wait",
    description: "Wait up to 60 seconds for completion or a pending approval; returns history or recent events.",
    inputSchema: {
      type: "object",
      required: ["session_id"],
      properties: {
        session_id: { type: "string" },
        timeout_sec: { type: "integer", minimum: 0, maximum: 60, default: 30 },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: "dsh_history",
    description: "Read bounded durable event history for review and verification.",
    inputSchema: {
      type: "object",
      required: ["session_id"],
      properties: {
        session_id: { type: "string" },
        max_messages: { type: "integer", minimum: 1, maximum: 100, default: 30 },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: "dsh_pending_approvals",
    description: "List unanswered DSH approval requests including rpcId, tool, callId, and reason.",
    inputSchema: {
      type: "object",
      properties: { session_id: { type: "string" } },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: "dsh_decide_approval",
    description:
      "Allow once or reject one exact pending DSH approval. Review history and effects before calling.",
    inputSchema: {
      type: "object",
      required: ["approval_id", "outcome"],
      properties: {
        approval_id: { type: "string" },
        outcome: { type: "string", enum: ["allowed-once", "rejected"] },
      },
      additionalProperties: false,
    },
    annotations: { destructiveHint: true },
  },
  {
    name: "dsh_cancel",
    description: "Cancel active work in one DSH session.",
    inputSchema: {
      type: "object",
      required: ["session_id"],
      properties: { session_id: { type: "string" } },
      additionalProperties: false,
    },
    annotations: { destructiveHint: true },
  },
];
