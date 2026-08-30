// Public API surface for deepworker.

export { TOOLS } from "./tools-schema.js";
export { dispatch, compactHistory } from "./tools.js";
export { handleEnvelope, serve } from "./server.js";
export { VERSION } from "./version.js";
export { EventMonitor } from "./events.js";
export { post, respond, DshApiError } from "./rpc.js";
export {
  startWeb,
  stopWeb,
  status,
  webArgv,
  supportsNoOpen,
  ownedPid,
  processAlive,
  portOpen,
} from "./lifecycle.js";
export {
  requireAbsoluteDir,
  requireExistingDir,
  validateProjectName,
  bounded,
} from "./validate.js";
