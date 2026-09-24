/**
 * Public programmatic API for the `ajentify` package.
 *
 * Anything used by downstream tools (custom deploy scripts, CI integrations,
 * higher-level workflow tools) is re-exported here. The CLI in `cli.ts` is
 * intentionally a thin layer over these primitives.
 */

export { AjentifyError } from "./errors.js";

export { loadManifest } from "./manifest/load.js";
export type { LoadedManifest } from "./manifest/load.js";

export { resolveManifest } from "./manifest/resolve.js";
export type { ResolveOptions } from "./manifest/resolve.js";

export {
  LOGICAL_NAME_PATTERN,
  STAGE_NAME_PATTERN,
} from "./manifest/types.js";
export type {
  AgentOnDisk,
  AgentWire,
  DeployRequest,
  DeployResponse,
  JsonSchema,
  ManifestOnDisk,
  ManifestWire,
  ResourceOp,
  SREOnDisk,
  SREWire,
  ToolOnDisk,
  ToolWire,
} from "./manifest/types.js";

export { loadZodSchemaAsJsonSchema, parseSchemaRef } from "./schema/zodLoader.js";

export { postDeploy, DEFAULT_BASE_URL } from "./api/client.js";
export type { PostDeployArgs } from "./api/client.js";

export { findApiKey, findDotenv, parseDotenv } from "./env/findApiKey.js";
export type { FindApiKeyOptions } from "./env/findApiKey.js";

export { deployStage } from "./commands/deploy.js";
export type { DeployOptions } from "./commands/deploy.js";

export { init, ensureGitignoreEntries } from "./commands/init.js";
export type { InitOptions, GitignoreUpdate } from "./commands/init.js";

export { printDeployResponse } from "./ui/printPlan.js";
export type { PrintPlanOptions } from "./ui/printPlan.js";
