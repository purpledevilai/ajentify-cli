import { resolve } from "node:path";

import { postDeploy } from "../api/client.js";
import { findApiKey } from "../env/findApiKey.js";
import { AjentifyError } from "../errors.js";
import { loadManifest } from "../manifest/load.js";
import { resolveManifest } from "../manifest/resolve.js";
import { STAGE_NAME_PATTERN, type DeployResponse } from "../manifest/types.js";
import { printDeployResponse } from "../ui/printPlan.js";

export interface DeployOptions {
  /** Stage name to deploy into. Validated against STAGE_NAME_PATTERN. */
  stage: string;
  /** Manifest file path. Defaults to ./ajentify.json relative to cwd. */
  manifestPath?: string;
  /** Dry-run via POST /deploy/plan. */
  plan?: boolean;
  /** Pin a specific org. Defaults to the API key's first org. */
  orgId?: string;
  /** Override API key resolution. */
  apiKey?: string;
  /** Override server base URL. */
  baseUrl?: string;
  /** Override fetch (for tests). */
  fetchImpl?: typeof fetch;
  /** Sink for printed plan output. */
  log?: (line: string) => void;
}

/**
 * High-level orchestration for `ajentify deploy <stage>`:
 *
 *   load manifest -> resolve file refs -> POST /deploy(/plan) -> print response
 *
 * Returns the parsed DeployResponse so callers / tests can inspect it. The
 * pretty-print happens as a side effect through `log`.
 */
export async function deployStage(options: DeployOptions): Promise<DeployResponse> {
  if (!STAGE_NAME_PATTERN.test(options.stage)) {
    throw new AjentifyError(
      `Invalid stage '${options.stage}'. Must match ${STAGE_NAME_PATTERN.source}.`,
    );
  }

  const manifestPath = resolve(options.manifestPath ?? "ajentify.json");
  const loaded = await loadManifest(manifestPath);
  const wire = await resolveManifest(loaded.manifest, { baseDir: loaded.dir });

  const apiKey = options.apiKey ?? findApiKey({ startDir: loaded.dir });

  const response = await postDeploy({
    apiKey,
    stage: options.stage,
    manifest: wire,
    plan: options.plan ?? false,
    ...(options.orgId !== undefined ? { orgId: options.orgId } : {}),
    ...(options.baseUrl !== undefined ? { baseUrl: options.baseUrl } : {}),
    ...(options.fetchImpl !== undefined ? { fetchImpl: options.fetchImpl } : {}),
  });

  printDeployResponse(response, {
    plan: options.plan ?? false,
    ...(options.log !== undefined ? { log: options.log } : {}),
  });
  return response;
}
